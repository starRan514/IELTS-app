// 端到端：Supabase 注册 → 本地数据迁移上云 → 模拟新设备登录 → 云端数据恢复
// 用法：node tools/check-auth.mjs <supabase_url> <anon_key> [test_email] [test_password]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5180';
const shotsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const SUPA_URL = process.argv[2] || 'https://awawtitzqgmgggqxujsu.supabase.co';
const SUPA_KEY = process.argv[3] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3YXd0aXR6cWdtZ2dncXh1anN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTE0MTEsImV4cCI6MjEwNTYyNzQxMX0.f5IUzimkUIAg69bIT1pzM9CbNZENreN8zxCxr8i_9lM';
const TEST_EMAIL = process.argv[4] || `e2e-${Date.now()}@test.local`;
const TEST_PW = 'Test1234!';

const results = [];
const ok = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra: String(extra) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Supabase REST 直查（绕过浏览器）
async function restGet(table, params = '') {
  const url = `${SUPA_URL}/rest/v1/${table}?${params}`;
  const r = await fetch(url, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`REST ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

// Supabase Auth REST：直接注册/登录拿 access_token + uid
async function authSignUp(email, password) {
  const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`signup ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-features=msEdgeSidebar', '--window-size=420,880'],
});
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 880, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const $ = sel => page.$(sel);
const text = sel => page.$eval(sel, el => el.textContent).catch(() => null);
const count = sel => page.$$eval(sel, els => els.length).catch(() => 0);
const goto = async h => { await page.goto(BASE + h, { waitUntil: 'networkidle0' }); await sleep(300); };

console.log('Test email:', TEST_EMAIL);

// ---------- 0. 清空本地状态 ----------
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());

// ---------- 1. 在本地造一些数据（待会儿要迁移到云端）----------
// 1a. 加载全部词块到本地 vocab
await goto('/#/vocab');
await sleep(300);
await page.click('#add-all');
await sleep(1000);
const localVocabCount = await page.evaluate(() => JSON.parse(localStorage.getItem('ielts-app-v1')).vocab.length);
ok('本地造数据：词块已导入', localVocabCount > 100, `vocab=${localVocabCount}`);

// 1b. 写作草稿
await goto('/#/writing/1');
await sleep(300);
await page.type('#draft', 'This is a test essay draft for e2e migration verification.');
await sleep(500);

// 1c. 标记阅读 Week1 完成
await goto('/#/reading/1');
await sleep(400);
await page.click('#finish-reading').catch(()=>{});
await sleep(800);

// ---------- 2. 注入 Supabase 配置 ----------
await page.evaluate(({ url, key }) => {
  localStorage.setItem('ielts-supabase-cfg', JSON.stringify({ url, anonKey: key }));
}, { url: SUPA_URL, key: SUPA_KEY });

// ---------- 3. 重新加载触发 initCloudSync，进入 auth 页 ----------
await goto('/#/auth');
await sleep(800);
ok('配置已注入后：显示登录表单（非配置页）', (await text('#view'))?.includes('登录') || !!(await $('#email')));
ok('登录表单 email 输入框', !!(await $('#email')));
ok('登录表单 password 输入框', !!(await $('#password')));
await page.screenshot({ path: path.join(shotsDir, 'auth-login-form.png') });

// ---------- 4. 切到注册模式，注册新账号 ----------
await page.click('#toggle-link');
await sleep(200);
ok('切换到注册模式', (await text('#form-title'))?.includes('注册'));

await page.type('#email', TEST_EMAIL);
await page.type('#password', TEST_PW);
await page.click('#submit');
await sleep(2000);  // 等待网络请求
await page.screenshot({ path: path.join(shotsDir, 'auth-after-signup.png') });

// 验证是否需要邮箱确认
const pageText = await text('#view') || '';
const needsEmailConfirm = pageText.includes('请到邮箱点击确认') || pageText.includes('email');
console.log('After signup, page text snippet:', pageText.slice(0, 200));

// 如果需要邮箱确认，则改用直接 API 注册（绕过确认）
// 但更可靠：检查 auth 按钮是否变成字母（说明已登录）
const authBtnText = await page.$eval('#auth-btn', el => el.textContent).catch(() => '');
console.log('Auth button text:', authBtnText);
const isLoggedInAfterSignup = /[A-Z]/.test(authBtnText) && authBtnText !== '👤';

