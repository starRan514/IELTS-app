// 将《28周分模块文字材料手册》提取文本解析为结构化 JSON
// 用法: node tools/build-data.mjs <_extract_1.txt> <输出 data.js>
import fs from 'node:fs';

const [,, inPath, outPath] = process.argv;
const raw = fs.readFileSync(inPath, 'utf-8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/);

const findLine = re => lines.findIndex(l => re.test(l));
const partReading = findLine(/^Part I\s+Reading｜/);
const partListening = findLine(/^Part II\s+Listening｜/);
const partWriting = findLine(/^Part III\s+Writing｜/);
const partSpeaking = findLine(/^Part IV\s+Speaking｜/);
const appendix = findLine(/^Appendix A｜/);

// 文本清洗：英文内容中的中文主题占位符 -> 对应英文主题；修掉模板重复连接词
function dedupeConnectors(s) {
  return s
    .replace(/\b(However|Therefore|Moreover|Furthermore|Instead),\s+\1,/g, '$1,')
    .replace(/\bFor example, For example,/g, 'For example,');
}
function midCase(en) {
  // 句中形式：普通词全小写，保留 AI/GDP/IQ 等全大写缩写
  return en.split(/\s+/).map(w => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
}
function normalizeTopic(s, zh, en) {
  if (!s || !zh) return s;
  const lower = midCase(en);
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s.startsWith(zh, i)) {
      const before = s.slice(0, i).trimEnd();
      const atStart = before === '' || /[.!?:;(\n"“]$/.test(before.slice(-1));
      out += atStart ? en : lower;
      i += zh.length;
    } else { out += s[i++]; }
  }
  return out;
}

function splitBlocks(start, end) {
  const blocks = [];
  let cur = null;
  for (let i = start; i < end; i++) {
    const l = lines[i];
    const m = l.match(/^Week\s*(\d+)｜(.+)$/);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { week: Number(m[1]), head: m[2].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(l);
    }
  }
  if (cur) blocks.push(cur);
  return blocks.map(b => ({ ...b, lines: b.lines.map(s => s.trim()).filter(Boolean) }));
}

// ---------- Reading ----------
const reading = [];
for (const b of splitBlocks(partReading, partListening)) {
  const hm = b.head.match(/^(.+?)\s{2,}(.+)$/);
  const topicZh = hm ? hm[1].trim() : b.head;
  const titleEn = hm ? hm[2].trim() : '';
  const ls = b.lines;
  const metaLine = ls.find(l => l.startsWith('难度：')) || '';
  const pIdx = ls.findIndex(l => l.startsWith('Reading Passage:'));
  const cIdx = ls.findIndex(l => l.startsWith('核心词块'));
  const paragraphs = ls.slice(pIdx + 1, cIdx);
  const chunksLine = ls[cIdx] || '';
  const chunks = chunksLine.replace(/^核心词块：?/, '').split('·').map(s => s.trim()).filter(Boolean);
  const q1 = (ls.find(l => l.startsWith('思考题 1')) || '').replace(/^思考题 1（[^）]*）：?/, '');
  const q2 = (ls.find(l => l.startsWith('思考题 2')) || '').replace(/^思考题 2（[^）]*）：?/, '');
  const search = (ls.find(l => l.startsWith('延伸阅读检索词')) || '').replace(/^延伸阅读检索词：?/, '');
  reading.push({
    week: b.week, topicZh, titleEn,
    difficulty: (metaLine.match(/难度：([^｜|]+)/)?.[1] || '').trim(),
    timeLimit: (metaLine.match(/建议限时：([^｜|]+)/)?.[1] || '').trim(),
    passageTitle: (ls[pIdx] || '').replace(/^Reading Passage:\s*/, ''),
    paragraphs, chunks, q1, q2, search,
  });
}

// ---------- Listening ----------
const listening = [];
for (const b of splitBlocks(partListening, partWriting)) {
  const ls = b.lines;
  const topicZh = b.head.replace(/\s*Listening Set\s*$/, '').trim();
  const qStart = ls.findIndex(l => l.startsWith('A. Questions'));
  const sStart = ls.findIndex(l => l.startsWith('B. Listening Script'));
  const aStart = ls.findIndex(l => l.startsWith('C. Answer Key'));
  const tStart = ls.findIndex(l => l.startsWith('精听任务'));
  // 题目按 "1." .. "5." 切分
  const qLines = ls.slice(qStart + 1, sStart);
  const questions = [];
  let qcur = null;
  for (const l of qLines) {
    if (/^\d+\.\s*/.test(l)) { if (qcur) questions.push(qcur); qcur = l; }
    else if (qcur) qcur += '\n' + l;
  }
  if (qcur) questions.push(qcur);
  listening.push({
    week: b.week, topicZh,
    questions,
    script: ls.slice(sStart + 1, aStart).join('\n\n'),
    answers: ls.slice(aStart + 1, tStart).join(' ').replace(/^C\. Answer Key\s*/, ''),
    followTask: tStart >= 0 ? ls[tStart].replace(/^精听任务：?/, '') : '',
  });
}

// ---------- Writing Task 2 ----------
const writing = [];
for (const b of splitBlocks(partWriting, partSpeaking)) {
  if (!b.head.includes('Task 2')) continue;
  const ls = b.lines;
  const topicZh = b.head.replace(/\s*Task 2\s*$/, '').trim();
  const prompt = (ls.find(l => l.startsWith('题目：')) || '').replace(/^题目：/, '');
  const guideStart = ls.findIndex(l => l === '论证引导' || l.startsWith('论证引导'));
  const exStart = ls.findIndex(l => l.startsWith('示例主体段'));
  const ownStart = ls.findIndex(l => l.startsWith('自练'));
  const guide = {};
  for (const l of ls.slice(guideStart + 1, exStart)) {
    const m = l.match(/^(立场|机制|证据\/例子|反方|边界条件)：(.+)$/s);
    if (m) guide[m[1]] = m[2];
  }
  writing.push({
    week: b.week, topicZh, prompt, guide,
    example: ls.slice(exStart + 1, ownStart).join('\n\n'),
    ownTask: ownStart >= 0 ? ls[ownStart].replace(/^自练：?/, '') : '',
  });
}

// ---------- Task 1 微训练 ----------
const t1Start = findLine(/^Task 1｜/);
const task1 = [];
{
  const ls = lines.slice(t1Start + 1, partSpeaking).map(s => s.trim()).filter(Boolean);
  let cur = null;
  for (const l of ls) {
    if (/^T1-\d+/.test(l)) { if (cur) task1.push(cur); cur = { head: l, data: '', task: '', overview: '' }; }
    else if (cur) {
      if (l.startsWith('数据：')) cur.data = l.replace(/^数据：?/, '');
      else if (l.startsWith('任务：')) cur.task = l.replace(/^任务：?/, '');
      else if (l.startsWith('示例 Overview：')) cur.overview = l.replace(/^示例 Overview：?/, '');
    }
  }
  if (cur) task1.push(cur);
}

// ---------- Speaking ----------
const speaking = [];
for (const b of splitBlocks(partSpeaking, appendix)) {
  const ls = b.lines;
  const topicZh = b.head.replace(/\s*Speaking Pack\s*$/, '').trim();
  const i1 = ls.findIndex(l => l.startsWith('Part 1｜'));
  const i2 = ls.findIndex(l => l.startsWith('Part 2｜'));
  const i3 = ls.findIndex(l => l.startsWith('Part 3｜'));
  const ig = ls.findIndex(l => l.startsWith('深度引导'));
  const ie = ls.findIndex(l => l.startsWith('示例 Part 3 回答'));
  const iu = ls.findIndex(l => l.startsWith('表达升级任务'));
  speaking.push({
    week: b.week, topicZh,
    part1: ls.slice(i1 + 1, i2),
    cueCard: ls.slice(i2 + 1, i3).join(' '),
    part3: ls.slice(i3 + 1, ig),
    guide: ig >= 0 ? ls[ig].replace(/^深度引导：?/, '') : '',
    example: ls.slice(ie + 1, iu).join('\n\n'),
    upgrade: iu >= 0 ? ls[iu].replace(/^表达升级任务：?/, '') : '',
  });
}

const data = { generatedAt: new Date().toISOString(), reading, listening, writing, task1, speaking };

// ---------- 统一清洗 ----------
const enByWeek = new Map(reading.map(r => [r.week, r.titleEn]));
const zhByWeek = new Map(reading.map(r => [r.week, r.topicZh]));
const clean = (s, w) => dedupeConnectors(normalizeTopic(s, zhByWeek.get(w), enByWeek.get(w)));

for (const r of data.reading) {
  r.paragraphs = r.paragraphs.map(p => clean(p, r.week));
  r.passageTitle = clean(r.passageTitle, r.week);
}
for (const l of data.listening) {
  l.questions = l.questions.map(q => clean(q, l.week));
  l.script = clean(l.script, l.week);
}
for (const w of data.writing) {
  w.prompt = clean(w.prompt, w.week);
  for (const k of Object.keys(w.guide)) w.guide[k] = clean(w.guide[k], w.week);
  w.example = clean(w.example, w.week);
}
for (const s of data.speaking) {
  s.part1 = s.part1.map(q => clean(q, s.week));
  s.cueCard = clean(s.cueCard, s.week);
  s.part3 = s.part3.map(q => clean(q, s.week));
  s.example = clean(s.example, s.week);
}

// ---------- 校验 ----------
const counts = { reading: reading.length, listening: listening.length, writing: writing.length, task1: task1.length, speaking: speaking.length };
const problems = [];
for (const w of Array.from({ length: 28 }, (_, i) => i + 1)) {
  for (const k of ['reading', 'listening', 'writing', 'speaking']) {
    const item = data[k].find(x => x.week === w);
    if (!item) problems.push(`缺 ${k} Week ${w}`);
  }
}
for (const r of reading) if (r.paragraphs.length < 4) problems.push(`Reading W${r.week} 段落异常(${r.paragraphs.length})`);
for (const l of listening) { if (l.questions.length !== 5) problems.push(`Listening W${l.week} 题目数=${l.questions.length}`); if (l.script.length < 200) problems.push(`Listening W${l.week} 听力稿过短`); }
for (const w of writing) if (!w.prompt || !w.example) problems.push(`Writing W${w.week} 缺题目/示例`);
for (const s of speaking) { if (s.part1.length !== 2) problems.push(`Speaking W${s.week} Part1=${s.part1.length}`); if (s.part3.length !== 4) problems.push(`Speaking W${s.week} Part3=${s.part3.length}`); }

// 英文正文中不应残留中文（占位符清洗校验）
let cjkHits = 0;
const cjkRe = /[一-鿿]/;
for (const r of reading) r.paragraphs.forEach(p => { if (cjkRe.test(p)) { cjkHits++; if (cjkHits <= 3) problems.push(`Reading W${r.week} 残留中文: ${p.slice(0, 60)}`); } });
for (const l of listening) { l.questions.forEach(q => { if (cjkRe.test(q)) problems.push(`Listening W${l.week} 题干残留中文`); }); if (cjkRe.test(l.script)) { cjkHits++; if (cjkHits <= 5) problems.push(`Listening W${l.week} 听力稿残留中文`); } }
for (const s of speaking) [...s.part1, ...s.part3].forEach(q => { if (cjkRe.test(q)) problems.push(`Speaking W${s.week} 问题残留中文`); });

const banner = `// 由 tools/build-data.mjs 自动生成，请勿手改\n// 来源：IELTS_28周分模块文字材料手册.docx\n`;
fs.writeFileSync(outPath, banner + 'export const MATERIALS = ' + JSON.stringify(data, null, 1) + ';\n', 'utf-8');

console.log('counts:', JSON.stringify(counts));
console.log('problems:', problems.length ? problems.join('\n') : 'none');
