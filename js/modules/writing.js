import { MATERIALS } from '../data.js';
import { markDone, getDraft, setDraft } from '../store.js';
import { hasKey, writingFeedback } from '../ai.js';

// ---------- 索引：28 Task2 + 8 Task1 ----------
export function render({ view, param, go, toast, enableWeekJump }) {
  if (!param) return renderIndex(view, go);
  if (param.startsWith('t1-')) return renderTask1(view, param, go, toast);
  return renderTask2(view, Number(param), go, toast, enableWeekJump);
}

function renderIndex(view, go) {
  document.getElementById('page-title').textContent = '写作 · Writing';
  view.innerHTML = `
    <div class="scroll">
      <div class="card">
        <h3>Task 2 议论文 · 28 题</h3>
        <p class="muted" style="margin-top:0">每页只放题目 + 论证引导；示例主体段在独立页面，写完再看。</p>
        <div class="week-grid" id="t2-grid" style="grid-template-columns:repeat(4,1fr)"></div>
      </div>
      <div class="card">
        <h3>Task 1 图表微训练 · 8 组</h3>
        <div class="week-grid" id="t1-grid" style="grid-template-columns:repeat(4,1fr)"></div>
      </div>
    </div>`;
  const g2 = view.querySelector('#t2-grid');
  MATERIALS.writing.forEach(w => {
    const a = document.createElement('a');
    a.className = 'week-cell';
    a.href = `#/writing/${w.week}`;
    a.innerHTML = `<span class="wn">${String(w.week).padStart(2, '0')}</span>
      <span class="wt" title="${w.topicZh}">${w.topicZh}</span>`;
    g2.appendChild(a);
  });
  const g1 = view.querySelector('#t1-grid');
  MATERIALS.task1.forEach((t, i) => {
    const id = `t1-${i + 1}`;
    const a = document.createElement('a');
    a.className = 'week-cell';
    a.href = `#/writing/${id}`;
    a.innerHTML = `<span class="wn">${i + 1}</span><span class="wt">${t.head.split(/\s{2,}/)[1]?.slice(0, 6) || '图表'}</span>`;
    g1.appendChild(a);
  });
}

