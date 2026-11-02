/* 會員登入與雲端同步：帳號＋密碼，資料存在網站的私人儲存空間（/api/member）
   沒有登入時資料只存在這台裝置；登入後，同一個帳號在不同裝置看到相同的選股與庫存。 */
const Sync = (() => {
  let enabled = false, user = null, timer = null, busy = false;
  const tok = () => Store.read('jiegou-token', null);
  const meta = () => Store.read('jiegou-meta', {});
  const setMeta = patch => Store.write('jiegou-meta', Object.assign(meta(), patch));
  const local = () => ({ watch: Watch.get(), holdings: Holdings.get() });
  const api = async (method, bodyObj) => {
    const r = await fetch('/api/member', { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok() ? { Authorization: 'Bearer ' + tok() } : {}), body: bodyObj ? JSON.stringify(bodyObj) : undefined });
    const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
    if (r.status === 401 && method !== 'POST') { signOut(); }
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j;
  };
  // 合併：選股保留兩邊所有股票；庫存以代號為準，兩邊都有時取較新的一筆
  function merge(a, b) {
    const w = new Map(); [...(b.watch || []), ...(a.watch || [])].forEach(x => { if (!w.has(x.code)) w.set(x.code, x); });
    const h = new Map(); [...(a.holdings || []), ...(b.holdings || [])].forEach(x => { const y = h.get(x.code); if (!y || (x.t || '') > (y.t || '')) h.set(x.code, x); });
    return { watch: [...w.values()], holdings: [...h.values()] };
  }
  const changed = () => document.dispatchEvent(new CustomEvent('jiegou-data'));
  function applyLocal(d, at) { Store.write('jiegou-watch', d.watch || []); Store.write('jiegou-hold', d.holdings || []); setMeta({ updatedAt: at, syncedAt: at, uid: user }); changed(); }
  async function push() {
    if (!user) return; const at = meta().updatedAt || new Date().toISOString();
    await api('PUT', Object.assign(local(), { updated_at: at })); setMeta({ syncedAt: at, uid: user }); paint('已同步');
  }
  async function pull() {
    if (!user || busy) return; busy = true;
    try {
      const { data } = await api('GET'); const m = meta();
      if (!data) await push();
      else if (m.uid !== user) { const at = new Date().toISOString(); applyLocal(merge(local(), data), at); await push(); } // 這台裝置第一次登入此帳號：合併
      else if ((m.updatedAt || '') > (data.updated_at || '')) await push();                                         // 本機較新
      else if ((data.updated_at || '') > (m.syncedAt || '')) { applyLocal(data, data.updated_at); paint('已同步'); } // 雲端較新
      else paint('已同步');
    } catch (e) { paint(user ? '同步失敗：' + e.message : ''); } finally { busy = false; }
  }
  function schedule() { if (!user) return; paint('同步中…'); clearTimeout(timer); timer = setTimeout(() => push().catch(e => paint('同步失敗：' + e.message)), 800); }
  function signOut() { Store.write('jiegou-token', null); Store.write('jiegou-user', null); user = null; paint(); changed(); }

  function paint(state) {
    const box = document.getElementById('acct'); if (!box || !enabled) return;
    if (!user) { box.innerHTML = `<button class="btn ghost acct-btn" type="button" id="loginBtn">登入</button>`; document.getElementById('loginBtn').onclick = () => openForm('login'); return; }
    const st = document.getElementById('syncState'); if (st && document.querySelector('.acct-menu[open]')) { st.textContent = state || ''; return; }
    box.innerHTML = `<details class="acct-menu"><summary title="${esc(user)}">${esc(user.slice(0, 1).toUpperCase())}</summary><div class="acct-pop"><b>${esc(user)}</b><span class="small muted" id="syncState">${esc(state || '')}</span><span class="small muted">選股與庫存會在登入的裝置間同步。</span><button class="btn ghost" type="button" id="logoutBtn">登出</button></div></details>`;
    document.getElementById('logoutBtn').onclick = signOut;
  }
  function openForm(mode) {
    let ov = document.getElementById('acctOverlay'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'acctOverlay'; ov.className = 'acct-overlay';
    const reg = mode === 'register';
    ov.innerHTML = `<form class="acct-card card" autocomplete="on"><h2>${reg ? '註冊會員' : '會員登入'}</h2>
      <p class="small muted" style="margin:0">登入後，「選股與庫存」會在手機、電腦等不同裝置同步。</p>
      <label><span>帳號</span><input name="username" autocomplete="username" required minlength="3" maxlength="24" placeholder="英文字母或數字，3～24 個字"></label>
      <label><span>密碼</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6" placeholder="至少 6 個字元"></label>
      ${reg ? '<label><span>再輸入一次密碼</span><input name="password2" type="password" autocomplete="new-password" required minlength="6"></label><p class="small" style="margin:0;color:var(--warn)">本站沒有寄信功能，忘記密碼無法找回，請記好帳號密碼。</p>' : ''}
      <p class="small err" id="acctMsg" hidden></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">${reg ? '註冊並登入' : '登入'}</button><button class="btn ghost" type="button" id="acctClose">取消</button></div>
      <p class="small muted" style="margin:0">${reg ? '已經有帳號？' : '還沒有帳號？'}<button class="linkbtn" type="button" id="acctSwitch">${reg ? '登入' : '免費註冊'}</button></p></form>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), msg = ov.querySelector('#acctMsg');
    ov.querySelector('#acctClose').onclick = () => ov.remove(); ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('#acctSwitch').onclick = () => openForm(reg ? 'login' : 'register');
    f.username.focus();
    f.onsubmit = async e => { e.preventDefault(); msg.hidden = true;
      if (reg && f.password.value !== f.password2.value) { msg.textContent = '兩次輸入的密碼不同。'; msg.hidden = false; return; }
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try { const j = await api('POST', { action: reg ? 'register' : 'login', user: f.username.value.trim(), pass: f.password.value });
        Store.write('jiegou-token', j.token); Store.write('jiegou-user', j.user); user = j.user; ov.remove(); paint('同步中…'); changed(); pull();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; } finally { btn.disabled = false; } };
  }

  async function init() {
    try { const r = await fetch('/api/member?status=1'); const j = await r.json(); enabled = !!j.enabled; } catch (e) { enabled = false; }
    if (!enabled) return;
    user = tok() ? Store.read('jiegou-user', null) : null; paint(user ? '同步中…' : '');
    if (user) { changed(); pull(); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  }
  return { init, schedule, ready: () => enabled, get user() { return user; } };
})();
window.Sync = Sync;
Sync.init();
