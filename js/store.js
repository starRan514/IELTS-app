// 本地状态 + 云端同步（双模式）
// 未配置 Supabase 或未登录 → 纯本地 localStorage
// 已登录 → 本地读（快）+ 异步推云端（不阻塞 UI）
// 同步读 API 不变，所有模块无需大改

import * as supabase from './supabase.js';

const KEY = 'ielts-app-v1';

const DEFAULT_STATE = {
  settings: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    ttsVoiceURI: '',
    ttsRate: 1,
  },
  progress: {},          // { [`${mod}${week}`]: {done, at, score} }
  vocab: [],             // SRS 卡片
  drafts: {},            // 写作草稿 { [`w${week}`|`t1-${id}`]: text }
  customs: [],           // 导入的自定义材料
  speakLog: [],          // 口语练习记录（暂不上云）
};

let state = load();
let cloudReady = false;  // supabase 已配置且已登录
let cloudUser = null;    // { id, email }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---------- 云端同步初始化 ----------
// app.js 启动时调用一次：注册 auth 回调，发现已有 session 自动 sync
export async function initCloudSync() {
  if (!supabase.getConfig()) return;  // 未配置，纯本地模式
  try {
    supabase.onAuthState(handleAuthChange);
    const session = await supabase.getSession();
    if (session?.user) {
      cloudReady = true;
      cloudUser = { id: session.user.id, email: session.user.email };
    }
  } catch (err) {
    console.warn('[cloud] init failed:', err.message);
  }
}

async function handleAuthChange(session) {
  if (session?.user) {
    cloudReady = true;
    cloudUser = { id: session.user.id, email: session.user.email };
  } else {
    cloudReady = false;
    cloudUser = null;
  }
  // 通知 UI（顶栏显示登录状态）
  window.dispatchEvent(new CustomEvent('auth-change', { detail: cloudUser }));
}

export function isCloudReady() { return cloudReady; }
export function getCurrentUser() { return cloudUser; }

// ---------- 从云端拉数据并合并到本地 ----------
// 首次登录后调用：本地 + 云端 merge，不丢任何数据
export async function syncFromCloud() {
  if (!cloudReady) return null;
  const cloud = await supabase.pull();
  if (!cloud) return null;

  const before = {
    vocab: state.vocab.length,
    drafts: Object.keys(state.drafts).length,
    progress: Object.keys(state.progress).length,
    customs: state.customs.length,
  };

  // settings: 合并云端到本地，但保留本地 apiKey；本地独有则推到云端
  if (cloud.settings) {
    const localApiKey = state.settings.apiKey;
    state.settings = { ...state.settings, ...cloud.settings, apiKey: localApiKey };
  } else {
    // 新用户：把本地非密设置推到云端
    try { await supabase.pushSettings(cloudSettingsWithoutKey()); }
    catch (e) { console.warn(e.message); }
  }

  // progress: 按 mod+week 合并，prefer 更新的 at
  for (const p of cloud.progress) {
    const k = `${p.mod}${p.week}`;
    const local = state.progress[k];
    if (!local || new Date(p.at) > new Date(local.at || 0)) {
      state.progress[k] = { done: p.done, score: p.score, at: p.at };
    }
  }

  // vocab: 按 id 合并，prefer 云端（更新）
  const vocabMap = new Map(state.vocab.map(c => [c.id, c]));
  const newCards = [];
  for (const cv of cloud.vocab) {
    const local = vocabMap.get(cv.id);
    if (!local) {
      // 云端独有：加到本地
      state.vocab.push(fromCloudVocab(cv));
      newCards.push(cv);
    } else {
      // 两边都有：取 mnemonicAt 更新的
      if ((cv.mnemonic_at || 0) > (local.mnemonicAt || 0)) {
        Object.assign(local, fromCloudVocab(cv));
      }
    }
  }
  // 推本地独有到云端
  const localOnlyCards = state.vocab.filter(c => !cloud.vocab.some(cv => cv.id === c.id));
  if (localOnlyCards.length) {
    try { await supabase.pushVocab(localOnlyCards); } catch (e) { console.warn(e.message); }
  }

  // drafts: 按 key 合并，prefer 云端 updated_at 更新的
  for (const d of cloud.drafts) {
    const local = state.drafts[d.key];
    if (!local || !local.updatedAt ||
      new Date(d.updated_at) > new Date(local.updatedAt)) {
      state.drafts[d.key] = { text: d.text, updatedAt: d.updated_at };
    }
  }
  // 推本地独有草稿
  const localOnlyDrafts = Object.entries(state.drafts)
    .filter(([k, v]) => !cloud.drafts.some(d => d.key === k));
  for (const [k, v] of localOnlyDrafts) {
    try { await supabase.pushDraft(k, v.text); } catch (e) { console.warn(e.message); }
  }

  // customs: 按 id 合并
  const customsMap = new Map(state.customs.map(m => [m.id, m]));
  for (const cm of cloud.customs) {
    if (!customsMap.has(cm.id)) state.customs.push(fromCloudCustom(cm));
  }
  const localOnlyCustoms = state.customs.filter(m => !cloud.customs.some(cm => cm.id === m.id));
  if (localOnlyCustoms.length) {
    try { await supabase.pushCustoms(localOnlyCustoms); } catch (e) { console.warn(e.message); }
  }

  // 推本地独有 progress 到云端
  const localOnlyProgress = Object.entries(state.progress)
    .filter(([k]) => !cloud.progress.some(p => `${p.mod}${p.week}` === k));
  for (const [k, v] of localOnlyProgress) {
    const mod = k[0], week = Number(k.slice(1));
    try { await supabase.pushProgress(mod, week, v); } catch (e) { console.warn(e.message); }
  }

  save();
  window.dispatchEvent(new CustomEvent('store-synced'));

  return {
    before,
    after: {
      vocab: state.vocab.length,
      drafts: Object.keys(state.drafts).length,
      progress: Object.keys(state.progress).length,
      customs: state.customs.length,
    },
  };
}

