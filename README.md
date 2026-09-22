# 雅思 28 周 PWA · 从零搭建指导

<div align="center">

🚀 **在线 Demo**：[ielts-app-9mc.pages.dev](https://ielts-app-9mc.pages.dev)  
📦 **源码仓库**：[github.com/starRan514/IELTS-app](https://github.com/starRan514/IELTS-app)  
🤖 **AI 后端**：DeepSeek · ☁️ **云同步**：Supabase · 🌐 **托管**：Cloudflare Pages

</div>

> 本文档记录如何从零搭建一个像 [ielts-app-9mc.pages.dev](https://ielts-app-9mc.pages.dev/) 这样的雅思学习 PWA：邮箱登录、跨设备云同步、AI 口语考官、TTS 听力朗读、SM-2 单词卡。零打包、零后端、零运维成本。

---

## 0. 最终成品是什么

一个纯前端的 PWA 网页应用，具备：

| 模块 | 功能 |
|---|---|
| 🏠 首页 | 28 周进度总览、四科完成度、周次快速跳转 |
| 📖 阅读 | 28 篇学术文章翻页阅读、核心词块一键入卡 |
| 🎧 听力 | 28 套 Section 4 风格独白、TTS 朗读、逐句精听、对答案 |
| ✍️ 写作 | 28 Task2 + 8 Task1、分页题目引导、AI 反馈 |
| 🗣️ 口语 | AI 考官实时对练（Part 1→2→3）、语音识别、Band 评分 |
| 🃏 单词 | SM-2 间隔重复、AI 生成联想记忆（词根+画面+例句） |
| 📥 导入 | 自定义 TXT/MD/DOCX/PDF 材料入库 |
| ⚙️ 设置 | Supabase 配置、AI Key、TTS 语音选择、数据导出 |
| 👤 账号 | 邮箱+密码登录、本地→云端自动合并迁移 |

**技术栈一句话**：Vanilla JS ES Modules + Supabase + Cloudflare Pages + DeepSeek API + Web Speech API。无 React、无 Vue、无 Webpack、无 npm 依赖。

---

## 1. 技术选型与理由

| 层 | 选型 | 为什么不用别的 |
|---|---|---|
| 前端框架 | 原生 ES Modules + 哈希路由 | PWA 单页应用体量小，框架会带来打包配置和体积负担；原生 JS 模块化足够清晰 |
| UI 样式 | 单个 `style.css` + CSS 变量 | 不引入 Tailwind/UI 库，保持离线可用的自我封闭 |
| 本地存储 | `localStorage` 单 key JSON | 简单可靠，未登录用户的纯本地模式 |
| 云数据库 | Supabase（Postgres + RLS） | 免费档够用、自带邮箱登录、JS SDK 走 ESM CDN 无需打包 |
| AI 后端 | DeepSeek API（OpenAI 兼容） | 1 元起充、国内可直连、`deepseek-chat` 模型质量足够 |
| TTS | Web Speech API（浏览器原生） | 零成本，Edge 在线语音质量已接近自然 |
| ASR | `webkitSpeechRecognition` | 浏览器原生免费，口语对练够用 |
| 部署 | Cloudflare Pages + wrangler CLI | 永久免费、全球 CDN、ESM 直发无需构建 |
| 本地开发 | `node tools/serve.mjs` | 零依赖静态服务器，一个文件搞定 |

---

## 2. 前置准备（账号与工具）

执行以下步骤前，请准备好：

1. **Node.js** ≥ 18（推荐 v24+）：用于跑本地静态服务器和构建脚本
2. **Git**：版本控制
3. **GitHub 账号**：代码托管
4. **Supabase 账号**：[supabase.com](https://supabase.com) 注册（免费档够用）
5. **Cloudflare 账号**：[cloudflare.com](https://cloudflare.com) 注册（Pages 永久免费）
6. **DeepSeek 账号**：[platform.deepseek.com](https://platform.deepseek.com) 注册并充值 ≥ 1 元，创建 API Key
7. **Windows 用户**：PowerShell 7+；Linux/macOS 任意终端
8. **音频输出**：耳机或音箱（台式机主机无内置扬声器，必须外接）

---

## 3. 项目目录骨架

```
ielts-app/
├── index.html              # 入口 HTML（含顶栏 + 底部导航）
├── manifest.webmanifest    # PWA 清单
├── sw.js                   # Service Worker（离线缓存）
├── .gitignore              # 排除 node_modules / 凭据
├── .wranglerignore         # Cloudflare Pages 部署排除大文件
├── assets/
│   └── icon.svg            # 应用图标
├── css/
│   └── style.css           # 全局样式 + CSS 变量
├── js/
│   ├── app.js              # 哈希路由 + 顶栏账号按钮 + 启动 initCloudSync
│   ├── data.js            # 28 周教材数据（由 build-data.mjs 自动生成）
│   ├── store.js           # 本地+云端双模式状态层（核心）
│   ├── supabase.js        # Supabase 客户端封装（auth + CRUD）
│   ├── ai.js              # OpenAI 兼容 chat() + 口语考官/单词联想/写作反馈
│   ├── tts.js             # Web Speech API TTS（按句切分、长文本不截断）
│   └── modules/
│       ├── home.js        # 首页：进度总览
│       ├── reading.js     # 阅读翻页
│       ├── listening.js   # 听力 TTS 播放
│       ├── writing.js     # 写作分页
│       ├── speaking.js    # 口语 AI 对练
│       ├── vocab.js       # 单词卡 SM-2
│       ├── importer.js    # 自定义材料导入
│       ├── settings.js    # 设置页
│       └── auth.js        # 登录/注册 + 本地→云端迁移
└── tools/
    ├── serve.mjs          # 零依赖本地静态服务器
    ├── build-data.mjs     # 教材文本 → data.js 的解析脚本
    ├── supabase-schema.sql # Supabase 建表 SQL
    └── check.mjs          # 端到端验证脚本
```

> **关键设计**：所有 JS 都是 ES Module（`import/export`），通过 `<script type="module">` 加载，无需 Webpack/Vite 打包。浏览器原生支持，Cloudflare Pages 直接发原文件。

---

## 4. 第一步：HTML 入口 + PWA 清单

### 4.1 `index.html`

核心结构：顶栏（返回按钮 + 标题 + 周跳转 + 账号按钮）、`<main id="view">` 视图容器、底部 tabbar 四个一级页面。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f3a5f">
<title>雅思 28 周 · 智能学习</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="app">
  <header id="topbar">
    <button id="back-btn" class="icon-btn" hidden>←</button>
    <h1 id="page-title">雅思学习</h1>
    <button id="week-jump-btn" class="icon-btn" hidden>📅</button>
    <button id="auth-btn" class="icon-btn">👤</button>
  </header>
  <main id="view"></main>
  <nav id="tabbar">
    <a href="#/home" data-tab="home">🏠 首页</a>
    <a href="#/vocab" data-tab="vocab">🃏 单词</a>
    <a href="#/import" data-tab="import">📥 导入</a>
    <a href="#/settings" data-tab="settings">⚙️ 设置</a>
  </nav>
</div>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

### 4.2 `manifest.webmanifest`

PWA 安装到手机/桌面所必需：

```json
{
  "name": "雅思 28 周智能学习",
  "short_name": "雅思学习",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f4f6fa",
  "theme_color": "#1f3a5f",
  "lang": "zh-CN",
  "icons": [
    { "src": "assets/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

### 4.3 `sw.js`（Service Worker）

策略：网络优先（开发期即时更新），离线回退缓存外壳。

```js
const CACHE = 'ielts-app-v3';
const SHELL = ['./', './index.html', './css/style.css', /* …所有应用外壳文件 */];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.status === 200 && new URL(e.request.url).origin === location.origin) {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
```

---

## 5. 第二步：本地静态服务器

新建 `tools/serve.mjs`（零依赖，一个文件）：

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 5180;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const fp = path.join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found: ' + p); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`running: http://localhost:${port}`));
```

启动：

```powershell
node tools/serve.mjs 5180
```

打开 `http://localhost:5180/` 即可访问。

---

## 6. 第三步：哈希路由（app.js）

核心思路：用 `location.hash`（如 `#/reading/3`）做路由，`hashchange` 事件触发 `render()`，按 path 切换到对应模块的 `render(ctx)`。

```js
// js/app.js
import * as Home from './modules/home.js';
import * as Reading from './modules/reading.js';
// …其他模块
import * as tts from './tts.js';
import { getSettings, initCloudSync, getCurrentUser } from './store.js';

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const authBtn = document.getElementById('auth-btn');

export function go(hash) { location.hash = hash; }
export function toast(msg, ms = 2200) { /* 显示一个临时 toast */ }

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  const [path, ...rest] = hash.split('/').filter(Boolean);
  return { mod: path || 'home', param: rest[0] || null };
}

async function render() {
  const s = getSettings();
  tts.configure({ voiceURI: s.ttsVoiceURI, rate: s.ttsRate });
  view.innerHTML = '';
  const { mod, param } = parseRoute();
  const ctx = { view, param, go, toast };
  switch (mod) {
    case 'home': await Home.render(ctx); break;
    case 'reading': await Reading.render(ctx); break;
    // …
  }
}

window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
initCloudSync().finally(() => { refreshAuthBtn(); render(); });
```

**顶栏账号按钮**：未登录显示 `👤` 跳 `#/auth`；已登录显示邮箱首字母跳 `#/settings`。监听 `auth-change` 自定义事件刷新按钮。

---

## 7. 第四步：状态层 store.js（双模式核心）

整个应用最关键的文件。设计目标：**未登录纯本地，登录后写时即时推云端，读 API 同步无变化**。

### 7.1 数据结构

```js
const DEFAULT_STATE = {
  settings: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
              ttsVoiceURI: '', ttsRate: 1 },
  progress: {},   // { [`${mod}${week}`]: {done, at, score} }
  vocab: [],      // SRS 卡片
  drafts: {},     // 写作草稿 { [`w${week}`|`t1-${id}`]: {text, updatedAt} }
  customs: [],    // 导入的自定义材料
  speakLog: [],   // 口语练习记录（暂不上云）
};
```

### 7.2 双模式写 API 范式

每个写操作都是「先写本地 + 异步推云端」：

```js
let cloudReady = false;     // supabase 已配置且已登录
let cloudUser = null;

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

async function safePush(promise) {
  try { await promise; } catch (e) { console.warn('[cloud] push failed:', e.message); }
}

export function markDone(mod, week, extra = {}) {
  const row = { done: true, at: new Date().toISOString(), ...extra };
  state.progress[`${mod}${week}`] = row;
  save();
  if (cloudReady) safePush(supabase.pushProgress(mod, week, row));
}
```

业务模块调用的 API 同步返回，云端是 fire-and-forget，UI 不阻塞。

### 7.3 首次登录：本地 → 云端合并迁移

`syncFromCloud()` 是关键流程，规则是**双向合并、不丢任何数据**：

- settings：合并云端到本地，但**保留本地 apiKey**（密钥不上云）
- progress：按 `mod+week` 合并，prefer 更新的 `at`
- vocab：按 id 合并，prefer `mnemonicAt` 更新的
- drafts：按 key 合并，prefer `updated_at` 更新的
- customs：按 id 合并
- 本地独有的行 → push 到云端
- 云端独有的行 → 加到本地

返回 `{ before, after }` 让登录页 toast 展示同步结果。

---

## 8. 第五步：TTS 朗读（tts.js）

Web Speech API 的关键坑：

1. **长文本被截断**：Chrome 在 ~200 字符后会停。解决：按句切分，队列播放，`onend` 触发下一句。
2. **preferredURI/rate 必须先 configure**：否则 `speak()` 用默认空值，听不到声音。
3. **后台会暂停**：每 9 秒 `speechSynthesis.resume()` 续命。

```js
let preferredURI = '';
let rate = 1;

export function configure({ voiceURI, rate: r }) {
  preferredURI = voiceURI || preferredURI;
  if (r != null) rate = r;
}

function chunk(text) {
  return text.replace(/([.!?])\s+/g, '$1\n').split('\n').reduce((out, s) => {
    const last = out[out.length - 1];
    if (last && (last + ' ' + s).length > 180) out.push(s);
    else out[out.length - 1] = last ? last + ' ' + s : s;
    return out;
  }, ['']);
}

export function speak(text, { onEnd } = {}) {
  if (!('speechSynthesis' in window)) { onEnd?.(false); return false; }
  speechSynthesis.cancel();
  const parts = chunk(text);
  const v = voices.find(x => x.voiceURI === preferredURI)
    || voices.find(x => /en-GB/i.test(x.lang))
    || voices.find(x => /^en/i.test(x.lang));
  let i = 0;
  const next = () => {
    if (i >= parts.length) { onEnd?.(true); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate;
    u.onend = next;
    speechSynthesis.speak(u);
  };
  next();
  return true;
}
```

**配置时机**：`app.js` 每次 render 前先 `tts.configure(getSettings())`；设置页「试听」按钮也要先 `configure` 再 `speak`，否则没声。

---

## 9. 第六步：AI 集成（ai.js）

### 9.1 通用 chat()

OpenAI 兼容接口，支持 `response_format: json_object`：

```js
import { getSettings } from './store.js';

export function hasKey() { return !!getSettings().apiKey; }

async function chat(messages, { json = false, temperature = 0.7, maxTokens = 900 } = {}) {
  const { apiKey, baseUrl, model } = getSettings();
  if (!apiKey) { const e = new Error('尚未配置 API Key'); e.code = 'NO_KEY'; throw e; }
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, messages, temperature, max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message || ''; } catch {}
    throw new Error(`AI 接口返回 ${res.status}${detail ? '：' + detail : ''}`);
  }
  return (await res.json()).choices?.[0]?.message?.content?.trim() || '';
}
```

### 9.2 DeepSeek 配置

DeepSeek 完全兼容 OpenAI 协议，只需在设置页填：

| 字段 | 值 |
|---|---|
| API Key | `sk-...`（DeepSeek 平台创建，注意不是 ChatGPT 订阅 key） |
| Base URL | `https://api.deepseek.com/v1` |
| Model | `deepseek-chat` |

国内可直连，无需代理。

### 9.3 三个业务调用

- `examinerReply(history)`：口语考官对练，system prompt 指示一次只问一题、Part 1→2→3 推进
- `generateMnemonic(term, context)`：单词联想，要求返回 JSON `{meaning, mnemonic, association, example}`
- `writingFeedback(essay, prompt)`：写作反馈
- `testKey()`：设置页测试连接（发一句 "Reply with exactly: OK"）

---

## 10. 第七步：Supabase 云端同步

### 10.1 建表 SQL

在 Supabase 控制台 → SQL Editor 粘贴执行 [tools/supabase-schema.sql](tools/supabase-schema.sql)。核心是 5 张表 + RLS（行级安全）：

| 表 | 用途 | 主键 |
|---|---|---|
| profiles | 用户设置（与 auth.users 1:1） | id (uuid, = auth.users.id) |
| progress | 四科完成进度 | (user_id, mod, week) |
| vocab | 单词卡（SM-2） | id (text, 客户端 randomUUID) |
| drafts | 写作草稿 | (user_id, key) |
| customs | 自定义材料 | id (text) |

**每张表都启用 RLS**：

```sql
alter table public.vocab enable row level security;
create policy "vocab_self" on public.vocab
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

确保用户只能读写自己的行。

### 10.2 关闭邮箱确认（测试期）

Supabase Dashboard → Authentication → Providers → Email → 关闭 "Confirm email"。

否则注册会触发邮件发送，撞上默认 2 封/小时的限额。生产环境建议再打开。

### 10.3 supabase.js 封装

懒加载官方 SDK（ESM CDN，无需打包）：

```js
const CONFIG_KEY = 'ielts-supabase-cfg';
let client = null;

export async function getClient() {
  if (client) return client;
  const cfg = getConfig();
  if (!cfg) return null;
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.4.1/+esm');
  client = mod.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
```

配置（URL + anon key）存 `localStorage` key=`ielts-supabase-cfg`，在登录页填一次。

**关键 API**：
- `pull()`：一次性把用户的所有云端数据拉下来，返回 `{ settings, progress, vocab, drafts, customs }`
- `pushSettings/pushProgress/pushDraft/pushVocab/pushCustoms`：各表 upsert
- `signUp/signIn/signOut`：邮箱登录
- `onAuthState(cb)`：注册 auth 状态变化回调

### 10.4 auth.js 登录页 + 迁移

三种状态：未配置 → 显示填 URL+key 表单；已配置未登录 → 显示登录/注册表单；已登录 → 显示邮箱 + 退出按钮。

登录成功后调 `syncFromCloud()` 自动合并本地数据到云端，toast 展示同步结果。

### 10.5 store.js initCloudSync

`app.js` 启动时调一次：

```js
export async function initCloudSync() {
  if (!supabase.getConfig()) return;  // 未配置 → 纯本地模式
  supabase.onAuthState(handleAuthChange);
  const session = await supabase.getSession();
  if (session?.user) {
    cloudReady = true;
    cloudUser = { id: session.user.id, email: session.user.email };
  }
}
```

刷新页面后 session 自动恢复，用户无需重新登录。

---

## 11. 第八步：业务模块速览

每个模块文件都导出 `render({ view, param, go, toast, enableWeekJump })`，由 `app.js` 调用。

| 模块 | 关键点 |
|---|---|
| home.js | 28 周进度网格、四科完成数、今日单词待复习数 |
| reading.js | 翻页阅读，核心词块一键入卡（调 `ensureChunkCards`） |
| listening.js | TTS 播放听力稿，按句切分可逐句重播，对答案 |
| writing.js | Task2 28 题 + Task1 8 题，分页（题目引导 / 示例），草稿自动存云端 |
| speaking.js | `webkitSpeechRecognition` 录入回答 → `examinerReply()` → 考官回复，TTS 朗读 |
| vocab.js | SM-2 间隔重复，翻卡后 `generateMnemonic()` 由 AI 生成联想记忆 |
| importer.js | TXT/MD 直读，DOCX 用 mammoth.js，PDF 用 pdf.js |
| settings.js | Supabase 配置状态、AI Key、TTS 语音选择、数据导出 |
| auth.js | 见上文第 10.4 节 |

---

## 12. 第九步：教材数据生成（data.js）

`js/data.js` 是 28 周所有教材的结构化数据（28 篇阅读、28 套听力、28 题写作、28 个口语包），由 `tools/build-data.mjs` 从原始 Word 文档提取的纯文本解析生成。

如果你的内容来源不同，可以：

1. 写一个类似 `build-data.mjs` 的解析脚本，把你的教材转成 `MATERIALAL` 对象
2. 或者直接手写 `data.js`，结构对齐各模块的读取需求

`MATERIALAL` 的顶层结构：

```js
export const MATERIAL = {
  reading:   [{ week, topicZh, titleEn, paragraphs: [], chunks: [], q1, q2, search }],
  listening: [{ week, topicZh, questions: [], script: [], answers: [], chunks: [] }],
  writing:   [{ week, topicZh, prompt, guide, sample: {body, upgrade} }],
  task1:     [{ head, prompt, sample }],
  speaking:  [{ week, topicZh, part1: [], cueCard, part3: [], example, guide, upgrade }],
};
```

---

## 12.5 用 LLM 生成自定义话题库 + agent 替换 data.js

默认教材是通用学术话题（注意与记忆、睡眠、压力、社交媒体…）。如果你想换成与自己**专业 / 行业 / 兴趣**贴合的话题（医学生物、AI 伦理、环境政策、教育心理、商业管理…），完全可以让大语言模型（DeepSeek / ChatGPT / Claude）批量生成符合 `data.js` 结构的话题库，再交给 agent（即帮你搭项目的 AI 助手）一次性替换。

### 12.5.1 流程总览

```
[你] 选定主题方向（如"AI 伦理与公共政策"）
   ↓
[你] 把 §12.5.2 的 prompt 模板复制到 DeepSeek/ChatGPT
   ↓
[LLM] 按模板输出结构化 JSON（4 模块 × N 周）
   ↓
[你] 把 LLM 输出的 JSON 整段贴给 agent
   ↓
[agent] 校验结构 → 替换 js/data.js → 重启本地服务 → 你打开看效果
   ↓
[你] 满意 → agent git commit + push → Cloudflare Pages 自动更新
```

### 12.5.2 LLM Prompt 模板（直接复制粘贴）

把下面整段贴给 DeepSeek / ChatGPT / Claude，把 `{{TOPIC}}` 换成你的主题方向，把 `{{WEEKS}}` 换成要生成的周数（建议一次 4 周，避免单次输出截断）：

```
你是雅思学术教材编写专家。请围绕「{{TOPIC}}」这一主题方向，生成 {{WEEKS}} 周的雅思学习材料，严格按以下 JSON 结构输出（只输出 JSON，不要任何解释文字，不要 markdown 代码块包裹）：

{
  "reading": [
    {
      "week": 1,
      "topicZh": "主题中文名",
      "titleEn": "English Topic Title",
      "difficulty": "基础|进阶|高阶",
      "timeLimit": "8–10 分钟",
      "passageTitle": "Passage Title",
      "paragraphs": ["5段学术英语段落，每段80-120词，论证清晰：主张→机制→证据→边界→应用"],
      "chunks": ["6个核心学术词块（英文短语，不单个词）"],
      "q1": "一道思考题，要求考生指出文章主论证的机制和支持证据",
      "q2": "一道思考题，要求考生指出结论的边界条件并修改结论",
      "search": "延伸阅读检索词；优先 NIH/PMC/Our World in Data/Reuters"
    }
  ],
  "listening": [
    {
      "week": 1,
      "topicZh": "主题中文名",
      "questions": ["5道选择题，每题4选项A-D，题干+选项分行"],
      "script": ["听力独白脚本，Section 4 风格，200-250词，分句以便逐句精听"],
      "answers": ["5道题答案，形如 1.C 2.A 3.B 4.D 5.A"],
      "chunks": ["6个听力场景词块"]
    }
  ],
  "writing": [
    {
      "week": 1,
      "topicZh": "主题中文名",
      "prompt": "Task2 议论文题目（英文，含明确立场要求）",
      "guide": "论证引导（中文，2-3句，指出可用的角度/反例/边界）",
      "sample": {
        "body": "示例主体段（英文，150词左右，展示论证推进：主张→证据→机制→让步→回应）",
        "upgrade": "升级建议（中文，1-2句，指出可替换的高级表达或论证深化方向）"
      }
    }
  ],
  "speaking": [
    {
      "week": 1,
      "topicZh": "主题中文名",
      "part1": ["3-4个 Part1 热身问题（英文）"],
      "cueCard": "Part2 卡片题（英文，含 Describe a... + 3-4 个 bullet 提示点）",
      "part3": ["3-4个 Part3 深度追问（英文，要求比较/评估/推测）"],
      "example": "Part3 示范回答（英文，120词，展示展开方式：观点→例子→让步→深化）",
      "guide": "答题策略提示（中文，1-2句）",
      "upgrade": "升级建议（中文，1句，指出可替换表达）"
    }
  ]
}

要求：
1. 主题方向「{{TOPIC}}」要贯穿 4 个模块，每周一个子主题（如 AI 伦理下分：算法偏见、隐私权、就业冲击、监管政策）。
2. 阅读段落必须论证严密、学术英语地道，不要套话连接词堆砌。
3. 听力脚本要 Section 4 独白风格（讲座/报告），不是对话。
4. 写作题目要典型 IELTS Task2 风格（To what extent do you agree / Discuss both views 等）。
5. 口语 Part2 卡片必须含 Describe a... + bullet 提示点。
6. 输出 {{WEEKS}} 周完整内容（week 字段从 1 到 {{WEEKS}} 递增）。
7. 只输出 JSON，不要任何解释。
```

### 12.5.3 把 LLM 输出交给 agent 替换

把 LLM 生成的整段 JSON 复制，然后给 agent（比如你对我说）：

> 把下面这段 LLM 生成的话题库替换到 `js/data.js`，保持 `export const MATERIALS = ...` 的 ESM 导出格式，保留顶部注释但更新 `generatedAt` 时间戳和 `来源` 说明为「LLM 生成 · 主题：{{你的主题}}」。替换后启动本地服务让我预览。
>
> ```json
> { 粘贴 LLM 输出的整段 JSON }
> ```

agent 会做这些事：
1. 解析 JSON 校验结构（4 个数组、必填字段齐全、week 连续无重复）
2. 用 `tools/build-data.mjs` 同款的清洗逻辑跑一遍（去重连接词、normalize 主题占位符等）
3. 写入 `js/data.js`，保留 ESM 导出
4. 跑 `node tools/serve.mjs 5180` 启动本地服务，让你打开 `http://localhost:5180/` 预览
5. 你确认满意后 → `git add js/data.js` + commit + push 到 GitHub → Cloudflare Pages 自动重新部署

### 12.5.4 分批生成与拼接

28 周内容量大，**强烈建议分 7 批 × 4 周生成**（DeepSeek 单次输出约 4000 token，一次 4 周刚好不截断）：

```
第 1 批：week 1-4   主题：算法偏见 / 数据隐私 / 自动化就业 / 监管政策
第 2 批：week 5-8   主题：内容审核 / 深度伪造 / AI 创作权 / 算法透明度
...
```

每批生成后把 JSON 贴给 agent，agent 按 week 字段合并到同一个 `data.js`，不会覆盖已有周次。全部 28 周凑齐后一次性 commit + push。

### 12.5.5 验证清单

替换完 `data.js` 后，本地打开 `http://localhost:5180/` 检查：

| 检查项 | 期望 |
|---|---|
| 首页 28 周网格 | 每周中英文主题正确显示，无空白 |
| 阅读 W1 | 文章 5 段都能渲染，核心词块 6 个入卡按钮可用 |
| 听力 W1 | TTS 能朗读独白脚本，5 道题 + 答案正常 |
| 写作 W1 | Task2 题目 + 引导 + 示例分页正常 |
| 口语 W1 | Part1/2/3 题目齐全，Part2 卡片含 bullet |
| 单词页「导入全部词块」 | 28 周 × 6 词块全部入卡 |

任何一项异常，把异常截图/描述给 agent，agent 直接改 `data.js` 或清洗脚本。

---

## 13. 第十步：部署到 Cloudflare Pages

### 13.1 .gitignore 与 .wranglerignore

排除大文件和不该部署的东西：

**.gitignore**：
```
node_modules/
package.json
package-lock.json
.env
*.log
tools/cloudflared.exe
```

**.wranglerignore**（Cloudflare Pages 部署时额外排除）：
```
tools/cloudflared.exe
tools/shots/
node_modules/
.git/
.gitignore
.wranglerignore
```

> **重要**：如果根目录有 `package.json`，Cloudflare Pages 会误判为 Worker 项目触发 npm install。要么删掉 package.json，要么确保 .gitignore 排除它。

### 13.2 用 wrangler CLI 部署

```powershell
# 一次性登录（在 PowerShell 跑，非交互式 shell 跑会失败）
npx wrangler@latest login

# 部署（在项目根目录跑）
npx wrangler@latest pages deploy . --project-name=ielts-app --branch=main
```

部署成功后会输出形如 `https://ielts-app-xxxx.pages.dev` 的域名。

### 13.3 更新部署

改完代码后重跑同一条 `npx wrangler pages deploy . --project-name=ielts-app --branch=main` 即可。

### 13.4 验证

1. 本地访问 `http://localhost:5180/#/auth` 登录一次（触发本地→云端上传）
2. 打开 Pages 域名，登录同账号，看进度/单词卡/草稿是否拉取到
3. `Ctrl+F5` 强制刷新清缓存

---

## 14. 第十一步：端到端验证

### 14.1 Supabase 配置流程

1. Supabase Dashboard → New Project → 等待 2 分钟建库完成
2. Project Settings → API → 复制 Project URL 和 anon public key
3. App 设置页（或 `#/auth` 页）填入 URL 和 key，保存
4. SQL Editor 执行 `tools/supabase-schema.sql`
5. Authentication → Providers → Email → 关闭 Confirm email
6. 如遇注册 rate limit：Authentication → Users → Add user 手动创建

### 14.2 验证清单

| 项 | 验证方式 |
|---|---|
| 本地纯本地模式 | 未配置 Supabase 时，进度/单词卡/草稿都正常 |
| 登录后自动迁移 | 本地有数据 → 登录 → toast 显示「同步完成：单词 X→Y」 |
| 跨设备同步 | 本地登录上传 → Pages 域名登录 → 拉取到同样数据 |
| 写时即时推云端 | 登录后做一道题 → Supabase Table Editor 看到新行 |
| TTS 试听 | 设置页选语音 + 点试听 → 听到英文例句 |
| AI 测试连接 | 填 DeepSeek key + base URL + model → 测试连接 → 返回 OK |
| 单词卡联想 | 翻卡 → AI 生成联想记忆 → 保存到云端 |
| 口语对练 | 开始模考 → 麦克风录入 → 考官回复 |

---

## 15. 常见问题（FAQ）

### Q1：台式机没有声音？
台式机主机本身没有内置扬声器。必须插耳机或音箱到 3.5mm 绿色圆孔，或用 USB 耳机。Windows 声音设置里选对应输出设备。

### Q2：TTS 试听没声？
检查顺序：① 耳机/音箱插了吗？ ② Windows 声音输出选对了吗？ ③ 设置页「试听」按钮有没有先 `configure()` 再 `speak()`？ ④ 浏览器是否支持 `speechSynthesis`（Chrome/Edge 都支持）？

### Q3：登录后设置页还显示「未登录」？
`app.js` 启动时调 `initCloudSync()`，它异步加载 Supabase SDK。刷新页面等几秒；或在 `auth-change` 事件里手动调 `refreshAuthBtn()`。

### Q4：DeepSeek 模型下拉里没有 deepseek-chat？
设置页 Model 字段是 `<input list="datalist">` 支持手动输入。直接打 `deepseek-chat` 即可，datalist 只是常用候选。

### Q5：AI 报 429？
DeepSeek 余额不足。登录 platform.deepseek.com 充值。注意 ChatGPT Pro 订阅和 DeepSeek API 是两套独立计费。

### Q6：Cloudflare Pages 部署报错「Unexpected token '﻿'」？
`package.json` 有 UTF-8 BOM 会导致 wrangler 无法解析。删掉 BOM 或确保 .gitignore 排除 package.json。

### Q6：Cloudflare Pages 部署报错「file too large」？
单文件 25 MiB 上限。`tools/cloudflared.exe`（52 MiB）必须 .wranglerignore 排除。

### Q7：localStorage 数据在 localhost 和 pages.dev 不共享？
localStorage 按 origin 隔离，localhost 和 pages.dev 是不同 origin。**必须先在本地登录一次**触发 `syncFromCloud` 上传，Pages 域名登录后才能拉到。

### Q8：Supabase 注册报「email rate limit exceeded」？
默认 2 封/小时。关闭 Confirm email 即可避免触发邮件。或到 Dashboard Authentication → Users → Add user 手动创建。

### Q9：codex doctor 显示「Defender not verified」？
非管理员进程读不到 Defender 排除列表。用管理员 PowerShell 跑 `Get-MpPreference | Select ExclusionProcess` 验证。

---

## 16. 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户浏览器（PWA）                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  index.html + sw.js（离线缓存外壳）                  │    │
│  │  app.js 哈希路由 → 9 个业务模块                       │    │
│  │  store.js（本地+云端双模式状态层）                    │    │
│  │  tts.js（Web Speech API）    ai.js（OpenAI 兼容）     │    │
│  │  supabase.js（懒加载 ESM SDK）                       │    │
│  └──────────┬──────────────────────┬───────────────────┘    │
└─────────────┼──────────────────────┼────────────────────────┘
              │                      │
              │ HTTPS                │ HTTPS
              ▼                      ▼
   ┌──────────────────┐   ┌──────────────────────────┐
   │ DeepSeek API     │   │ Supabase（Postgres+Auth） │
   │ api.deepseek.com │   │ - auth.users（邮箱登录）   │
   │ /v1/chat/        │   │ - profiles/progress/vocab │
   │  completions     │   │   /drafts/customs（RLS）   │
   └──────────────────┘   └──────────────────────────┘
                                          ▲
                                          │ wrangler deploy
                                          │
                                ┌─────────────────────┐
                                │ Cloudflare Pages    │
                                │ ielts-app.pages.dev  │
                                │ （全球 CDN，永久免费）│
                                └─────────────────────┘
```

---

## 17. 成本估算

| 项 | 费用 |
|---|---|
| Supabase 免费档 | 500 MB 数据库、50k 月活、2 GB 出网 |
| Cloudflare Pages | 永久免费（500 次构建/月、无限请求） |
| DeepSeek API | 1 元起充，`deepseek-chat` 约 ¥1/M tokens |
| 域名 | 用默认 `*.pages.dev` 免费；自定义域名需另购 |
| **合计** | **约 1 元启动，按 AI 用量计费** |

---

## 18. 推荐的增强方向

- AI Key 走 Cloudflare Worker 中转 + Supabase 加密存储（避免每个用户 localStorage 明文存 key）
- 听力改用 Edge TTS 在服务端预生成 MP3（比浏览器 TTS 自然）
- 单词卡增加图片联想（DALL-E 或免费图库）
- 口语评分加录音上传，云端跑 Whisper 转写后再评分
- 写作反馈加整篇重写模式（可选）
- 加学习时长统计 + 周报推送

---

## 19. 完整搭建顺序速查

```powershell
# 1. 初始化项目
mkdir ielts-app; cd ielts-app
git init

# 2. 创建目录骨架（见第 3 节）
# 手写或参考本项目各文件

# 3. 本地启动
node tools/serve.mjs 5180
# 浏览器开 http://localhost:5180/

# 4. Supabase 建库（见第 10 节）
# Dashboard 新建 project → 复制 URL + anon key
# SQL Editor 执行 tools/supabase-schema.sql
# 关闭 Confirm email

# 5. 在 App 登录页填 Supabase URL + key
# 注册或 Dashboard 手动 Add user → 登录 → 验证云同步

# 6. 配置 DeepSeek（见第 9.2 节）
# platform.deepseek.com 充值 + 创建 API key
# App 设置页填 key / https://api.deepseek.com/v1 / deepseek-chat
# 测试连接 → OK

# 7. 插耳机 → TTS 试听（见第 8 节）

# 8. 推到 GitHub
git remote add origin https://github.com/<you>/ielts-app.git
git push -u origin main

# 9. 部署到 Cloudflare Pages
npx wrangler@latest login
npx wrangler@latest pages deploy . --project-name=ielts-app --branch=main

# 10. 验证（见第 14 节）
# 本地登录上传 → Pages 域名登录拉取 → 检查数据一致
```

---

**祝你也搭建出自己的雅思学习 PWA。** 任何步骤卡住，回头查 FAQ；架构层面有疑问，先看 `store.js` 的双模式设计和 `app.js` 的路由，这是整个项目的两个支点。
