/* 共用：格式化、最近查詢、搜尋自動完成 */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fx = (x, d = 2) => x == null || isNaN(x) ? '—' : (+x).toFixed(d);
const fi = x => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const sg = (x, d = 2) => x == null ? '—' : (x > 0 ? '+' : '') + (+x).toFixed(d);
const sgi = x => x == null ? '—' : (x > 0 ? '+' : '') + fi(x);
const cls = x => x > 0 ? 'up' : x < 0 ? 'down' : '';
const pxd = p => p == null ? '—' : (+p).toFixed(2);
const trendCls = t => ({ 強勢: 'bull', 觀察: 'flat', 偏弱: 'bear', 風險: 'risk', 偏空: 'bear', 過熱: 'bear', 整理: 'flat', 偏多: 'bull', 多頭: 'bull' }[t]);
const legacyCls = t => ({ 偏空: 'bear', 中性: 'flat', 偏多: 'bull' }[t]);
const scoreColor = s => s == null ? 'var(--faint)' : s >= 60 ? 'var(--accent)' : s >= 40 ? 'var(--muted)' : 'var(--warn)';
const goTo = code => { location.href = '/analysis/' + encodeURIComponent(code); };

const Recent = {
  get() { try { return JSON.parse(localStorage.getItem('jiegou-recent') || '[]') || []; } catch (e) { return []; } },
  add(code, name) { const r = [{ code, name }, ...this.get().filter(x => x.code !== code)].slice(0, 8); try { localStorage.setItem('jiegou-recent', JSON.stringify(r)); } catch (e) {} }
};

let STOCKS = null, SECTORS = [], stocksP = null;
function loadStocks() {
  if (!stocksP) stocksP = fetch('/api/list').then(r => r.json()).then(j => { if (Array.isArray(j)) STOCKS = j; else if (j && Array.isArray(j.stocks)) { STOCKS = j.stocks; SECTORS = j.sectors || []; window.LIST_DATE = j.date || null; } return STOCKS; }).catch(() => null);
  return stocksP;
}
/* 產業小標籤：先放空的 <span data-sec="代號">，股票清單載入後自動補上產業名稱 */
const secTag = code => `<span class="stag" data-sec="${esc(code)}"></span>`;
let SEC_OF = null;
function fillSec(root = document) {
  if (!STOCKS) return;
  if (!SEC_OF) { const nm = new Map(SECTORS.map(s => [s.id, s.name])); SEC_OF = new Map(STOCKS.map(x => [x[0], (nm.get(x[3]) || '').replace(/業$/, '')])); }
  root.querySelectorAll('.stag[data-sec]:empty').forEach(el => { const t = SEC_OF.get(el.dataset.sec); if (t) el.textContent = t; else el.remove(); });
}
loadStocks().then(() => { fillSec(); new MutationObserver(() => fillSec()).observe(document.body, { childList: true, subtree: true }); });
function findStocks(q, n = 8) {
  q = q.trim().toUpperCase(); if (!q || !STOCKS) return [];
  const a = [], b = [], c = [];
  for (const s of STOCKS) {
    const name = s[1].toUpperCase();
    if (s[0] === q || name === q) a.push(s); else if (s[0].startsWith(q) || name.startsWith(q)) b.push(s); else if (name.includes(q)) c.push(s);
  }
  return [...a, ...b, ...c].slice(0, n);
}
/* 綁定搜尋框：輸入代號或名稱，下拉選單選擇；Enter 直接跳第一個符合的 */
function attachSearch(form, input, list) {
  let items = [], active = -1;
  const close = () => { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const draw = () => {
    // 還沒輸入時先列出最近查詢與我的選股，點一下就能進去
    if (!input.value.trim()) { const seen = new Set(), mk = (x, t) => seen.has(x.code) ? null : (seen.add(x.code), [x.code, x.name || '', t]);
      const w = (() => { try { return JSON.parse(localStorage.getItem('jiegou-watch') || '[]') || []; } catch (e) { return []; } })();
      items = [...Recent.get().slice(0, 5).map(x => mk(x, '最近查詢')), ...w.slice(0, 5).map(x => mk(x, '我的選股'))].filter(Boolean).slice(0, 8); }
    else items = findStocks(input.value);
    if (!items.length) { close(); return; }
    list.innerHTML = items.map((s, i) => `<li role="option" id="opt${i}" aria-selected="${i === active}" data-code="${esc(s[0])}"><span class="num">${esc(s[0])}</span><b>${esc(s[1])}</b><small>${s[2]}</small></li>`).join('');
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    list.querySelectorAll('li').forEach(li => li.onmousedown = e => { e.preventDefault(); goTo(li.dataset.code); });
  };
  input.addEventListener('focus', () => { loadStocks().then(draw); });
  input.addEventListener('input', () => { active = -1; if (STOCKS) draw(); else loadStocks().then(draw); });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = input.value.trim(); if (!v) { input.focus(); return; }
    if (active >= 0 && items[active]) { goTo(items[active][0]); return; }
    if (/^[0-9A-Z]{4,6}$/i.test(v)) { goTo(v.toUpperCase()); return; }
    await loadStocks();
    const hit = findStocks(v, 1)[0];
    if (hit) goTo(hit[0]);
    else { const m = form.parentElement.querySelector('.search-msg'); if (m) { m.hidden = false; m.textContent = `找不到「${v}」，請輸入股票代號或完整名稱。`; } }
  });
}

