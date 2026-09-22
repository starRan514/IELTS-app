import { getState, addCustom, removeCustom } from '../store.js';
import * as tts from '../tts.js';

export async function render({ view, toast }) {
  document.getElementById('page-title').textContent = '导入材料';
  view.innerHTML = `
    <div class="scroll">
      <div class="card" style="border-left:4px solid var(--teal)">
        <h3>📂 加载本地材料目录</h3>
        <p class="muted" style="line-height:1.8;margin-top:0">
          选择一个本地文件夹（推荐 <code>D:\\tools\\IELTS</code>），其中的全部 .docx / .pdf / .txt
          会被批量解析并入库；同名文件自动跳过，已导入文件可在下方删除后重新导入。
        </p>
        <input type="file" id="dir" webkitdirectory directory multiple style="margin-bottom:10px">
        <div id="dir-status" class="muted"></div>
      </div>

      <div class="card">
        <h3>导入单个 Word / PDF 文件</h3>
        <p class="muted" style="line-height:1.85;margin-top:0">
          支持 .docx（解析最准）与文字版 .pdf。扫描图片版 PDF 需先 OCR（后续版本）。<br>
          与本手册同结构（Week + Questions/Script）的文件，后续会自动拆成听说读写模块。
        </p>
        <input type="file" id="file" accept=".docx,.pdf,.txt" style="margin-bottom:10px">
        <div id="parse-status" class="muted"></div>
      </div>
      <div class="card">
        <h3>已导入（${getState().customs.length}）</h3>
        <div id="custom-list"></div>
      </div>
      <div id="reader"></div>
    </div>`;

  const fileInput = view.querySelector('#file');
  const dirInput = view.querySelector('#dir');
  const status = view.querySelector('#parse-status');
  const dirStatus = view.querySelector('#dir-status');

  // ---------- 单文件导入 ----------
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = '正在解析 ' + file.name + ' …';
    try {
      const mat = await importOne(file);
      status.textContent = '';
      fileInput.value = '';
      toast(`导入成功：${mat.chars} 字 ✓`);
      renderList();
      openReader(mat.id);
    } catch (err) {
      status.textContent = '❌ ' + err.message;
    }
  });

  // ---------- 批量导入目录 ----------
  dirInput.addEventListener('change', async () => {
    const files = Array.from(dirInput.files || [])
      .filter(f => /\.(docx|pdf|txt)$/i.test(f.name));
    if (!files.length) { dirStatus.textContent = '该目录没有 .docx/.pdf/.txt 文件。'; return; }
    const existing = new Set(getState().customs.map(m => m.name));
    const todo = files.filter(f => !existing.has(f.name));
    if (!todo.length) {
      dirStatus.innerHTML = `目录共 ${files.length} 个材料文件，<b>全部已导入</b>，无需重复。`;
      return;
    }
    let done = 0, failed = 0;
    dirStatus.textContent = `开始解析 ${todo.length} 个文件（已导入 ${files.length - todo.length} 个）…`;
    for (const f of todo) {
      try {
        await importOne(f);
        done++;
        dirStatus.textContent = `进度 ${done}/${todo.length}：${f.name}`;
      } catch (err) {
        failed++;
        dirStatus.textContent = `进度 ${done}/${todo.length}，失败 ${failed}：${f.name}（${err.message}）`;
      }
      renderList();
    }
    dirStatus.innerHTML = `✅ 完成：成功 ${done} 个${failed ? `，失败 ${failed} 个` : ''}。共 ${getState().customs.length} 份材料在库。`;
    dirInput.value = '';
  });

  async function importOne(file) {
    const text = await extract(file);
    if (!text.trim()) throw new Error('未提取到文字（扫描版 PDF 请先 OCR）');
    return addCustom({
      name: file.name,
      type: file.name.split('.').pop().toLowerCase(),
      size: file.size,
      text,
      chars: text.length,
    });
  }

  async function extract(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const buf = await file.arrayBuffer();
    if (ext === 'txt') return new TextDecoder('utf-8').decode(buf);
    if (ext === 'docx') {
      await ensureScript('vendor/mammoth.browser.min.js', () => !!window.mammoth);
      const { value } = await window.mammoth.extractRawText({ arrayBuffer: buf });
      return value;
    }
    if (ext === 'pdf') {
      const pdfjs = await import('../vendor/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        pages.push(c.items.map(x => x.str).join(' '));
      }
      return pages.join('\n\n');
    }
    throw new Error('不支持的格式（仅 .docx/.pdf/.txt）');
  }

  function ensureScript(src, ready) {
    return new Promise((res, rej) => {
      if (ready()) return res();
      const el = document.createElement('script');
      el.src = src;
      el.onload = res;
      el.onerror = () => rej(new Error('解析库加载失败（离线状态？首次使用需联网）'));
      document.head.appendChild(el);
    });
  }

  function renderList() {
    const list = view.querySelector('#custom-list');
    const mats = getState().customs;
    if (!mats.length) { list.innerHTML = '<p class="muted">还没有导入材料。</p>'; return; }
    list.innerHTML = mats.map(m => `
      <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</div>
          <div class="muted">${m.chars} 字 · ${new Date(m.importedAt).toLocaleString('zh-CN')}</div>
        </div>
        <button class="btn sm ghost" data-open="${m.id}">阅读</button>
        <button class="btn sm" data-del="${m.id}">删除</button>
      </div>`).join('');
    list.querySelectorAll('[data-open]').forEach(b =>
      b.addEventListener('click', () => openReader(b.dataset.open)));
    list.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => {
        if (confirm('确认删除这份材料？')) { removeCustom(b.dataset.del); renderList(); toast('已删除'); }
      }));
  }

  function openReader(id) {
    const m = getState().customs.find(x => x.id === id);
    if (!m) return;
    const r = view.querySelector('#reader');
    r.innerHTML = `
      <div class="card">
        <h3>${m.name}</h3>
        <div class="btn-row" style="margin-bottom:10px">
          <button class="btn sm teal" id="r-play">🔊 全文朗读</button>
          <button class="btn sm ghost" id="r-stop">停止</button>
        </div>
        <div id="r-text" style="font-size:14.5px;line-height:1.9;white-space:pre-wrap;max-height:60vh;overflow-y:auto"></div>
      </div>`;
    r.querySelector('#r-text').textContent = m.text.slice(0, 20000) +
      (m.text.length > 20000 ? '\n\n…（原型仅展示前 2 万字，完整内容已保存）' : '');
    r.querySelector('#r-play').addEventListener('click', () => tts.speak(m.text.slice(0, 6000)));
    r.querySelector('#r-stop').addEventListener('click', () => tts.stop());
  }

  renderList();
  return () => tts.stop();
}
