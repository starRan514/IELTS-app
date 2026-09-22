// Supabase 客户端封装：邮箱登录 + 按用户隔离的数据读写
// 用官方 supabase-js ESM CDN（运行时加载，无需打包）
// 配置存 localStorage 一次填好；未配置则回退到纯本地模式

const CONFIG_KEY = 'ielts-supabase-cfg';

let client = null;        // Supabase 客户端实例（配置后才有）
let cfgCache = null;      // { url, anonKey }
let authCb = null;         // 单一 auth 回调（store.js 注册）

// ---------- 配置 ----------
export function getConfig() {
  if (cfgCache) return cfgCache;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    cfgCache = JSON.parse(raw);
    return cfgCache;
  } catch { return null; }
}

export async function setConfig(url, anonKey) {
  const cfg = { url: url.trim(), anonKey: anonKey.trim() };
  if (!cfg.url || !cfg.anonKey) throw new Error('URL 和 anon key 都必填');
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  cfgCache = cfg;
  client = null; // 重置以便重新创建
  await getClient();
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  cfgCache = null;
  client = null;
}

// 懒加载官方 SDK 并创建客户端
export async function getClient() {
  if (client) return client;
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.4.1/+esm');
    client = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    // 注册 auth 回调
    if (authCb) client.auth.onAuthStateChange((_e, session) => authCb(session));
    return client;
  } catch (err) {
    throw new Error('Supabase SDK 加载失败（需联网首次加载）：' + err.message);
  }
}

// ---------- Auth ----------
export async function getSession() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session || null;
}

export async function getUser() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data.user || null;
}

export async function signUp(email, password) {
  const c = await getClient();
  if (!c) throw new Error('未配置 Supabase');
  const { data, error } = await c.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: location.origin },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email, password) {
  const c = await getClient();
  if (!c) throw new Error('未配置 Supabase');
  const { data, error } = await c.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const c = await getClient();
  if (!c) return;
  await c.auth.signOut();
}

// 注册 auth 状态变化回调（store.js 在启动时调用一次）
export function onAuthState(cb) {
  authCb = cb;
}

// ---------- 数据读写 ----------
// 设计：每张表都按 user_id 隔离（RLS），客户端只查自己的行
// pull() 一次性把用户的所有云端数据拉下来，返回 { settings, progress, vocab, drafts, customs }
export async function pull() {
  const c = await getClient();
  if (!c) return null;
  const uid = (await getUser())?.id;
  if (!uid) return null;

  const [settings, progress, vocab, drafts, customs] = await Promise.all([
    c.from('profiles').select('settings').eq('id', uid).maybeSingle(),
    c.from('progress').select('mod,week,done,score,at'),
    c.from('vocab').select('*'),
    c.from('drafts').select('key,text,updated_at'),
    c.from('customs').select('*'),
  ]);

  // 错误统一抛出（RLS 未配置会全失败）
  for (const r of [settings, progress, vocab, drafts, customs]) {
    if (r.error) throw new Error('拉取数据失败：' + r.error.message);
  }

  return {
    settings: settings.data?.settings || null,
    progress: progress.data || [],
    vocab: vocab.data || [],
    drafts: drafts.data || [],
    customs: customs.data || [],
  };
}

// 写 settings 到 profiles 表（upsert）
export async function pushSettings(settings) {
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const { error } = await c.from('profiles').upsert({
    id: uid,
    settings,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('保存设置失败：' + error.message);
}

// 写进度（progress 表 upsert 复合主键）
export async function pushProgress(mod, week, row) {
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const { error } = await c.from('progress').upsert({
    user_id: uid, mod, week,
    done: row.done, score: row.score, at: row.at,
  });
  if (error) throw new Error('保存进度失败：' + error.message);
}

// 写草稿（drafts 表 upsert）
export async function pushDraft(key, text) {
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const { error } = await c.from('drafts').upsert({
    user_id: uid, key, text, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('保存草稿失败：' + error.message);
}

// 单词卡批量 upsert（vocab 表）
export async function pushVocab(cards) {
  if (!cards?.length) return;
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const rows = cards.map(card => ({
    id: card.id,
    user_id: uid,
    term: card.term,
    context: card.context || '',
    source: card.source || '',
    week: card.week,
    meaning: card.meaning || '',
    mnemonic: card.mnemonic || '',
    association: card.association || '',
    example: card.example || '',
    mnemonic_at: card.mnemonicAt || null,
    reps: card.reps || 0,
    ease: card.ease || 2.3,
    interval: card.interval || 0,
    due: card.due || 0,
    lapses: card.lapses || 0,
  }));
  const { error } = await c.from('vocab').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error('保存单词卡失败：' + error.message);
}

// 删除单词卡
export async function deleteVocab(ids) {
  if (!ids?.length) return;
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const { error } = await c.from('vocab').delete().in('id', ids);
  if (error) throw new Error('删除单词卡失败：' + error.message);
}

// 自定义材料批量 upsert
export async function pushCustoms(items) {
  if (!items?.length) return;
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const rows = items.map(it => ({
    id: it.id,
    user_id: uid,
    name: it.name,
    type: it.type || '',
    size: it.size || 0,
    text: it.text || '',
    chars: it.chars || 0,
    imported_at: it.importedAt || new Date().toISOString(),
  }));
  const { error } = await c.from('customs').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error('保存材料失败：' + error.message);
}

export async function deleteCustoms(ids) {
  if (!ids?.length) return;
  const c = await getClient();
  const uid = (await getUser())?.id;
  if (!c || !uid) return;
  const { error } = await c.from('customs').delete().in('id', ids);
  if (error) throw new Error('删除材料失败：' + error.message);
}