// ---------- Task 2 详情：分页 1 题目引导 / 分页 2 示例 ----------
function renderTask2(view, week, go, toast, enableWeekJump) {
  const W = MATERIALS.writing.find(x => x.week === week) || MATERIALS.writing[0];
  enableWeekJump('writing');
  document.getElementById('page-title').textContent = `写作 W${String(week).padStart(2, '0')} · ${W.topicZh}`;
  const draftId = `w${week}`;

  view.innerHTML = `
    <div class="page-wrap">
      <div class="write-page active" id="page-task">
        <div class="scroll">
          <div class="card" style="border-left:4px solid var(--amber)">
            <span class="tag amber">Task 2</span>
            <h3 style="margin-top:8px;line-height:1.6">${W.prompt}</h3>
          </div>
          <div class="card">
            <h3>论证引导（先自己想，再动笔）</h3>
            ${[
              ['立场', W.guide['立场']],
              ['机制 · 因果链', W.guide['机制']],
              ['证据 / 例子', W.guide['证据/例子']],
              ['反方 · 最强反驳', W.guide['反方']],
              ['边界条件 · 对谁/何时成立', W.guide['边界条件']],
            ].map(([k, v]) => `<div class="guide-item"><b>${k}</b><br>${v || ''}</div>`).join('')}
          </div>
          <div class="card">
            <h3>我的作文（自动保存）</h3>
            <textarea id="draft" rows="11" placeholder="在此写作…建议 40 分钟内完成 250 词以上。"></textarea>
            <div class="row" style="margin-top:10px;justify-content:space-between">
              <span class="muted"><span id="words">0</span> 词</span>
              <span class="muted" id="save-state"></span>
            </div>
            <div class="btn-row" style="margin-top:10px">
              <button class="btn ghost" id="ai-fb">🤖 AI 按四项标准批改</button>
            </div>
          </div>
          <div class="card" id="fb-card" hidden>
            <h3>AI 反馈</h3>
            <div id="fb-body" style="font-size:14px;line-height:1.85;white-space:pre-wrap"></div>
          </div>
        </div>
        <div class="pager">
          <a class="btn ghost" href="#/writing">← 题库</a>
          <span class="indicator">第 1 / 2 页 · 题目与引导</span>
          <button class="btn amber" id="to-example">看示例主体段 →</button>
        </div>
      </div>

      <div class="write-page" id="page-example">
        <div class="scroll">
          <div class="card" style="border-left:4px solid var(--danger)">
            <h3>示例主体段</h3>
            <p class="muted" style="margin-top:0">只示范「观点-机制-例子-让步-边界」推进方式，<b>不要整段背诵</b>。</p>
            <div class="example-body">${W.example}</div>
          </div>
          <div class="card">
            <h3>自练任务</h3>
            <p style="font-size:14.5px;line-height:1.85">${W.ownTask}</p>
            <button class="btn teal" id="finish">完成本周写作 ✓</button>
          </div>
        </div>
        <div class="pager">
          <button class="btn ghost" id="back-task">← 返回题目页</button>
          <span class="indicator">第 2 / 2 页 · 范文（独立页）</span>
          ${week < 28 ? `<a class="btn" href="#/writing/${week + 1}">下一周 →</a>` : '<span></span>'}
        </div>
      </div>
    </div>`;

  // 分页切换（严格两页）
  const pageTask = view.querySelector('#page-task');
  const pageExample = view.querySelector('#page-example');
  const showPage = which => {
    pageTask.classList.toggle('active', which === 1);
    pageExample.classList.toggle('active', which === 2);
  };
  view.querySelector('#to-example').addEventListener('click', () => showPage(2));
  view.querySelector('#back-task').addEventListener('click', () => showPage(1));

  // 草稿
  const ta = view.querySelector('#draft');
  ta.value = getDraft(draftId);
  const wc = view.querySelector('#words');
  const ss = view.querySelector('#save-state');
  const countWords = () => (ta.value.trim().match(/[A-Za-z']+/g) || []).length;
  wc.textContent = countWords();
  let timer;
  ta.addEventListener('input', () => {
    wc.textContent = countWords();
    ss.textContent = '输入中…';
    clearTimeout(timer);
    timer = setTimeout(() => { setDraft(draftId, ta.value); ss.textContent = '已自动保存 ✓'; }, 500);
  });

  view.querySelector('#ai-fb').addEventListener('click', async e => {
    if (!ta.value.trim()) return toast('先写一点再批改');
    if (!hasKey()) return toast('请先在设置页填写 API Key');
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'AI 批改中…';
    try {
      const fb = await writingFeedback(ta.value, W.prompt);
      view.querySelector('#fb-card').hidden = false;
      view.querySelector('#fb-body').textContent = fb;
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false; btn.textContent = '🤖 AI 按四项标准批改';
    }
  });

  view.querySelector('#finish').addEventListener('click', () => {
    markDone('w', week);
    toast('已标记完成 ✓');
  });
}

// ---------- Task 1 微训练：分页 1 数据任务 / 分页 2 Overview 示例 ----------
function renderTask1(view, id, go, toast) {
  const idx = Number(id.split('-')[1]) - 1;
  const T = MATERIALS.task1[idx];
  if (!T) { go('#/writing'); return; }
  document.getElementById('page-title').textContent = `Task 1 微训练 ${idx + 1}`;
  const draftId = id;

  view.innerHTML = `
    <div class="page-wrap">
      <div class="write-page active" id="page-task">
        <div class="scroll">
          <div class="card" style="border-left:4px solid var(--amber)">
            <span class="tag amber">Task 1</span>
            <h3 style="margin-top:8px">${T.head}</h3>
          </div>
          <div class="card">
            <h3>数据</h3>
            <p style="font-size:14.5px;line-height:1.9">${T.data}</p>
          </div>
          <div class="card">
            <h3>任务要求</h3>
            <p style="font-size:14.5px;line-height:1.9">${T.task}</p>
            <textarea id="draft" rows="11" placeholder="150+ 词；先改写题目，再写 2 句 overview，最后两段细节…"></textarea>
            <div class="muted" style="margin-top:6px"><span id="words">0</span> 词 · <span id="save-state"></span></div>
          </div>
        </div>
        <div class="pager">
          <a class="btn ghost" href="#/writing">← 题库</a>
          <span class="indicator">第 1 / 2 页 · 数据与任务</span>
          <button class="btn amber" id="to-ex">看示例 Overview →</button>
        </div>
      </div>
      <div class="write-page" id="page-ex">
        <div class="scroll">
          <div class="card" style="border-left:4px solid var(--danger)">
            <h3>示例 Overview</h3>
            <div class="example-body">${T.overview}</div>
            <p class="muted" style="margin-top:12px">对照检查：你的 overview 是否抓住了最显著的整体趋势/对比？</p>
          </div>
        </div>
        <div class="pager">
          <button class="btn ghost" id="back-task">← 返回</button>
          <span class="indicator">第 2 / 2 页 · 示例</span>
          <a class="btn" href="#/writing/t1-${Math.min(8, idx + 2)}">下一组 →</a>
        </div>
      </div>
    </div>`;

  const show = n => {
    view.querySelector('#page-task').classList.toggle('active', n === 1);
    view.querySelector('#page-ex').classList.toggle('active', n === 2);
  };
  view.querySelector('#to-ex').addEventListener('click', () => show(2));
  view.querySelector('#back-task').addEventListener('click', () => show(1));

  const ta = view.querySelector('#draft');
  ta.value = getDraft(draftId);
  view.querySelector('#words').textContent = (ta.value.trim().match(/[A-Za-z']+/g) || []).length;
  let timer;
  ta.addEventListener('input', () => {
    view.querySelector('#words').textContent = (ta.value.trim().match(/[A-Za-z']+/g) || []).length;
    const ss = view.querySelector('#save-state');
    ss.textContent = '输入中…';
    clearTimeout(timer);
    timer = setTimeout(() => { setDraft(draftId, ta.value); ss.textContent = '已保存 ✓'; }, 500);
  });
}
