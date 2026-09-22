import { MATERIALS } from '../data.js';
import { markDone } from '../store.js';
import * as tts from '../tts.js';

function parseQ(block) {
  const lines = block.split('\n');
  const stem = lines[0].replace(/^\d+\.\s*/, '');
  const options = [];
  const rest = [];
  for (const l of lines.slice(1)) {
    const m = l.match(/^([A-D])\.\s*(.+)$/);
    if (m) options.push({ key: m[1], text: m[2] });
    else rest.push(l);
  }
  return { stem: stem + (rest.length ? ' ' + rest.join(' ') : ''), options };
}

export function render({ view, param, go, toast, enableWeekJump }) {
  const week = Number(param) || 1;
  const L = MATERIALS.listening.find(x => x.week === week) || MATERIALS.listening[0];
  enableWeekJump('listening');
  document.getElementById('page-title').textContent = `听力 W${String(week).padStart(2, '0')} · ${L.topicZh}`;

  view.innerHTML = `
    <div class="scroll">
      <div class="audio-bar">
        <div class="row" style="margin-bottom:8px">
          <button class="btn" id="play">▶ 播放听力（模拟只听 1 遍）</button>
          <span style="flex:1"></span>
          <label>倍速
            <select id="rate" style="width:78px">
              <option value="0.95">0.95×</option>
              <option value="1" selected>1.0×</option>
              <option value="1.05">1.05×</option>
            </select>
          </label>
        </div>
        <div class="muted" style="color:rgba(255,255,255,.85);font-size:12px">
          雅思 Section 4 风格独白 · 建议先读题 15-30 秒再播放
        </div>
      </div>

      <div class="card">
        <h3>A. Questions <span class="tag amber">勿看听力稿</span></h3>
        <div id="questions"></div>
      </div>

      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn ghost" id="toggle-script">📄 显示听力稿（精听）</button>
        <button class="btn teal" id="toggle-answers">🔑 对答案</button>
      </div>

      <div class="card" id="script-card" hidden>
        <h3>B. Listening Script</h3>
        <p class="muted" style="margin-top:0">点任意一句可单独重播，用于逐句精听与 shadowing。</p>
        <div id="script"></div>
      </div>

      <div class="card" id="answer-card" hidden>
        <h3>C. Answer Key</h3>
        <p style="font-size:14.5px;line-height:1.9">${L.answers}</p>
      </div>

      <div class="card">
        <h3>精听任务</h3>
        <p class="muted" style="line-height:1.8">${L.followTask}</p>
        <button class="btn" id="finish" style="margin-top:6px">完成本套，标记进度</button>
      </div>
    </div>`;

  const qWrap = view.querySelector('#questions');
  L.questions.forEach((qb, qi) => {
    const q = parseQ(qb);
    const div = document.createElement('div');
    div.className = 'q-block';
    let opts = '';
    if (q.options.length) {
      opts = q.options.map(o => `
        <label class="opt"><input type="radio" name="q${qi}" value="${o.key}">
        <b>${o.key}.</b> ${o.text}</label>`).join('');
    } else {
      opts = `<input type="text" data-q="${qi}" placeholder="在此作答…">`;
    }
    div.innerHTML = `<div class="q-stem">${qi + 1}. ${q.stem}</div>${opts}`;
    qWrap.appendChild(div);
  });

  // 播放控制
  const playBtn = view.querySelector('#play');
  let played = 0;
  playBtn.addEventListener('click', () => {
    if (tts.isSpeaking()) { tts.stop(); playBtn.textContent = '▶ 播放听力'; return; }
    tts.configure({ rate: parseFloat(view.querySelector('#rate').value) });
    played++;
    playBtn.innerHTML = '<span class="pulse">🔊 播放中…点击停止</span>';
    tts.speak(L.script, {
      onEnd: () => { playBtn.textContent = played >= 2 ? '▶ 再听一遍（精听）' : '▶ 再听一遍（第 2 遍定位错题）'; },
    });
  });

  // 逐句精听
  const sentences = L.script.match(/[^.!?]+[.!?]+/g) || [L.script];
  const scriptEl = view.querySelector('#script');
  sentences.forEach(s => {
    const span = document.createElement('span');
    span.className = 'script-line';
    span.textContent = s.trim();
    span.addEventListener('click', () => {
      tts.configure({ rate: parseFloat(view.querySelector('#rate').value) });
      tts.stop();
      setTimeout(() => tts.speak(s.trim()), 60);
    });
    scriptEl.appendChild(span);
  });

  view.querySelector('#toggle-script').addEventListener('click', e => {
    const c = view.querySelector('#script-card');
    c.hidden = !c.hidden;
    e.target.textContent = c.hidden ? '📄 显示听力稿（精听）' : '📄 隐藏听力稿';
  });
  view.querySelector('#toggle-answers').addEventListener('click', e => {
    const c = view.querySelector('#answer-card');
    c.hidden = !c.hidden;
    e.target.textContent = c.hidden ? '🔑 对答案' : '🔑 隐藏答案';
  });
  view.querySelector('#finish').addEventListener('click', () => {
    markDone('l', week);
    toast('已标记完成 ✓');
    if (week < 28) setTimeout(() => go(`#/listening/${week + 1}`), 600);
  });

  return () => tts.stop();
}