if (isLoggedInAfterSignup) {
  ok('注册后自动登录 ✓', true, `auth-btn=${authBtnText}`);
} else if (needsEmailConfirm) {
  ok('注册需邮箱确认（已绕过：用 API 直接确认）', false, '需要在 Supabase 控制台关闭 Confirm email 或手动确认');
  // 尝试直接用 API 把用户标记为已确认 - 但 anon key 没权限，跳过
  // 改为：用 admin 权限或换种策略
  console.log('! 需要到 Supabase 控制台 Authentication → Users 把该用户手动确认，或关闭 Confirm email 开关后重试');
} else {
  // 等更久看是否最终登录
  await sleep(3000);
  const authBtnText2 = await page.$eval('#auth-btn', el => el.textContent).catch(() => '');
  ok('注册后自动登录', /[A-Z]/.test(authBtnText2) && authBtnText2 !== '👤', `auth-btn=${authBtnText2}`);
}

// ---------- 5. 检查云端是否有数据 ----------
let cloudVocab = [], cloudDrafts = [], cloudProgress = [];
try {
  const all = await restGet('vocab', 'select=id,term');
  cloudVocab = all;
  ok('云端 vocab 表已写入', all.length > 0, `count=${all.length}`);
} catch (e) { ok('云端 vocab 表已写入', false, e.message); }

try {
  const all = await restGet('drafts', 'select=key,text');
  cloudDrafts = all;
  ok('云端 drafts 表已写入', all.length > 0, `count=${all.length}`);
} catch (e) { ok('云端 drafts 表已写入', false, e.message); }

try {
  const all = await restGet('progress', 'select=mod,week,done');
  cloudProgress = all;
  ok('云端 progress 表已写入', all.length > 0, `count=${all.length}`);
} catch (e) { ok('云端 progress 表已写入', false, e.message); }

// ---------- 6. 模拟新设备：清空 localStorage，重新加载 ----------
await page.evaluate(() => localStorage.clear());
await goto('/');
await sleep(500);
// 验证本地真的空了
const emptyVocab = await page.evaluate(() => JSON.parse(localStorage.getItem('ielts-app-v1') || '{"vocab":[]}').vocab.length);
ok('模拟新设备：本地已清空', emptyVocab === 0, `vocab=${emptyVocab}`);

// 重新注入 Supabase 配置（新设备也会保存这个）
await page.evaluate(({ url, key }) => {
  localStorage.setItem('ielts-supabase-cfg', JSON.stringify({ url, anonKey: key }));
}, { url: SUPA_URL, key: SUPA_KEY });

// ---------- 7. 在新设备上登录同账号 ----------
await goto('/#/auth');
await sleep(500);
await page.type('#email', TEST_EMAIL);
await page.type('#password', TEST_PW);
await page.click('#submit');
await sleep(3000);  // 等待 syncFromCloud

const authBtnText2 = await page.$eval('#auth-btn', el => el.textContent).catch(() => '');
ok('新设备登录成功', /[A-Z]/.test(authBtnText2) && authBtnText2 !== '👤', `auth-btn=${authBtnText2}`);

// ---------- 8. 验证云端数据已恢复到本地 ----------
await goto('/#/vocab');
await sleep(500);
const restoredVocab = await page.evaluate(() => JSON.parse(localStorage.getItem('ielts-app-v1')).vocab.length);
ok('新设备本地 vocab 已从云端恢复', restoredVocab > 0, `restored=${restoredVocab} vs original=${localVocabCount}`);

await goto('/#/writing/1');
await sleep(400);
const restoredDraft = await page.$eval('#draft', el => el.value).catch(() => '');
ok('新设备本地草稿已从云端恢复', restoredDraft.includes('test essay draft'), `draft="${restoredDraft.slice(0,40)}..."`);

// ---------- 汇总 ----------
await sleep(200);
console.log('\n===== 端到端同步测试结果 =====');
let pass = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`);
  if (r.pass) pass++;
}
console.log(`\n通过 ${pass}/${results.length}`);
console.log('--- 控制台错误 ---');
console.log(errors.length ? [...new Set(errors)].join('\n') : '无');
await browser.close();
process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
