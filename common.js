/* 共用：格式化、最近查詢、搜尋自動完成 */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fx = (x, d = 2) => x == null || isNaN(x) ? '—' : (+x).toFixed(d);
const fi = x => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const sg = (x, d = 2) => x == null ? '—' : (x > 0 ? '+' : '') + (+x).toFixed(d);
const sgi = x => x == null ? '—' : (x > 0 ? '+' : '') + fi(x);
const cls = x => x > 0 ? 'up' : x < 0 ? 'down' : '';
const pxd = p => p == null ? '—' : (+p).toFixed(2);
const trendCls = t => ({ 風險: 'risk', 偏空: 'bear', 整理: 'flat', 偏多: 'bull', 多頭: 'bull' }[t]);
const legacyCls = t => ({ 偏空: 'bear', 中性: 'flat', 偏多: 'bull' }[t]);
const scoreColor = s => s == null ? 'var(--faint)' : s >= 60 ? 'var(--down)' : s >= 40 ? 'var(--warn)' : 'var(--up)';
const goTo = code => { location.href = '/analysis/' + encodeURIComponent(code); };

const Recent = {
  get() { try { return JSON.parse(localStorage.getItem('jiegou-recent') || '[]') || []; } catch (e) { return []; } },
  add(code, name) { const r = [{ code, name }, ...this.get().filter(x => x.code !== code)].slice(0, 8); try { localStorage.setItem('jiegou-recent', JSON.stringify(r)); } catch (e) {} }
};

let STOCKS = null, SECTORS = [], stocksP = null;
function loadStocks() {
  if (!stocksP) stocksP = fetch('/api/list').then(r => r.json()).then(j => { if (Array.isArray(j)) STOCKS = j; else if (j && Array.isArray(j.stocks)) { STOCKS = j.stocks; SECTORS = j.sectors || []; } return STOCKS; }).catch(() => null);
  return stocksP;
}
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
    items = findStocks(input.value);
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
