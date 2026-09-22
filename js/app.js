// 哈希路由 + 页面挂载
import * as Home from './modules/home.js';
import * as Reading from './modules/reading.js';
import * as Listening from './modules/listening.js';
import * as Writing from './modules/writing.js';
import * as Speaking from './modules/speaking.js';
import * as Vocab from './modules/vocab.js';
import * as Settings from './modules/settings.js';
import * as Importer from './modules/importer.js';
import * as Auth from './modules/auth.js';
import * as tts from './tts.js';
import { getSettings, initCloudSync, getCurrentUser } from './store.js';

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const backBtn = document.getElementById('back-btn');
const jumpBtn = document.getElementById('week-jump-btn');
const authBtn = document.getElementById('auth-btn');
const TITLES = {
  home: '雅思 28 周', vocab: '单词背诵卡', import: '导入材料', settings: '设置',
  reading: '阅读', listening: '听力', writing: '写作', speaking: '口语', auth: '账号',
};
const TAB_MODULES = new Set(['home', 'vocab', 'import', 'settings']);

let cleanup = null;
let jumpTarget = null;

export function go(hash) { location.hash = hash; }

export function toast(msg, ms = 2200) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

// 周数快速跳转
export function enableWeekJump(moduleName) {
  jumpTarget = moduleName;
  jumpBtn.hidden = false;
}
function disableWeekJump() {
  jumpTarget = null;
  jumpBtn.hidden = true;
}
jumpBtn.addEventListener('click', () => {
  if (!jumpTarget) return;
  const s = prompt('输入周数 1-28：');
  const w = parseInt(s, 10);
  if (w >= 1 && w <= 28) go(`#/${jumpTarget}/${w}`);
});

// 顶栏账号按钮：未登录跳到 #/auth，已登录跳到 #/settings
function refreshAuthBtn() {
  const user = getCurrentUser();
  if (user) {
    authBtn.textContent = user.email[0].toUpperCase();
    authBtn.title = user.email;
    authBtn.classList.add('logged-in');
  } else {
    authBtn.textContent = '👤';
    authBtn.title = '登录';
    authBtn.classList.remove('logged-in');
  }
}
authBtn.addEventListener('click', () => {
  location.hash = getCurrentUser() ? '#/settings' : '#/auth';
});
window.addEventListener('auth-change', refreshAuthBtn);

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  const [path, ...rest] = hash.split('/').filter(Boolean);
  return { mod: path || 'home', param: rest[0] || null };
}

async function render() {
  const s = getSettings();
  tts.configure({ voiceURI: s.ttsVoiceURI, rate: s.ttsRate });
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} cleanup = null; }
  view.innerHTML = '';
  const { mod, param } = parseRoute();
  titleEl.textContent = TITLES[mod] || '雅思学习';
  document.querySelectorAll('#tabbar a').forEach(a =>
    a.classList.toggle('active', a.dataset.tab === mod));
  backBtn.hidden = TAB_MODULES.has(mod) && !param;
  disableWeekJump();

  const ctx = { view, param, go, toast, enableWeekJump };
  switch (mod) {
    case 'home': cleanup = await Home.render(ctx); break;
    case 'reading': cleanup = await Reading.render(ctx); break;
    case 'listening': cleanup = await Listening.render(ctx); break;
    case 'writing': cleanup = await Writing.render(ctx); break;
    case 'speaking': cleanup = await Speaking.render(ctx); break;
    case 'vocab': cleanup = await Vocab.render(ctx); break;
    case 'import': cleanup = await Importer.render(ctx); break;
    case 'settings': cleanup = await Settings.render(ctx); break;
    case 'auth': cleanup = await Auth.render(ctx); break;
    default: go('#/home');
  }
}

backBtn.addEventListener('click', () => history.back());
window.addEventListener('hashchange', render);

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 启动时初始化云端同步（未配置则纯本地）
initCloudSync().finally(() => {
  refreshAuthBtn();
  render();
});
