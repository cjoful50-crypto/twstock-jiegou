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
const PAGES = [['/', '首頁', 'home'], ['/watch', '選股與庫存', 'watch'], ['/sectors', '產業分類', 'sectors'], ['/intraday', '盤中強勢股', 'intraday'], ['/picks', '盤後名單', 'picks'], ['/guide', '使用說明', 'guide']];
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

/* 大盤狀態列：各頁上方共用。放 <div data-mbar></div>；data-mbar="live" 時盤中以即時指數更新 */
let mktP = null;
const getMarket = () => mktP || (mktP = fetch('/data/market.json').then(r => r.ok ? r.json() : null).catch(() => null));
const fix2 = x => x == null ? '—' : (+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function marketBar(box, live) {
  const m = await getMarket(); if (!m) { box.remove(); return; }
  let lq = null, open = false;
  const draw = () => {
    const px = lq ? lq.price : m.taiex, prev = lq ? lq.prev : m.taiex - m.chg, chg = px - prev, pct = prev ? chg / prev * 100 : 0, below = px < m.ma60;
    const was = box.querySelector('details'); if (was) open = was.open;
    const ins = m.inst, insTxt = ins ? `合計 <b class="num ${cls(ins.all)}">${sg(ins.all, 1)}</b> 億（外資 ${sg(ins.f, 1)}、投信 ${sg(ins.t, 1)}、自營商 ${sg(ins.d, 1)}）` : '—';
    box.innerHTML = `<details class="mbar${below ? ' weak' : ''}"${open ? ' open' : ''}><summary>
      <span class="mb-main"><span class="mb-lab">加權指數</span><b class="num">${fix2(px)}</b><span class="num ${cls(chg)}">${sg(chg)}（${sg(pct)}%）</span>${lq ? `<span class="small muted">${lq.open ? '盤中 ' + esc((lq.time || '').slice(0, 5)) : '今日收盤'}</span>` : ''}</span>
      <span class="mb-st"><span class="mb-tag">${below ? '季線之下' : '季線之上'}</span><span class="small num">支撐 ${m.sup != null ? fi(m.sup) : '—'}｜壓力 ${m.res != null ? fi(m.res) : '—'}</span><span class="more">明細</span></span></summary>
      <div class="mb-detail">
        <div><span>月線</span><b class="num">${fi(m.ma20)}</b></div>
        <div><span>季線</span><b class="num">${fi(m.ma60)}</b><small>收盤距季線 ${sg(m.dist60, 1)}%</small></div>
        <div><span>上漲／下跌家數</span><b class="num"><span class="up">${fi(m.up)}</span>／<span class="down">${fi(m.down)}</span></b><small>上市股票</small></div>
        <div><span>成交金額</span><b class="num">${m.amount != null ? fi(m.amount) + ' 億' : '—'}</b><small>上市</small></div>
        <div class="wide"><span>三大法人買賣超</span><b>${insTxt}</b></div>
      </div>
      <p class="mb-note">${below ? '大盤位於季線之下時，盤後名單的歷史表現明顯較差，請審慎參考並控制部位。' : '大盤位於季線之上。盤後名單的回測期間多數處於此狀態。'}明細為 ${esc(m.date.replace(/-/g, '/'))} 收盤資料；支撐壓力依加權指數日 K 計算，計算方式與個股相同。</p></details>`;
  };
  draw();
  if (live) { const tick = async () => { try { const r = await fetch('/api/quote?codes=TAIEX'); const j = await r.json(); const q = (j.quotes || []).find(x => x.code === 'TAIEX' && x.price);
      if (q && q.date > m.date) { lq = q; lq.open = !!(j.session && j.session.open); draw(); if (lq.open) setTimeout(tick, 60000); } } catch (e) {} }; tick(); }
}
document.querySelectorAll('[data-mbar]').forEach(el => marketBar(el, el.dataset.mbar === 'live'));

/* 籌碼動向摘要：千張大戶（集保，每週）＋外資、投信（每日）＋融資（個股頁才有）。只描述事實，不做多空判斷 */
const chipStreak = v => { let n = 0; const g = Math.sign(v.at(-1) || 0); if (!g) return 0; for (let k = v.length - 1; k >= 0 && Math.sign(v[k] || 0) === g; k--) n++; return n * g; };
function chipParts(o) {
  const p = [], it = (txt, v) => p.push(`<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${txt}</span>`);
  if (o.td) { const [, c1, c4, st] = o.td, c = c4 != null ? c4 : c1;
    if (Math.abs(st || 0) >= 2) it(`千張大戶連 ${Math.abs(st)} 週${st > 0 ? '增加' : '減少'}`, st);
    else if (c != null && Math.abs(c) >= 0.3) it(`千張大戶${c4 != null ? '近 4 週' : '近 1 週'}${c > 0 ? '增加' : '減少'} ${Math.abs(c).toFixed(2)} 百分點`, c); }
  const inst = (lab, s, v5) => { if (Math.abs(s) >= 2) it(`${lab}連 ${Math.abs(s)} 日${s > 0 ? '買超' : '賣超'}`, s); else if (v5) it(`${lab}近 5 日${v5 > 0 ? '買超' : '賣超'} ${fi(Math.abs(v5))} 張`, v5); };
  if (o.f != null) inst('外資', o.f, o.f5);
  if (o.t != null && (Math.abs(o.t) >= 2 || Math.abs(o.t5 || 0) >= 100)) inst('投信', o.t, o.t5);
  if (o.m != null && Math.abs(o.m) >= 3) it(`融資 5 日${o.m > 0 ? '增加' : '減少'} ${Math.abs(o.m).toFixed(1)}%`, -o.m); // 融資增加通常代表散戶加碼，以綠色表示
  return p;
}