function fromCloudVocab(cv) {
  return {
    id: cv.id,
    term: cv.term,
    context: cv.context || '',
    source: cv.source || '',
    week: cv.week,
    meaning: cv.meaning || '',
    mnemonic: cv.mnemonic || '',
    association: cv.association || '',
    example: cv.example || '',
    mnemonicAt: cv.mnemonic_at || null,
    reps: cv.reps || 0,
    ease: cv.ease || 2.3,
    interval: cv.interval || 0,
    due: cv.due || 0,
    lapses: cv.lapses || 0,
  };
}

function fromCloudCustom(cm) {
  return {
    id: cm.id,
    name: cm.name,
    type: cm.type,
    size: cm.size,
    text: cm.text,
    chars: cm.chars,
    importedAt: cm.imported_at,
  };
}

// 设置（含 apiKey）改云端（apiKey 不推云端，留在本地）
function cloudSettingsWithoutKey() {
  const { apiKey, ...rest } = state.settings;
  return rest;
}

// 异步推云端（失败静默，控制台告警）
async function safePush(promise) {
  try { await promise; }
  catch (e) { console.warn('[cloud] push failed:', e.message); }
}

// ---------- 公开 API（保留同步读，写时同时推云端）----------
export function getState() { return state; }

export function getSettings() { return { ...DEFAULT_STATE.settings, ...state.settings }; }

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
  if (cloudReady) safePush(supabase.pushSettings(cloudSettingsWithoutKey()));
}

// ---------- 进度 ----------
export function markDone(mod, week, extra = {}) {
  const row = { done: true, at: new Date().toISOString(), ...extra };
  state.progress[`${mod}${week}`] = row;
  save();
  if (cloudReady) safePush(supabase.pushProgress(mod, week, row));
}

export function isDone(mod, week) {
  return !!state.progress[`${mod}${week}`]?.done;
}

export function weekProgress(week) {
  return ['r', 'l', 'w', 's'].filter(m => isDone(m, week)).length;
}

