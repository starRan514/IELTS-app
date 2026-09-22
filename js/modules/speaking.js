import { MATERIALS } from '../data.js';
import { markDone } from '../store.js';
import { hasKey, examinerReply } from '../ai.js';
import * as tts from '../tts.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function render({ view, param, go, toast, enableWeekJump }) {
  if (!param) return renderIndex(view, go);
  return renderPractice(view, Number(param), go, toast, enableWeekJump);
}

function renderIndex(view, go) {
  document.getElementById('page-title').textContent = '口语 · Speaking';
  view.innerHTML = `
    <div class="scroll">
      <div class="card">
        <h3>三阶段训练</h3>
        <p class="muted" style="margin:0;line-height:1.8">
          W1-8 素材期（先读题准备词块/故事）→ W9-16 半模拟 → W17-28 每日 AI 模考。<br>
          AI 考官一次只问一题、按 Part 1→2→3 推进并自然追问，结束后按官方四项标准评分。
        </p>
      </div>
      <div class="card">
        <h3>28 个主题口语包</h3>
        <div class="week-grid" id="grid"></div>
      </div>
    </div>`;
  const grid = view.querySelector('#grid');
  MATERIALS.speaking.forEach(s => {
    const a = document.createElement('a');
    a.className = 'week-cell';
    a.href = `#/speaking/${s.week}`;
    a.innerHTML = `<span class="wn">${String(s.week).padStart(2, '0')}</span>
      <span class="wt" title="${s.topicZh}">${s.topicZh}</span>`;
    grid.appendChild(a);
  });
}

function renderPractice(view, week, go, toast, enableWeekJump) {
  const S = MATERIALS.speaking.find(x => x.week === week) || MATERIALS.speaking[0];
  enableWeekJump('speaking');
  document.getElementById('page-title').textContent = `口语 W${String(week).padStart(2, '0')} · ${S.topicZh}`;

  view.innerHTML = `
    <div id="brief" class="scroll">
      <div class="card">
        <h3>Part 1 · 热身</h3>
        ${S.part1.map(q => `<div class="question-item"><span class="qi-role">P1</span> ${q}</div>`).join('')}
      </div>
      <div class="card">
        <h3>Part 2 · Cue Card（1 分钟准备，说 1-2 分钟）</h3>
        <div class="question-item">${S.cueCard}</div>
      </div>
      <div class="card">
        <h3>Part 3 · 深度追问</h3>
        ${S.part3.map(q => `<div class="question-item"><span class="qi-role">P3</span> ${q}</div>`).join('')}
        <p class="muted" style="line-height:1.8">💡 ${S.guide}</p>
      </div>
      <div class="card">
        <h3>示例 Part 3 回答（展开方式示范）</h3>
        <details><summary class="muted" style="cursor:pointer">点开查看，朗读 → 复述 → 改写，不要背稿</summary>
          <p style="font-size:14px;line-height:1.85">${S.example}</p>
          <p class="muted">🔧 ${S.upgrade}</p>
        </details>
      </div>
      <button class="btn" style="width:100%;padding:14px;font-size:16px" id="start">🎙 开始 AI 考官模考</button>
      ${!hasKey() ? '<p class="muted" style="text-align:center">开始前需先到「设置」填写 OpenAI API Key（语音识别用浏览器内置，免费）</p>' : ''}
    </div>

    <div id="exam" hidden style="flex:1;min-height:0;display:flex;flex-direction:column">
      <div class="chat" id="chat"></div>
      <div class="chat-bar">
        <button class="mic" id="mic" title="按住说话（点击开始/停止收音）">🎙</button>
        <input type="text" id="typed" placeholder="也可直接打字回答…">
        <button class="btn" id="send">发送</button>
        <button class="btn ghost sm" id="grade">评分</button>
      </div>
    </div>`;

  view.querySelector('#start').addEventListener('click', () => {
    if (!hasKey()) return toast('请先在设置页配置 API Key');
    view.querySelector('#brief').hidden = true;
    const exam = view.querySelector('#exam');
    exam.hidden = false;
    startExam();
  });

  const chatEl = view.querySelector('#chat');
  const micBtn = view.querySelector('#mic');
  const input = view.querySelector('#typed');
  let history = [];
  let busy = false;
  let recognition = null;
  let recognizing = false;

  function bubble(role, text) {
    const d = document.createElement('div');
    d.className = `bubble ${role === 'user' ? 'me' : role === 'system' ? 'sys' : 'ai'}`;
    d.textContent = text;
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
    return d;
  }

  async function askAI() {
    busy = true;
    const wait = bubble('system', '考官思考中…');
    try {
      const reply = await examinerReply(history);
      wait.remove();
      history.push({ role: 'assistant', content: reply });
      bubble('ai', reply);
      tts.stop();
      tts.speak(reply);
    } catch (err) {
      wait.remove();
      bubble('sys', '⚠️ ' + err.message);
    } finally {
      busy = false;
    }
  }

  async function sendUser(text, fromVoice) {
    text = text.trim();
    if (!text || busy) return;
    history.push({ role: 'user', content: text });
    bubble('me', text + (fromVoice ? ' 🔤' : ''));
    await askAI();
  }

  function startExam() {
    history = [];
    chatEl.innerHTML = '';
    bubble('sys', '模考开始。像真实考试一样自然回答，考官一次只问一个问题。');
    const kickoff = `Good luck with your speaking test today. Let's begin with Part 1. ${S.part1[0]}`;
    history.push({ role: 'assistant', content: kickoff });
    bubble('ai', kickoff);
    tts.speak(kickoff);
  }

  // 文字发送
  view.querySelector('#send').addEventListener('click', () => {
    sendUser(input.value).then(() => { input.value = ''; });
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { sendUser(input.value).then(() => { input.value = ''; }); }
  });

  // 语音识别
  if (!SR) {
    micBtn.title = '当前浏览器不支持语音识别，请用 Chrome/Edge，或直接打字';
    micBtn.addEventListener('click', () => toast('请用 Chrome/Edge 获得语音识别，或直接打字'));
  } else {
    micBtn.addEventListener('click', () => {
      if (busy) return toast('请等考官说完');
      if (recognizing) { recognition.stop(); return; }   // 再点一次 = 说完了
      recognition = new SR();
      recognition.lang = 'en-GB';
      recognition.interimResults = true;
      recognition.continuous = true;
      let interim = null;
      let finalText = '';
      recognition.onstart = () => {
        recognizing = true;
        micBtn.classList.add('rec');
        tts.stop();
        interim = bubble('sys', '🎙 正在听…（说英语，说完再点一下麦克风）');
      };
      recognition.onresult = e => {
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += tr + ' ';
          else interimText += tr;
        }
        if (interim) interim.textContent = '🎙 ' + finalText + interimText;
      };
      recognition.onerror = e => {
        if (e.error === 'not-allowed') toast('麦克风权限被拒绝，可在地址栏左侧开启');
        else if (e.error !== 'aborted' && e.error !== 'no-speech')
          toast('识别失败：' + e.error + '（可直接打字）');
      };
      recognition.onend = () => {
        recognizing = false;
        micBtn.classList.remove('rec');
        interim?.remove();
        if (finalText.trim()) sendUser(finalText, true);
      };
      recognition.start();
    });
  }

  // 结束评分
  view.querySelector('#grade').addEventListener('click', async () => {
    if (busy) return;
    await sendUser('请结束模拟并按四项评分标准给出详细反馈');
    markDone('s', week);
  });

  return () => { try { recognition?.abort(); } catch {} tts.stop(); };
}