/* 個人資料（我的選股、庫存）：先存在這台裝置；登入後同步到雲端，不同裝置看到相同內容 */
const Store = {
  read(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  touch() { const m = this.read('jiegou-meta', {}); m.updatedAt = new Date().toISOString(); this.write('jiegou-meta', m); if (window.Sync) Sync.schedule(); }
};
const Watch = {
  get() { return Store.read('jiegou-watch', []) || []; },
  save(list, quiet) { Store.write('jiegou-watch', list); if (!quiet) Store.touch(); },
  has(code) { return this.get().some(x => x.code === code); },
  toggle(code, name) {
    const list = this.get();
    if (list.some(x => x.code === code)) { this.save(list.filter(x => x.code !== code)); return false; }
    list.unshift({ code, name, added: new Date().toISOString().slice(0, 10) }); this.save(list); return true;
  },
  // 更新強度分數等快取資料，不算使用者修改
  update(code, patch) { const list = this.get(); const x = list.find(y => y.code === code); if (x) { Object.assign(x, patch); this.save(list, true); } }
};
/* 庫存：股數（股）與平均成本（元／股） */
const Holdings = {
  get() { return Store.read('jiegou-hold', []) || []; },
  save(list) { Store.write('jiegou-hold', list); Store.touch(); },
  find(code) { return this.get().find(x => x.code === code) || null; },
  set(code, name, shares, avg) {
    const list = this.get().filter(x => x.code !== code);
    list.unshift({ code, name, shares: Math.round(shares), avg: +avg, t: new Date().toISOString() }); this.save(list);
  },
  remove(code) { this.save(this.get().filter(x => x.code !== code)); }
};
function starBtn(code, name) {
  const on = Watch.has(code);
  return `<button class="star" type="button" data-star="${esc(code)}" data-name="${esc(name || '')}" aria-pressed="${on}" aria-label="${on ? '移出我的選股' : '加入我的選股'}" title="${on ? '移出我的選股' : '加入我的選股'}">${on ? '★' : '☆'}</button>`;
}
function bindStars(root, after) {
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = e => {
    e.stopPropagation(); e.preventDefault();
    const on = Watch.toggle(b.dataset.star, b.dataset.name);
    b.setAttribute('aria-pressed', on); b.textContent = on ? '★' : '☆'; b.title = b.ariaLabel = on ? '移出我的選股' : '加入我的選股';
    if (after) after();
  });
}

/* 共用導覽列：每一頁開頭放 <header class="nav" id="nav" data-page="..."></header> */
const PAGES = [['/', '首頁', 'home'], ['/watch', '選股與庫存', 'watch'], ['/sectors', '產業分類', 'sectors'], ['/intraday', '盤中強勢股', 'intraday'], ['/picks', '盤後名單', 'picks'], ['/scorecard', '名單成績單', 'scorecard'], ['/guide', '使用說明', 'guide']];
(function renderNav() {
  const nav = document.getElementById('nav'); if (!nav) return;
  const page = nav.dataset.page, withSearch = page !== 'home';
  nav.innerHTML = `<div class="nav-in">
    <div class="brand"><a href="/">盤後結構室</a></div>
    ${withSearch ? `<div class="search-wrap"><form class="search" id="navSearch" role="search" autocomplete="off"><input id="navQ" inputmode="search" placeholder="代號或名稱" aria-label="搜尋股票" role="combobox" aria-controls="navSuggest" aria-expanded="false" aria-autocomplete="list"><button class="btn" type="submit">查詢</button></form><ul class="suggest" id="navSuggest" role="listbox" hidden></ul><p class="search-msg" hidden></p></div>` : ''}
    <nav class="nav-links" aria-label="主要頁面">${PAGES.map(([href, label, key]) => `<a href="${href}"${key === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="acct" id="acct"></div>
  </div>`;
  if (withSearch) attachSearch(document.getElementById('navSearch'), document.getElementById('navQ'), document.getElementById('navSuggest'));
})();