export function moduleDoneCount(mod, total = 28) {
  return Array.from({ length: total }, (_, i) => isDone(mod, i + 1)).filter(Boolean).length;
}

// ---------- 写作草稿 ----------
export function getDraft(id) {
  const v = state.drafts[id];
  return typeof v === 'string' ? v : (v?.text || '');
}

export function setDraft(id, text) {
  const updatedAt = new Date().toISOString();
  state.drafts[id] = { text, updatedAt };
  save();
  if (cloudReady) safePush(supabase.pushDraft(id, text));
}

// ---------- 单词卡（SM-2 简化版）----------
// 从阅读词块批量建卡（不重复）
export function ensureChunkCards(items) {
  const exist = new Set(state.vocab.map(c => c.term.toLowerCase()));
  const added = [];
  for (const it of items) {
    const term = it.term.trim();
    if (!term || exist.has(term.toLowerCase())) continue;
    exist.add(term.toLowerCase());
    const card = {
      id: crypto.randomUUID(),
      term,
      context: it.context || '',
      source: it.source || `Week ${it.week}`,
      week: it.week || null,
      meaning: '', mnemonic: '', association: '', example: '',
      mnemonicAt: null,
      reps: 0, ease: 2.3, interval: 0, due: 0, lapses: 0,
    };
    state.vocab.push(card);
    added.push(card);
  }
  if (added.length) {
    save();
    if (cloudReady) safePush(supabase.pushVocab(added));
  }
  return added.length;
}

export function addCustomCard(term, meaning = '', context = '') {
  if (state.vocab.some(c => c.term.toLowerCase() === term.trim().toLowerCase())) return false;
  const card = {
    id: crypto.randomUUID(),
    term: term.trim(), context, source: '自定义', week: null,
    meaning, mnemonic: '', association: '', example: '',
    mnemonicAt: meaning ? Date.now() : null,
    reps: 0, ease: 2.3, interval: 0, due: 0, lapses: 0,
  };
  state.vocab.push(card);
  save();
  if (cloudReady) safePush(supabase.pushVocab([card]));
  return true;
}

export function setCardMnemonic(id, m) {
  const c = state.vocab.find(x => x.id === id);
  if (!c) return;
  Object.assign(c, {
    meaning: m.meaning || c.meaning,
    mnemonic: m.mnemonic || '',
    association: m.association || '',
    example: m.example || c.example,
    mnemonicAt: Date.now(),
  });
  save();
  if (cloudReady) safePush(supabase.pushVocab([c]));
}

// rating: 0=忘了 1=模糊 2=认识
export function reviewCard(id, rating) {
  const c = state.vocab.find(x => x.id === id);
  if (!c) return;
  c.reps++;
  if (rating === 0) {
    c.lapses++;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    if (rating === 1) c.ease = Math.max(1.3, c.ease - 0.15);
    if (rating === 2 && c.reps > 1) c.ease = Math.min(2.8, c.ease + 0.1);
    c.interval = c.interval === 0 ? (rating === 2 ? 2 : 1)
      : Math.round(c.interval * (rating === 2 ? c.ease : 1.2));
    if (c.interval < 1) c.interval = 1;
  }
  c.due = Date.now() + c.interval * 86400000;
  save();
  if (cloudReady) safePush(supabase.pushVocab([c]));
}

export function getDueCards(now = Date.now()) {
  return state.vocab
    .filter(c => c.due <= now)
    .sort((a, b) => a.due - b.due);
}

export function getNewCards() {
  return state.vocab.filter(c => c.reps === 0);
}

export function getCard(id) { return state.vocab.find(c => c.id === id); }

// ---------- 导入材料 ----------
export function addCustom(mat) {
  const m = { id: crypto.randomUUID(), importedAt: new Date().toISOString(), ...mat };
  state.customs.push(m);
  save();
  if (cloudReady) safePush(supabase.pushCustoms([m]));
  return state.customs[state.customs.length - 1];
}

export function removeCustom(id) {
  state.customs = state.customs.filter(m => m.id !== id);
  save();
  if (cloudReady) safePush(supabase.deleteCustoms([id]));
}
