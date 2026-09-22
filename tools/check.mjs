// 无头 Edge 自动走查：node tools/check.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5180';
const shotsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra: String(extra) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// 确保从零状态开始
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());

// ---------- 1. 首页 ----------
await goto('/#/home');
await sleep(600);
ok('首页周格=28', await count('.week-cell') === 28, await count('.week-cell'));
ok('四科进度0/28', (await text('#view'))?.includes('0/28'));
await page.click('.week-cell[data-w] , .week-cell').catch(()=>{});
await sleep(200);
ok('周格弹出四科菜单', await count('.module-tile') >= 8, await count('.module-tile'));
await page.screenshot({ path: path.join(shotsDir, '1-home.png') });
await page.click('#menu-close').catch(()=>{});
await sleep(200);

// ---------- 2. 阅读 ----------
await goto('/#/reading/1');
await sleep(400);
const indicator = await text('#indicator');
const pageCount = Number((indicator || '').match(/\/ (\d+)/)?.[1] || 0);
ok('阅读总页数>=4', pageCount >= 4, indicator);
// 检查当前页正文无纵向溢出
const overflow = await page.$eval('#stage', s => {
  const active = s.querySelector('.page.active .page-body');
  return active ? active.scrollHeight - active.clientHeight : 0;
});
ok('阅读正文页无滚动溢出', overflow <= 2, overflow);
await page.screenshot({ path: path.join(shotsDir, '2-reading.png') });
// 翻到末页
let guard = 0;
while (await page.$eval('#next', b => !b.disabled).catch(() => false) && guard++ < 10) {
  await page.click('#next'); await sleep(120);
}
// 倒数第二页应是词块页 → 回退一页点加入单词卡
await page.click('#prev'); await sleep(150);
ok('词块页有加入按钮', !!(await $('.page.active #add-chunks')));
await page.click('#add-chunks').catch(()=>{});
await sleep(200);
ok('加入单词卡toast', (await text('.toast'))?.includes('已加入 6'), await text('.toast'));
await page.click('#next'); await sleep(150);
ok('末页=深度思考页', !!(await $('.page.active #finish-reading')));
await page.click('#finish-reading'); await sleep(800);
ok('完成后跳转Week2', page.url().includes('/reading/2'), page.url());

// ---------- 3. 听力 ----------
await goto('/#/listening/1');
ok('听力单选题数=8(2题×4项)', await count('#questions input[type=radio]') === 8, await count('#questions input[type=radio]'));
ok('听力填空数=3', await count('#questions input[type=text]') === 3, await count('#questions input[type=text]'));
ok('题干含NO MORE THAN TWO WORDS', (await text('#questions'))?.includes('NO MORE THAN TWO WORDS'));
await page.click('#toggle-script'); await sleep(150);
ok('逐句脚本>=10句', await count('.script-line') >= 10, await count('.script-line'));
await page.click('#toggle-answers'); await sleep(150);
ok('答案行正确', (await text('#answer-card'))?.includes('2. mechanism'));
ok('倍速三档', await count('#rate option') === 3);

// ---------- 4. 写作 ----------
await goto('/#/writing');
await sleep(300);
ok('Task2格=28', await count('#t2-grid .week-cell') === 28, await count('#t2-grid .week-cell'));
ok('Task1格=8', await count('#t1-grid .week-cell') === 8, await count('#t1-grid .week-cell'));

await goto('/#/writing/1');
await sleep(300);
const taskPageText = await page.$eval('#page-task', el => el.innerText);
ok('题目页无范文正文', !taskPageText.includes('A strong reason to avoid'));
await page.type('#draft', 'test word count');
await sleep(700);
ok('词数统计=3', (await text('#words')) === '3', await text('#words'));
await page.click('#to-example'); await sleep(200);
ok('范文页显示示例', (await page.$eval('#page-example', el => el.innerText)).includes('A strong reason to avoid'));
await page.screenshot({ path: path.join(shotsDir, '3-writing-example.png') });
await page.click('#back-task'); await sleep(150);
ok('返回后草稿保留', (await page.$eval('#draft', el => el.value)) === 'test word count');

