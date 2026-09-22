import { MATERIALS } from '../data.js';
import { weekProgress, moduleDoneCount, getDueCards, getNewCards } from '../store.js';

export function render({ view, go, enableWeekJump }) {
  view.innerHTML = `
    <div class="scroll">
      <div class="card" style="background:linear-gradient(135deg,#1f3a5f,#2c5282);color:#fff">
        <div style="font-size:13px;opacity:.85">IELTS Academic · 目标 7.0-7.5</div>
        <div style="font-size:20px;font-weight:700;margin:4px 0 10px">28 周系统训练</div>
        <div class="row" style="gap:16px;font-size:13px">
          <span>📖 阅读 ${moduleDoneCount('r')}/28</span>
          <span>🎧 听力 ${moduleDoneCount('l')}/28</span>
          <span>✍️ 写作 ${moduleDoneCount('w')}/28</span>
          <span>🗣️ 口语 ${moduleDoneCount('s')}/28</span>
        </div>
      </div>

      <div class="module-grid">
        <a class="module-tile mt-reading" href="#/reading/1">
          <span class="mt-title">📖 Reading</span>
          <span class="mt-sub">28 篇 · 限时翻页阅读</span>
        </a>
        <a class="module-tile mt-listening" href="#/listening/1">
          <span class="mt-title">🎧 Listening</span>
          <span class="mt-sub">28 套 · TTS 英音模考</span>
        </a>
        <a class="module-tile mt-writing" href="#/writing">
          <span class="mt-title">✍️ Writing</span>
          <span class="mt-sub">28 Task2 + 8 Task1</span>
        </a>
        <a class="module-tile mt-speaking" href="#/speaking">
          <span class="mt-title">🗣️ Speaking</span>
          <span class="mt-sub">AI 考官实时对练</span>
        </a>
      </div>

      <div class="card row" style="justify-content:space-between">
        <div>
          <b>今日单词</b>
          <div class="muted">待复习 <b id="due-cnt"></b> · 新词 <b id="new-cnt"></b></div>
        </div>
        <a class="btn teal sm" href="#/vocab">开始背 🃏</a>
      </div>

      <div class="card">
        <h3>选择周次</h3>
        <div class="week-grid" id="week-grid"></div>
      </div>
    </div>`;

  const grid = view.querySelector('#week-grid');
  MATERIALS.reading.forEach(r => {
    let doneCount = weekProgress(r.week);
    const a = document.createElement('a');
    a.className = 'week-cell';
    a.href = `#/week/${r.week}`;
    const dots = ['r', 'l', 'w', 's'].map(() =>
      `<span class="d ${doneCount-- > 0 ? 'on' : ''}">●</span>`).join('');
    a.innerHTML = `
      <span class="wn">${String(r.week).padStart(2, '0')}</span>
      <span class="wt" title="${r.topicZh}">${r.topicZh}</span>
      <span class="dots">${dots}</span>`;
    grid.appendChild(a);
  });

  // 点击周格 -> 进入该周四科选择
  grid.addEventListener('click', e => {
    const cell = e.target.closest('.week-cell');
    if (!cell) return;
    e.preventDefault();
    const w = cell.querySelector('.wn').textContent;
    showWeekMenu(Number(w), go);
  });

  view.querySelector('#due-cnt').textContent = getDueCards().length;
  view.querySelector('#new-cnt').textContent = getNewCards().length;
}

function showWeekMenu(w, go) {
  const r = MATERIALS.reading.find(x => x.week === w);
  const mask = document.createElement('div');
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(20,30,45,.45);z-index:80;display:flex;align-items:flex-end;justify-content:center';
  mask.innerHTML = `
    <div style="background:#fff;width:100%;max-width:860px;border-radius:18px 18px 0 0;padding:18px 18px calc(24px + env(safe-area-inset-bottom))">
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:13px;color:#556270">Week ${String(w).padStart(2,'0')}</div>
        <div style="font-size:19px;font-weight:700;color:#1f3a5f">${r.topicZh} · ${r.titleEn}</div>
      </div>
      <div class="module-grid">
        <a class="module-tile mt-reading" href="#/reading/${w}"><span class="mt-title">📖 阅读</span><span class="mt-sub">${r.timeLimit}</span></a>
        <a class="module-tile mt-listening" href="#/listening/${w}"><span class="mt-title">🎧 听力</span><span class="mt-sub">1 遍模考 + 精听</span></a>
        <a class="module-tile mt-writing" href="#/writing/${w}"><span class="mt-title">✍️ 写作</span><span class="mt-sub">题目+引导</span></a>
        <a class="module-tile mt-speaking" href="#/speaking/${w}"><span class="mt-title">🗣️ 口语</span><span class="mt-sub">AI 考官对练</span></a>
      </div>
      <button class="btn ghost" id="menu-close" style="width:100%;margin-top:12px">关闭</button>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  mask.querySelector('#menu-close').addEventListener('click', close);
}
