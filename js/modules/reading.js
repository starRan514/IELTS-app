import { MATERIALS } from '../data.js';
import { markDone, isDone, ensureChunkCards } from '../store.js';
import * as tts from '../tts.js';

export function render({ view, param, go, toast, enableWeekJump }) {
  const week = Number(param) || 1;
  const r = MATERIALS.reading.find(x => x.week === week) || MATERIALS.reading[0];
  enableWeekJump('reading');
  document.getElementById('page-title').textContent = `阅读 W${String(week).padStart(2, '0')} · ${r.topicZh}`;

  view.innerHTML = `
    <div class="page-wrap">
      <div class="row" style="padding-top:12px">
        <span class="tag">${r.difficulty}</span>
        <span class="tag teal">⏱ ${r.timeLimit}</span>
        <span style="flex:1"></span>
        <button class="btn sm ghost" id="read-aloud">🔊 朗读</button>
      </div>
      <div class="page-stage" id="stage"></div>
      <div class="pager">
        <button class="btn ghost" id="prev">← 上一页</button>
        <span class="indicator" id="indicator"></span>
        <button class="btn" id="next">下一页 →</button>
      </div>
    </div>`;

  const stage = view.querySelector('#stage');
  const pages = []; // 每页 {type, html}

  // ---- 正文分页（按实际渲染高度切，绝不滚动） ----
  const measure = document.createElement('div');
  measure.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;';
  stage.appendChild(measure);

  const PAD_H = 44, PAD_V = 22 + 16;   // 与 .page 内边距一致
  measure.style.width = (stage.clientWidth - PAD_H) + 'px';
  const availH = stage.clientHeight - PAD_V;

  function fillPages(paragraphs) {
    const out = [];
    let cur = [];
    let first = true;
    const flush = () => { out.push({ title: first, paras: cur }); cur = []; first = false; };
    for (const p of paragraphs) {
      const trial = [...cur, p];
      measure.innerHTML =
        (first ? `<div class="passage-title">${r.passageTitle}</div>` : '') +
        trial.map(t => `<p class="passage-p">${t}</p>`).join('');
      if (measure.scrollHeight > availH && cur.length) {
        flush();
        cur = [p];
      } else {
        cur = trial;
      }
    }
    if (cur.length || out.length === 0) flush();
    return out;
  }

  const textPages = fillPages(r.paragraphs);
  measure.remove();

  textPages.forEach((pg, idx) => {
    pages.push({
      html: `
        ${pg.title ? `<div class="passage-title">${r.passageTitle}</div>` : ''}
        <div class="page-body">${pg.paras.map(p => `<p class="passage-p">${p}</p>`).join('')}</div>`,
    });
  });

  // 词块页
  pages.push({
    html: `<div class="passage-title" style="font-size:18px">核心词块 · ${r.chunks.length} 个</div>
      <div class="page-body">
        <div class="chip-list">${r.chunks.map(c => `<span class="chip">${c}</span>`).join('')}</div>
        <p class="muted" style="margin-top:16px;line-height:1.8">每篇只收 6-8 个高价值词块。点下方按钮一键加入背诵卡，
        之后在「单词」页用 AI 联想记忆法逐个攻克。</p>
        <button class="btn teal" id="add-chunks">加入单词卡 (+${r.chunks.length})</button>
      </div>`,
    onMount: el => {
      el.querySelector('#add-chunks')?.addEventListener('click', () => {
        const n = ensureChunkCards(r.chunks.map(c => ({
          term: c, week, context: r.passageTitle, source: `阅读 W${week}`,
        })));
        toast(n ? `已加入 ${n} 张卡` : '这些词块已在卡片库中');
      });
    },
  });

  // 思考题页
  pages.push({
    html: `<div class="passage-title" style="font-size:18px">深度思考</div>
      <div class="page-body">
        <div class="card" style="box-shadow:none;border:1px solid var(--line);margin-bottom:12px">
          <span class="tag">Q1 机制 / 证据</span>
          <p style="font-size:14.5px;line-height:1.8;margin:8px 0 0">${r.q1}</p>
        </div>
        <div class="card" style="box-shadow:none;border:1px solid var(--line)">
          <span class="tag amber">Q2 局限 / 迁移</span>
          <p style="font-size:14.5px;line-height:1.8;margin:8px 0 0">${r.q2}</p>
        </div>
        <p class="muted" style="margin-top:14px">✍️ 用自己的话口头或书面回答；延伸检索：${r.search}</p>
        <button class="btn" style="margin-top:6px" id="finish-reading">完成本篇，标记进度</button>
      </div>`,
    onMount: el => {
      el.querySelector('#finish-reading')?.addEventListener('click', () => {
        markDone('r', week);
        toast('已标记完成 ✓');
        if (week < 28) setTimeout(() => go(`#/reading/${week + 1}`), 600);
      });
    },
  });

  // ---- 渲染与翻页 ----
  let idx = 0;
  const pageEls = pages.map(p => {
    const d = document.createElement('div');
    d.className = 'page';
    d.innerHTML = p.html;
    stage.appendChild(d);
    // 事件只绑定一次，避免反复激活页面时重复触发
    p.onMount?.(d);
    return d;
  });

  function show(n) {
    idx = Math.max(0, Math.min(pages.length - 1, n));
    pageEls.forEach((el, i) => el.classList.toggle('active', i === idx));
    view.querySelector('#indicator').textContent = `第 ${idx + 1} / ${pages.length} 页`;
    view.querySelector('#prev').disabled = idx === 0;
    view.querySelector('#next').textContent = idx === pages.length - 1 ? '已是末页' : '下一页 →';
    view.querySelector('#next').disabled = idx === pages.length - 1;
  }
  view.querySelector('#prev').addEventListener('click', () => show(idx - 1));
  view.querySelector('#next').addEventListener('click', () => show(idx + 1));
  document.addEventListener('keydown', keyNav);
  function keyNav(e) {
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  }
  // 触屏滑动
  let tx = 0;
  stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 55) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
  // 朗读
  let readingAloud = false;
  view.querySelector('#read-aloud').addEventListener('click', () => {
    if (readingAloud) { tts.stop(); readingAloud = false; return; }
    readingAloud = true;
    tts.speak(`${r.passageTitle}. ${r.paragraphs.join(' ')}`, { onEnd: () => { readingAloud = false; } });
  });

  const ro = new ResizeObserver(() => {
    // 尺寸变化（旋转屏等）回到第一页，重新分页成本高，原型保持简单
  });
  ro.observe(stage);

  show(0);
  return () => { document.removeEventListener('keydown', keyNav); tts.stop(); ro.disconnect(); };
}