await goto('/#/writing/t1-1');
await sleep(300);
ok('T1第一页无overview', !(await page.$eval('#page-task', el => el.innerText)).includes('Overall, daily screen time'));
await page.click('#to-ex'); await sleep(150);
ok('T1第二页有overview', (await page.$eval('#page-ex', el => el.innerText)).includes('Overall, daily screen time'));

// ---------- 5. 口语 ----------
await goto('/#/speaking/1');
await sleep(300);
const brief = await text('#brief');
const p1 = await page.$$eval('.qi-role', els => els.filter(e => e.textContent.trim() === 'P1').length);
const p3 = await page.$$eval('.qi-role', els => els.filter(e => e.textContent.trim() === 'P3').length);
ok('Part1两问', p1 === 2, p1);
ok('Part3四问', p3 === 4, p3);
ok('有Cue Card', brief.includes('Cue Card'));
await page.click('#start').catch(()=>{});
await sleep(300);
ok('无Key时toast提示', (await text('.toast'))?.includes('API Key') === true || (await text('.toast'))?.includes('Key'));
ok('未进入聊天页', await (await $('#exam')).evaluate(el => el.hidden));

// ---------- 6. 单词 ----------
await goto('/#/vocab');
await sleep(300);
await page.click('#add-all'); await sleep(300);
const addToast = await text('.toast');
ok('全量词块导入成功', /导入\s*\d+|已在卡片库/.test(addToast || ''), addToast);
await sleep(1900);
await page.click('#study'); await sleep(400);
ok('进入学习卡片', !!(await $('.flashcard')));
await page.click('#card'); await sleep(300);
ok('翻面提示仅自评', !!(await $('#skip-m')));
await page.click('#skip-m'); await sleep(200);
ok('出现三个评分按钮', await count('.rate-row button') === 3);
await page.screenshot({ path: path.join(shotsDir, '4-vocab-back.png') });
await page.click('.rate-good'); await sleep(300);
ok('评分后进入下一张/结束', !!(await $('.flashcard')) || !!(await $('#back')));
await goto('/#/home'); await sleep(300);
const dueCnt = await text('#due-cnt');
ok('首页待复习数字已渲染', /^\d+$/.test(dueCnt || ''), dueCnt);

// ---------- 7. 导入 ----------
await goto('/#/import');
const accept = await page.$eval('#file', el => el.accept);
ok('导入文件选择器', /docx/.test(accept) && /pdf/.test(accept), accept);
ok('已导入计数=0', (await text('#custom-list'))?.includes('还没有导入材料'));

// ---------- 8. 设置 ----------
await goto('/#/settings');
await sleep(800); // 等语音枚举
ok('设置表单存在', !!(await $('#key')) && !!(await $('#base')) && !!(await $('#model')));
const voices = await page.$$eval('#voice option', os => os.map(o => o.textContent));
const enVoices = voices.filter(v => /\(en/i.test(v));
ok('英语语音数(报告)', true, enVoices.length + ' 个: ' + enVoices.slice(0, 6).join(' | '));

// ---------- 9. 账号页（未配置 Supabase） ----------
await goto('/#/auth');
await sleep(300);
ok('账号页渲染', (await text('#view'))?.includes('绑定 Supabase'));
ok('账号页有 URL 输入框', !!(await $('#sb-url')));
ok('账号页有 key 输入框', !!(await $('#sb-key')));
ok('账号页有保存按钮', !!(await $('#save-cfg')));
await page.screenshot({ path: path.join(shotsDir, '5-auth-setup.png') });

// ---------- 10. 设置页账号区块 ----------
await goto('/#/settings');
await sleep(400);
ok('设置页账号区块', (await text('#view'))?.includes('账号与同步'));
ok('未登录提示', (await text('#view'))?.includes('未登录'));
ok('跳转登录按钮', !!(await $('#go-auth')));

// ---------- 汇总 ----------
await sleep(200);
console.log('\n===== 测试结果 =====');
let pass = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`);
  if (r.pass) pass++;
}
console.log(`\n通过 ${pass}/${results.length}`);
console.log('--- 控制台错误 ---');
console.log(errors.length ? [...new Set(errors)].join('\n') : '无');
await browser.close();
process.exit(pass === results.length && errors.filter(e => !/favicon|ServiceWorker|sw.js/.test(e)).length === 0 ? 0 : 1);
