// 登录/注册页：邮箱+密码，登录后自动从本地→云端合并迁移
import * as supabase from '../supabase.js';
import { syncFromCloud, getCurrentUser } from '../store.js';
import { getConfig, setConfig } from '../supabase.js';

export async function render({ view, go, toast }) {
  document.getElementById('page-title').textContent = '账号';
  const cfg = getConfig();

  // 无配置：先让用户填 Supabase URL + anon key
  if (!cfg) {
    view.innerHTML = `
      <div class="scroll">
        <div class="card">
          <h3>绑定 Supabase</h3>
          <p class="muted" style="line-height:1.8">首次使用需填入你创建的 Supabase Project 信息。仅填一次，会保存在本机浏览器。若运营者更新配置，可在这里改。</p>
          <label class="fld">Project URL
            <input type="text" id="sb-url" placeholder="https://xxxxx.supabase.co">
          </label>
          <label class="fld">anon public key
            <input type="text" id="sb-key" placeholder="eyJhbGciOi...">
          </label>
          <button class="btn" id="save-cfg" style="width:100%;padding:13px">保存配置</button>
        </div>
      </div>`;
    view.querySelector('#save-cfg').addEventListener('click', async () => {
      const url = view.querySelector('#sb-url').value.trim();
      const key = view.querySelector('#sb-key').value.trim();
      if (!url || !key) return toast('URL 和 key 都必填');
      try {
        await setConfig(url, key);
        toast('配置已保存 ✓');
        render({ view, go, toast });
      } catch (err) { toast(err.message, 4000); }
    });
    return;
  }

  // 已配置但未登录
  const user = getCurrentUser();
  if (user) {
    view.innerHTML = `
      <div class="scroll">
        <div class="card" style="text-align:center">
          <div style="font-size:42px">👤</div>
          <div style="font-size:15px;margin-top:6px;color:var(--ink-2)">${user.email}</div>
          <p class="muted" style="margin-top:10px">已登录，数据自动同步到云端</p>
          <button class="btn" id="go-home" style="width:100%;padding:13px;margin-top:14px">返回首页</button>
          <button class="btn ghost" id="sign-out" style="width:100%;padding:10px;margin-top:8px">退出登录</button>
        </div>
      </div>`;
    view.querySelector('#go-home').addEventListener('click', () => go('#/home'));
    view.querySelector('#sign-out').addEventListener('click', async () => {
      try {
        await supabase.signOut();
        toast('已退出');
        go('#/home');
      } catch (err) { toast(err.message, 4000); }
    });
    return;
  }

  // 未登录：显示登录/注册表单
  view.innerHTML = `
    <div class="scroll">
      <div class="card">
        <h3 id="form-title">登录</h3>
        <label class="fld">邮箱
          <input type="email" id="email" placeholder="you@example.com" autocomplete="email">
        </label>
        <label class="fld">密码
          <input type="password" id="password" placeholder="至少 6 位" autocomplete="current-password">
        </label>
        <button class="btn" id="submit" style="width:100%;padding:13px">登录</button>
        <p class="muted" style="margin-top:14px;text-align:center">
          <span id="toggle-mode">第一次来？<a href="#" id="toggle-link">注册</a></span>
        </p>
      </div>
      <div class="card">
        <p class="muted" style="line-height:1.8;margin:0">
          账号数据存储在你自己的 Supabase 中（邮箱注册的 Project）。<br>
          登录后浏览器本地的进度、单词卡、草稿会自动合并到云端，不丢数据，可跨设备同步。<br>
          忘记密码？到 Supabase 控制台 Auth → Users 重置。
        </p>
      </div>
    </div>`;

  let mode = 'signin';
  const titleEl = view.querySelector('#form-title');
  const submitBtn = view.querySelector('#submit');
  const toggleEl = view.querySelector('#toggle-mode');

  function updateMode() {
    if (mode === 'signup') {
      titleEl.textContent = '注册新账号';
      submitBtn.textContent = '注册';
      toggleEl.innerHTML = '已有账号？<a href="#" id="toggle-link">登录</a>';
    } else {
      titleEl.textContent = '登录';
      submitBtn.textContent = '登录';
      toggleEl.innerHTML = '第一次来？<a href="#" id="toggle-link">注册</a>';
    }
  }

  // 事件委托：toggleEl 内的 a 链接点击都触发模式切换
  toggleEl.addEventListener('click', e => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      mode = mode === 'signin' ? 'signup' : 'signin';
      updateMode();
    }
  });

  submitBtn.addEventListener('click', async () => {
    const email = view.querySelector('#email').value.trim();
    const password = view.querySelector('#password').value;
    if (!email || !password) return toast('请填写邮箱和密码');
    if (password.length < 6) return toast('密码至少 6 位');

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'signup' ? '注册中…' : '登录中…';
    try {
      if (mode === 'signup') {
        const data = await supabase.signUp(email, password);
        // 若 Supabase 要求邮箱确认
        if (!data.session && data.user && !data.user.email_confirmed_at) {
          toast('注册成功！请到邮箱点击确认链接后返回登录', 5000);
          submitBtn.disabled = false;
          submitBtn.textContent = '注册';
          return;
        }
      } else {
        await supabase.signIn(email, password);
      }
      // 登录成功，触发云端合并
      submitBtn.textContent = '同步数据中…';
      let summary = null;
      try { summary = await syncFromCloud(); }
      catch (err) { toast('云端同步失败：' + err.message, 5000); }
      const msg = summary
        ? `同步完成：单词 ${summary.before.vocab}→${summary.after.vocab}，草稿 ${summary.before.drafts}→${summary.after.drafts}`
        : '已登录';
      toast(msg, 4000);
      go('#/home');
    } catch (err) {
      toast(err.message, 4000);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signup' ? '注册' : '登录';
    }
  });
}
