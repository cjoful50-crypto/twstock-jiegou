/* 會員登入與雲端同步（Supabase + Google 登入）
   設定好 SB_URL 與 SB_KEY 後才會出現「登入」按鈕；沒設定時網站照常運作，資料只存在這台裝置。
   SB_KEY 是 Supabase 的公開金鑰（anon / publishable key），本來就會出現在網頁裡，不是密碼。
   資料表 user_data 開啟了 Row Level Security，每個人只能讀寫自己的那一列。 */
const SB_URL = '';
const SB_KEY = '';

const Sync = (() => {
  let sb = null, user = null, timer = null, busy = false;
  const ready = () => !!(SB_URL && SB_KEY);
  const meta = () => Store.read('jiegou-meta', {});
  const setMeta = patch => Store.write('jiegou-meta', Object.assign(meta(), patch));
  const local = () => ({ watch: Watch.get(), holdings: Holdings.get() });

  function loadLib() {
    if (window.supabase) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'; s.onload = ok; s.onerror = () => fail(new Error('登入元件載入失敗')); document.head.appendChild(s); });
  }
  // 合併：以代號為準，兩邊都有時取較新的一筆；選股清單保留兩邊所有股票
  function merge(a, b) {
    const w = new Map(); [...(b.watch || []), ...(a.watch || [])].forEach(x => { if (!w.has(x.code)) w.set(x.code, x); });
    const h = new Map(); [...(a.holdings || []), ...(b.holdings || [])].forEach(x => { const y = h.get(x.code); if (!y || (x.t || '') > (y.t || '')) h.set(x.code, x); });
    return { watch: [...w.values()], holdings: [...h.values()] };
  }
  function applyLocal(d, at) {
    Store.write('jiegou-watch', d.watch || []); Store.write('jiegou-hold', d.holdings || []);
    setMeta({ updatedAt: at, syncedAt: at, uid: user.id });
    document.dispatchEvent(new CustomEvent('jiegou-data'));
  }
  async function push() {
    if (!user) return; const at = meta().updatedAt || new Date().toISOString();
    const { error } = await sb.from('user_data').upsert({ user_id: user.id, ...local(), updated_at: at });
    if (error) throw error; setMeta({ syncedAt: at, uid: user.id }); paint('已同步');
  }
  async function pull() {
    if (!user || busy) return; busy = true;
    try {
      const { data, error } = await sb.from('user_data').select('watch,holdings,updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      const m = meta();
      if (!data) { await push(); }
      else if (m.uid !== user.id) { const at = new Date().toISOString(); applyLocal(merge(local(), data), at); await push(); } // 這台裝置第一次登入此帳號：合併
      else if ((m.updatedAt || '') > (data.updated_at || '') ) await push();           // 本機較新
      else if ((data.updated_at || '') > (m.syncedAt || '')) { applyLocal(data, data.updated_at); paint('已同步'); } // 雲端較新
      else paint('已同步');
    } catch (e) { paint('同步失敗'); console.warn(e); } finally { busy = false; }
  }
  function schedule() { if (!user) return; paint('同步中…'); clearTimeout(timer); timer = setTimeout(() => push().catch(e => { paint('同步失敗'); console.warn(e); }), 800); }

  function paint(state) {
    const box = document.getElementById('acct'); if (!box || !ready()) return;
    if (!user) { box.innerHTML = `<button class="btn ghost acct-btn" type="button" id="loginBtn">登入</button>`; document.getElementById('loginBtn').onclick = login; return; }
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || '會員';
    box.innerHTML = `<details class="acct-menu"><summary title="${esc(user.email || '')}">${esc(name.slice(0, 1))}</summary><div class="acct-pop"><b>${esc(name)}</b><span class="small muted">${esc(user.email || '')}</span><span class="small muted" id="syncState">${esc(state || '')}</span><button class="btn ghost" type="button" id="logoutBtn">登出</button></div></details>`;
    document.getElementById('logoutBtn').onclick = logout;
  }
  async function login() { await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); }
  async function logout() { await sb.auth.signOut(); user = null; paint(); }

  async function init() {
    if (!ready()) return;
    try { await loadLib(); } catch (e) { return; }
    sb = window.supabase.createClient(SB_URL, SB_KEY);
    const { data } = await sb.auth.getSession(); user = data.session ? data.session.user : null; paint(user ? '同步中…' : ''); if (user) document.dispatchEvent(new CustomEvent('jiegou-data'));
    if (user) pull();
    sb.auth.onAuthStateChange((ev, session) => { const u = session ? session.user : null; if ((u && u.id) !== (user && user.id)) { user = u; paint(user ? '同步中…' : ''); document.dispatchEvent(new CustomEvent('jiegou-data')); if (user) pull(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  }
  return { init, schedule, ready, get user() { return user; } };
})();
window.Sync = Sync;
Sync.init();
