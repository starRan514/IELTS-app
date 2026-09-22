import { getSettings, updateSettings, getCurrentUser, isCloudReady, syncFromCloud } from '../store.js';
import { englishVoices, supported as ttsSupported, speak, configure } from '../tts.js';
import { testKey, hasKey } from '../ai.js';
import * as supabase from '../supabase.js';

export function render({ view, toast }) {
  document.getElementById('page-title').textContent = '设置';
  const s = getSettings();
  const user = getCurrentUser();
  const cfg = supabase.getConfig();

  view.innerHTML = `
    <div class="scroll">
      <div class="card">
        <h3>账号与同步</h3>
        ${user
          ? `<div style="font-size:14px;color:var(--ink)">👤 ${user.email}</div>
             <p class="muted" style="margin-top:6px">已登录，数据自动同步到云端（每次操作即时推送）。</p>
             <div class="btn-row" style="margin-top:10px">
               <button class="btn sm ghost" id="sync-now">立即同步</button>
               <button class="btn sm" id="sign-out">退出登录</button>
             </div>`
          : `<p class="muted" style="line-height:1.8;margin:0">未登录，数据仅保存在本浏览器（换设备会丢）。</p>
             <button class="btn sm teal" id="go-auth" style="margin-top:10px">登录 / 注册</button>`
        }
        ${!cfg
          ? `<p class="muted" style="margin-top:10px;font-size:13px">尚未配置 Supabase，到「登录」页填入 Project 信息后即可启用云端同步。</p>`
          : ''}
      </div>

      <div class="card">
        <h3>AI 大脑（OpenAI 兼容接口）</h3>
        <label class="fld">API Key
          <input type="password" id="key" placeholder="sk-..." value="${s.apiKey}">
        </label>
        <label class="fld">Base URL
          <input type="text" id="base" value="${s.baseUrl}">
        </label>
        <label class="fld">模型（可手动输入，下拉是常用候选）
          <input type="text" id="model" list="model-list" value="${s.model}" placeholder="如 deepseek-chat / gpt-4o-mini / glm-4-flash">
          <datalist id="model-list">
            <option value="gpt-4o-mini">
            <option value="gpt-4o">
            <option value="gpt-4.1-mini">
            <option value="o4-mini">
            <option value="deepseek-chat">
            <option value="deepseek-reasoner">
            <option value="glm-4-flash">
            <option value="glm-4.5">
            <option value="glm-4-plus">
            <option value="moonshot-v1-8k">
            <option value="moonshot-v1-32k">
          </datalist>
        </label>
        <div class="btn-row">
          <button class="btn sm" id="save-ai">保存</button>
          <button class="btn sm ghost" id="test-ai">测试连接</button>
        </div>
        <p class="muted" style="line-height:1.8">
          原型版 Key 仅存于本机浏览器 localStorage，请求直连 OpenAI（国内网络需代理）。<br>
          正式上线后改为 Cloudflare Worker 中转 + Supabase 加密存储，每个用户用自己的 Key，互不相见。
        </p>
      </div>

      <div class="card">
        <h3>听力/口语朗读语音</h3>
        <label class="fld">发音人（来自系统/Edge 语音库）
          <select id="voice"></select>
        </label>
        <label class="fld">语速 <span id="rate-v">${s.ttsRate}×</span>
          <input type="range" id="rate" min="0.8" max="1.2" step="0.05" value="${s.ttsRate}">
        </label>
        <button class="btn sm teal" id="test-tts">🔊 试听（英音例句）</button>
        <p class="muted" style="margin-top:10px">${ttsSupported()
          ? '想获得更多自然语音：Windows「设置 → 时间和语言 → 语音」添加英语(英国)语音；Edge 浏览器自带在线神经网络语音。'
          : '当前浏览器不支持语音合成，请使用 Chrome/Edge。'}</p>
        <p class="muted">正式版将由 Edge TTS 在服务端预生成 MP3（免费、英音澳音、多人对话），不依赖设备语音库。</p>
      </div>

      <div class="card">
        <h3>数据</h3>
        <p class="muted" style="line-height:1.8">${user
          ? '已登录账号：进度、单词卡、草稿、导入材料会自动同步到云端，可跨设备访问。'
          : '未登录：进度、单词卡、草稿全部保存在本浏览器。登录账号后可同步到云端。'}</p>
        <button class="btn sm ghost" id="export">导出数据 (JSON)</button>
      </div>
    </div>`;

  // 语音列表
  const voiceSel = view.querySelector('#voice');
  const fillVoices = () => {
    const vs = englishVoices();
    voiceSel.innerHTML = vs.length
      ? vs.map(v => `<option value="${v.voiceURI}" ${v.voiceURI === s.ttsVoiceURI ? 'selected' : ''}>${v.name} (${v.lang})${v.localService ? '' : ' · 在线'}</option>`).join('')
      : '<option value="">（未检测到英语语音）</option>';
  };
  fillVoices();
  if (!englishVoices().length && 'speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => { fillVoices(); };
  }

  const save = () => {
    updateSettings({
      apiKey: view.querySelector('#key').value.trim(),
      baseUrl: view.querySelector('#base').value.trim() || 'https://api.openai.com/v1',
      model: view.querySelector('#model').value,
      ttsVoiceURI: voiceSel.value,
      ttsRate: parseFloat(view.querySelector('#rate').value),
    });
    toast('已保存 ✓');
  };

  view.querySelector('#save-ai').addEventListener('click', save);
  view.querySelector('#voice').addEventListener('change', save);
  view.querySelector('#rate').addEventListener('input', e => {
    view.querySelector('#rate-v').textContent = e.target.value + '×';
  });
  view.querySelector('#rate').addEventListener('change', save);

  view.querySelector('#test-tts').addEventListener('click', () => {
    updateSettings({ ttsVoiceURI: voiceSel.value, ttsRate: parseFloat(view.querySelector('#rate').value) });
    configure({ voiceURI: voiceSel.value, rate: parseFloat(view.querySelector('#rate').value) });
    speak("Good learning environments reduce unnecessary switching and unclear goals.");
  });

  view.querySelector('#test-ai').addEventListener('click', async e => {
    save();
    const b = e.target;
    b.disabled = true; b.textContent = '测试中…';
    try {
      const out = await testKey();
      toast(out ? '连接成功 ✓（返回：' + out.slice(0, 20) + '）' : '连接成功', 3000);
    } catch (err) {
      toast(err.message, 4000);
    } finally {
      b.disabled = false; b.textContent = '测试连接';
    }
  });

  view.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(JSON.parse(localStorage.getItem('ielts-app-v1')), null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ielts-app-backup.json';
    a.click();
  });

  // 账号按钮（只在对应状态下挂载）
  view.querySelector('#go-auth')?.addEventListener('click', () => location.hash = '#/auth');
  view.querySelector('#sign-out')?.addEventListener('click', async () => {
    try { await supabase.signOut(); toast('已退出登录'); location.hash = '#/home'; }
    catch (err) { toast(err.message, 4000); }
  });
  view.querySelector('#sync-now')?.addEventListener('click', async e => {
    const b = e.target;
    b.disabled = true; b.textContent = '同步中…';
    try {
      const r = await syncFromCloud();
      toast(r ? `同步完成 ✓` : '已是最新', 3000);
    } catch (err) { toast('同步失败：' + err.message, 5000); }
    finally { b.disabled = false; b.textContent = '立即同步'; }
  });
}
