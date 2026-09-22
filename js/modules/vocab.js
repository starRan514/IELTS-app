import { MATERIALS } from '../data.js';
import {
  getDueCards, getNewCards, reviewCard, getCard, setCardMnemonic,
  addCustomCard, ensureChunkCards, getState,
} from '../store.js';
import { hasKey, generateMnemonic } from '../ai.js';
import * as tts from '../tts.js';

const SESSION_SIZE = 20;

export function render({ view, toast }) {
  document.getElementById('page-title').textContent = '单词背诵卡';
  view.innerHTML = `<div id="vocab-root" class="scroll"></div>`;
  const root = view.querySelector('#vocab-root');

  function dashboard() {
    const due = getDueCards();
    const fresh = getNewCards();
    const total = getState().vocab.length;
    root.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="big-stat">${due.length}</div>
        <div class="muted">张卡待复习</div>
        <div style="margin:6px 0 14px" class="muted">未学新词 ${fresh.length} · 卡片总量 ${total}</div>
        <button class="btn teal" id="study" style="width:100%;padding:13px;font-size:16px">
          ${due.length || fresh.length ? '开始今日学习' : '🎉 今天没有待复习卡片'}
        </button>
      </div>
      <div class="card">
        <h3>添加单词</h3>
        <label class="fld">英文词块
          <input type="text" id="new-term" placeholder="例如 selective attention">
        </label>
        <label class="fld">中文释义（可选，AI 也会自动生成）
          <input type="text" id="new-meaning" placeholder="选择性注意">
        </label>
        <label class="fld">语境句子（可选）
          <input type="text" id="new-ctx" placeholder="看到它的原句…">
        </label>
        <button class="btn sm ghost" id="add-word">+ 添加到卡片库</button>
        <p class="muted" style="margin-top:12px">阅读页每篇的「核心词块」也可一键加入；点下方可一次性导入全部 28 周词块。</p>
        <button class="btn sm" id="add-all">📦 导入全部词块（28周 × 6个）</button>
      </div>
      <div class="card">
        <h3>联想记忆法说明</h3>
        <p class="muted" style="line-height:1.85;margin:0">
          翻卡后由 AI 生成：①词根词缀拆解 ②发音/画面联想故事 ③一句话离奇画面 ④雅思场景例句。
          配合 SM-2 间隔重复：「忘了」当天重现，「模糊」次日，「认识」按熟练度递增间隔。
        </p>
      </div>`;

    root.querySelector('#study').disabled = !(due.length || fresh.length);
    root.querySelector('#study').addEventListener('click', () => {
      const queue = [...due, ...fresh.filter(c => !due.includes(c))].slice(0, SESSION_SIZE);
      study(queue, 0);
    });
    root.querySelector('#add-word').addEventListener('click', () => {
      const term = root.querySelector('#new-term').value.trim();
      if (!term) return toast('请输入单词');
      const ok = addCustomCard(term, root.querySelector('#new-meaning').value.trim(),
        root.querySelector('#new-ctx').value.trim());
      toast(ok ? '已添加' : '该词已在卡片库');
      if (ok) dashboard();
    });
    root.querySelector('#add-all').addEventListener('click', () => {
      const items = MATERIALS.reading.flatMap(r =>
        r.chunks.map(c => ({ term: c, week: r.week, context: r.passageTitle, source: `阅读 W${r.week}` })));
      const n = ensureChunkCards(items);
      toast(n ? `导入 ${n} 张新卡` : '全部词块已在卡片库');
      dashboard();
    });
  }

  function study(queue, i) {
    if (i >= queue.length) {
      root.innerHTML = `
        <div class="empty" style="padding-top:120px">
          <div style="font-size:52px">🎉</div>
          <p style="font-size:17px;color:var(--ink)">本组完成！</p>
          <p>间隔重复已安排好下次复习时间。</p>
          <button class="btn" id="back">返回单词首页</button>
        </div>`;
      root.querySelector('#back').addEventListener('click', dashboard);
      return;
    }
    const card = getCard(queue[i].id) || queue[i];
    root.innerHTML = `
      <div style="padding:10px 4px" class="muted">${i + 1} / ${queue.length} · ${card.source}</div>
      <div class="study-stage">
        <div class="flashcard" id="card">
          <div class="flash-inner">
            <div class="flash-face flash-front">
              <div class="flash-term">${card.term}</div>
              ${card.context ? `<div class="flash-context">“${card.context}”</div>` : ''}
              <div class="flash-hint">👆 点击卡片翻面 · <span id="speak-term">🔊 朗读</span></div>
            </div>
            <div class="flash-face flash-back" id="back-face">
              <div id="mnemonic-area"></div>
            </div>
          </div>
        </div>
        <div class="rate-row" id="rate-row" hidden>
          <button class="btn rate-bad" data-r="0">😖 忘了</button>
          <button class="btn rate-meh" data-r="1">🤔 模糊</button>
          <button class="btn rate-good" data-r="2">😎 认识</button>
        </div>
      </div>`;

    const cardEl = root.querySelector('#card');
    const back = root.querySelector('#mnemonic-area');
    const rateRow = root.querySelector('#rate-row');
    let flipped = false;
    let mnemonicLoaded = !!(card.meaning || card.mnemonic);

    function showBack() {
      rateRow.hidden = false;
      if (mnemonicLoaded) {
        renderMnemonic(card);
        return;
      }
      back.innerHTML = `<div class="empty" style="padding:30px 10px">
        ${hasKey()
          ? '<div class="spinner" style="border-color:#c9d6e6;border-top-color:var(--navy-2)"></div><p>AI 正在生成联想记忆…</p>'
          : '<p>未配置 API Key。<br>你可以先自评，或到设置页配置后自动生成联想。</p>'
            + '<button class="btn sm ghost" id="skip-m">仅自评</button>'}
      </div>`;
      if (!hasKey()) {
        back.querySelector('#skip-m')?.addEventListener('click', () => {
          back.innerHTML = `<div class="flash-term" style="font-size:17px">${card.term}</div>
            <p class="muted">配置 API Key 后将在此显示联想记忆</p>`;
        });
        return;
      }
      generateMnemonic(card.term, card.context)
        .then(m => { setCardMnemonic(card.id, m); mnemonicLoaded = true; Object.assign(card, m); renderMnemonic(card); })
        .catch(err => {
          back.innerHTML = `<p class="muted">生成失败：${err.message}</p>
            <button class="btn sm ghost" id="retry">重试</button>`;
          back.querySelector('#retry').addEventListener('click', showBack);
        });
    }

    function renderMnemonic(c) {
      back.innerHTML = `
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${c.meaning || ''}
          <button class="btn sm ghost" id="speak-back" style="float:right">🔊</button>
        </div>
        <p style="font-size:14px;line-height:1.85;margin:10px 0">${c.mnemonic || ''}</p>
        ${c.association ? `<div style="background:#fdf0dd;border-radius:10px;padding:9px 12px;font-size:13.5px;line-height:1.7">🖼 ${c.association}</div>` : ''}
        ${c.example ? `<p style="font-size:13.5px;font-style:italic;color:var(--ink-2);margin:10px 0 0;line-height:1.7">${c.example}</p>` : ''}
        <p class="muted" style="font-size:12px;margin-top:8px" id="regen-wrap"></p>`;
      back.querySelector('#speak-back')?.addEventListener('click', () => tts.speak(`${c.term}. ${c.example || ''}`));
    }

    cardEl.addEventListener('click', e => {
      if (e.target.id === 'speak-term' || e.target.closest('button')) {
        tts.speak(card.term);
        return;
      }
      if (!flipped) { flipped = true; cardEl.classList.add('flipped'); showBack(); }
    });

    rateRow.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const r = Number(b.dataset.r);
        reviewCard(card.id, r);
        tts.stop();
        if (r === 0) queue.push(card); // 忘了：排到本组末尾重现
        study(queue, i + 1);
      });
    });
  }

  dashboard();
  return () => tts.stop();
}
