/* 各分頁共用：依頁面上有哪些區塊決定要載入什麼 */
// 盤後名單：優先讀每日排程存好的檔案（秒開），沒有才即時計算
let pickIndex;
async function getIndex() { if (pickIndex === undefined) pickIndex = await fetch('/data/index.json').then(r => r.ok ? r.json() : null).catch(() => null); return pickIndex; }
async function getPicks(date) {
  if (date) { const r = await fetch(`/data/daily/${date}.json`); if (r.ok) return r.json(); }
  const s = await fetch('/data/latest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (s && s.day) return s;
  const r = await fetch('/api/picks'); const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status); return j;
}
if ($('#searchForm')) attachSearch($('#searchForm'), $('#q'), $('#suggest'));
loadStocks().then(() => { if ($('#browse')) renderBrowse(); if ($('#pvSectors')) renderPvSectors(); });


(function quick() {
  if (!$('#quick')) return;
  const rec = Recent.get();
  const list = rec.length ? rec.slice(0, 6) : [{ code: '2330', name: '台積電' }, { code: '2317', name: '鴻海' }, { code: '2454', name: '聯發科' }, { code: '2303', name: '聯電' }];
  $('#quick').innerHTML = `<span class="lab">${rec.length ? '最近查詢' : '試試看'}</span>` + list.map(s => `<a class="chip" href="/analysis/${esc(s.code)}" style="text-decoration:none"><span class="num" style="color:var(--accent)">${esc(s.code)}</span> ${esc(s.name || '')}</a>`).join('');
})();

let intraTimer = null;
async function loadIntraday() {
  const box = $('#intraday'); if (!box) return;
  if (!box.innerHTML) box.innerHTML = `<h2 id="intraTitle">盤中當沖觀察</h2><div class="loading" style="margin-top:10px"><div class="dots"><span></span><span></span><span></span></div><span class="small muted">正在掃描成交值前 150 大上市股票的即時行情…</span></div>`;
  try {
    const r = await fetch('/api/intraday'); const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    const open = j.session && j.session.open;
    const state = open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((j.time || '').slice(0, 5))}・每 3 分鐘重新掃描</span>` : `<span class="live-badge"><span class="dot"></span>${j.date ? esc(j.date.replace(/-/g, '/')) + ' ' : ''}收盤後結果・下個交易日 9:00 開盤後自動更新</span>`;
    const cards = j.picks.length ? j.picks.map(x => `<button class="pick" type="button" data-code="${esc(x.code)}">
        <div class="top1"><span><span class="code num" style="color:var(--accent)">${esc(x.code)}</span> <span class="nm">${esc(x.name)}</span></span><span class="num ${cls(x.chg)}">${pxd(x.price)} ${sg(x.chg)}%</span></div>
        <div class="sigs">${x.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
        <div class="lv num"><span>成交 ${fi(x.vol)} 張</span><span>更新 ${esc((x.time || '').slice(0, 5))}</span></div></button>`).join('')
      : `<div class="empty">${open ? '目前沒有股票同時符合量能放大、振幅夠大、價格在高檔的條件，3 分鐘後會再掃一次。' : '今天收盤時沒有股票符合條件。'}</div>`;
    box.innerHTML = `<div class="section-head"><h2 id="intraTitle">盤中當沖觀察</h2>${state}</div>
      <div class="howto">
        <div><b>這是什麼</b><span>開盤時間，從交易最熱絡的 150 檔上市股票裡，找出「現在」成交量明顯放大、上下波動大、價格又在今天高點附近的股票。</span></div>
        <div><b>可以怎麼用</b><span>給有在做當沖的人當盯盤清單：點進個股看支撐和壓力，價格守在支撐上方代表還強，跌破支撐通常代表轉弱。</span></div>
        <div><b>要注意</b><span>名單每 3 分鐘變一次，強勢股也可能隨時翻黑。當沖需要開立當沖資格、風險高，這裡只是篩選結果，不是買進建議。</span></div>
      </div>
      <div class="picks-grid">${cards}</div>
      <details class="rules"><summary>盤中名單怎麼選出來的</summary><p>條件：漲幅 1.5%～9% 且未鎖漲停、今日振幅 2.5% 以上、價格位於今日高低區間 60% 以上、成交量達前一日依時間比例的 1.3 倍以上（例如 10:30 時，交易時間過了三分之一，就和前一日總量的三分之一相比）。依量能倍數、振幅、高檔位置與漲幅加權排名。開盤初期量能通常偏大，倍數會比較高。</p></details>`;
    box.querySelectorAll('.pick').forEach(b => b.onclick = () => goTo(b.dataset.code));
    clearTimeout(intraTimer); if (open) intraTimer = setTimeout(loadIntraday, 180000);
  } catch (e) {
    box.innerHTML = `<h2 id="intraTitle">盤中當沖觀察</h2><p class="err">${esc(e.message)}</p><button class="btn ghost" type="button" id="retryIntra">再試一次</button>`;
    $('#retryIntra').onclick = loadIntraday;
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#intraday')) loadIntraday(); });

async function loadPicks(date) {
  const box = $('#picks'); if (!box) return;
  box.innerHTML = `<h2 id="picksTitle">盤後篩選名單</h2><div class="loading" style="margin-top:10px"><div class="dots"><span></span><span></span><span></span></div><span class="small muted">載入名單中…</span></div>`;
  try {
    const j = await getPicks(date); const idx = await getIndex();
    const col = (title, sub, list, n) => `<div class="pcol"><h3>${title}<small>${sub}・符合 ${n} 檔</small></h3>${list.length ? list.map(x => `<button class="pick" type="button" data-code="${esc(x.code)}">
      <div class="top1"><span><span class="code num" style="color:var(--accent)">${esc(x.code)}</span> <span class="nm">${esc(x.name)}</span></span><span class="num ${cls(x.chg)}">${pxd(x.close)} ${sg(x.chg)}%</span></div>
      <div class="sigs">${x.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
      <div class="lv num"><span>漲停指數 <b style="color:${scoreColor(x.index)}">${x.index ?? '—'}</b></span><span>支撐 <b style="color:var(--sup)">${x.sup != null ? pxd(x.sup) : '—'}</b></span><span>壓力 <b style="color:var(--res)">${x.res != null ? pxd(x.res) : '—'}</b></span></div></button>`).join('') : '<div class="empty">今天沒有股票符合條件。</div>'}</div>`;
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 id="picksTitle">盤後篩選名單</h2><span class="small muted num">${idx && idx.dates.length > 1 ? `<label for="pickDate">查看日期 </label><select id="pickDate">${idx.dates.slice().reverse().map(d => `<option value="${d}"${d.replace(/-/g, '/') === j.date ? ' selected' : ''}>${d.replace(/-/g, '/')}</option>`).join('')}</select>　` : esc(j.date) + ' 收盤・'}掃描 ${j.universe} 檔上市櫃股票</span></div>
      <div class="howto">
        <div><b>這是什麼</b><span>每天收盤後，用當天的收盤資料篩出的觀察名單，適合在下一個交易日開盤前看。三欄對應不同的持有時間：當沖是當天買當天賣，短期是持有幾天到幾週，長期是持有幾個月以上。</span></div>
        <div><b>可以怎麼用</b><span>先點進個股看漲停指數、支撐和壓力。例如明天開盤後價格守住支撐、或站上壓力，代表結構延續；開低跌破支撐，就代表條件已經變了。</span></div>
        <div><b>要注意</b><span>名單只代表「今天收盤時符合條件」，不是預測明天會漲，也不是買進建議。下單前請自己判斷，並設好停損。</span></div>
      </div>
      <div class="picks-grid">${col('當沖觀察', '當天買賣', j.day, j.counts.day)}${col('短期觀察', '持有數天到數週', j.swing, j.counts.swing)}${col('長期觀察', '持有數月以上', j.long, j.counts.long)}</div>
      <details class="rules"><summary>名單怎麼選出來的</summary>
        <p>共同條件：一般上市股票（排除 ETF、權證），股價 10 元以上，近 20 日平均成交量 1,000 張以上。同一檔只會出現在一個名單。</p>
        <p><b>當沖觀察</b>：日均成交值 5 億以上、近 14 日平均振幅 3% 以上、當日量比 1.5 倍以上、漲幅 2%～9.5% 且未鎖漲停、收盤位於當日高低區間 70% 以上、站上 MA5。依量比、振幅、收盤位置與漲幅加權排名。</p>
        <p><b>短期觀察</b>：MA5 &gt; MA10 &gt; MA20 且 MA20 上彎、RSI 55～78、近 20 日漲幅 3%～30%（不追過熱）、量比 1 倍以上、三大法人近 5 日合計買超、股價距 60 日高點 8% 以內。依法人買超占日均量比例、RSI、量比與投信是否同步買超排名。</p>
        <p><b>長期觀察</b>：最新月營收年增 15% 以上、本益比 0～25 倍、殖利率 1.5% 以上、收盤站上季線且月線在季線之上。依營收成長、本益比、殖利率與法人動向排名。</p>
        <p>資料為證交所盤後公開資料。法人資料約下午 3 點後公布，盤後早些時候查看時法人條件可能用前一日資料。</p>
      </details>`;
    box.querySelectorAll('.pick').forEach(b => b.onclick = () => goTo(b.dataset.code));
    const sel = $('#pickDate'); if (sel) sel.onchange = () => loadPicks(sel.value);
    if (j.longNote) { const lc = box.querySelectorAll('.pcol')[2]; if (lc) lc.insertAdjacentHTML('beforeend', `<p class="note">${esc(j.longNote)}</p>`); }
  } catch (e) {
    box.innerHTML = `<h2 id="picksTitle">盤後篩選名單</h2><p class="err">${esc(e.message)}</p><button class="btn ghost" type="button" id="retryPicks">再試一次</button>`;
    $('#retryPicks').onclick = loadPicks;
  }
}

loadIntraday();
loadPicks();

/* 我的選股 */
let watchTimer = null;
async function renderWatch() {
  const box = $('#watch'); if (!box) return; const list = Watch.get();
  const head = `<div class="section-head"><h2 id="watchTitle">我的選股</h2><span class="small muted" id="watchState"></span></div>`;
  if (!list.length) {
    box.innerHTML = head + `<p class="small muted" style="margin:6px 0 0">還沒有加入任何股票。在個股頁按「☆ 加入我的選股」，或到<a href="/sectors">產業分類</a>點 ☆，就會出現在這裡。清單存在這台裝置的瀏覽器裡。</p>`;
    return;
  }
  const rowsHtml = (q = {}) => list.map(w => { const x = q[w.code] || {}; const chg = x.price && x.prev ? (x.price / x.prev - 1) * 100 : null;
    return `<tr data-code="${esc(w.code)}"><td class="nm"><a href="/analysis/${esc(w.code)}"><span class="num">${esc(w.code)}</span>${esc(w.name || x.name || '')}</a></td>
      <td class="num">${x.price ? pxd(x.price) : '—'}</td><td class="num ${cls(chg)}">${chg == null ? '—' : sg(chg) + '%'}</td><td class="num">${x.vol != null ? fi(x.vol) : '—'}</td>
      <td class="num" style="color:${scoreColor(w.index)}">${w.index ?? '—'}${w.trend ? `<span class="small muted">・${esc(w.trend)}</span>` : ''}</td><td>${starBtn(w.code, w.name)}</td></tr>`; }).join('');
  const table = q => `<div class="scroll"><table class="stock-table"><thead><tr><th>股票</th><th>價格</th><th>漲跌</th><th>成交量（張）</th><th>漲停指數</th><th></th></tr></thead><tbody>${rowsHtml(q)}</tbody></table></div>
    <p class="note" style="margin:6px 0 0">漲停指數是你上次打開該檔個股頁時算出的分數；點進去會用最新資料重算。清單存在這台裝置的瀏覽器裡，換手機或電腦不會同步。</p>`;
  box.innerHTML = head + table();
  const bind = () => { bindStars(box, renderWatch); box.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a,button')) goTo(tr.dataset.code); }); };
  bind();
  try {
    const codes = list.map(w => w.code), q = {}; let sess = null;
    for (let i = 0; i < codes.length; i += 20) { const r = await fetch('/api/quote?codes=' + codes.slice(i, i + 20).join(',')); const j = await r.json(); sess = j.session; (j.quotes || []).forEach(x => { if (x.price) q[x.code] = x; }); }
    box.innerHTML = head + table(q); bind();
    const any = Object.values(q)[0];
    $('#watchState').innerHTML = sess && sess.open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((any && any.time || '').slice(0, 5))}・每 30 秒更新</span>` : `<span class="live-badge"><span class="dot"></span>${any && any.date ? esc(any.date.replace(/-/g, '/')) + ' ' : ''}收盤價</span>`;
    clearTimeout(watchTimer); if (sess && sess.open) watchTimer = setTimeout(renderWatch, 30000);
  } catch (e) { $('#watchState').textContent = '即時價格暫時取不到'; }
}
renderWatch();

/* 依類型找股票 */
let curSector = null, sortBy = 'vol', showAll = false;
function renderBrowse() {
  if (!STOCKS) { $('#sectorTable').innerHTML = '<p class="err">股票清單暫時載不到，請重新整理頁面。</p>'; return; }
  const secs = SECTORS.length ? SECTORS : [];
  if (!curSector) { const hs = decodeURIComponent(location.hash.slice(1)); curSector = (secs.find(s => s.id === hs) || secs.find(s => s.id === '24') || secs[0] || {}).id; }
  $('#sectorTabs').innerHTML = secs.map(s => `<button class="chip" type="button" role="tab" data-sec="${esc(s.id)}" aria-selected="${s.id === curSector}" aria-pressed="${s.id === curSector}">${esc(s.name)} <span class="small muted num">${s.n}</span></button>`).join('');
  $('#sectorTabs').querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { curSector = b.dataset.sec; showAll = false; history.replaceState(null, '', '#' + curSector); renderBrowse(); });
  const sorts = [['vol', '成交量'], ['up', '漲幅'], ['down', '跌幅']];
  const selTab = $('#sectorTabs [aria-pressed="true"]'); if (selTab) { const box = $('#sectorTabs'); box.scrollLeft = selTab.offsetLeft - box.clientWidth / 2 + selTab.clientWidth / 2; }
  $('#sortRow').innerHTML = '排序：' + sorts.map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${sortBy === k}">${l}</button>`).join('');
  $('#sortRow').querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { sortBy = b.dataset.sort; renderBrowse(); });
  let rows = STOCKS.filter(s => s[3] === curSector);
  const f = { vol: (a, b) => (b[6] || 0) - (a[6] || 0), up: (a, b) => (b[5] ?? -99) - (a[5] ?? -99), down: (a, b) => (a[5] ?? 99) - (b[5] ?? 99) }[sortBy];
  rows.sort(f);
  const total = rows.length; if (!showAll) rows = rows.slice(0, 30);
  $('#sectorTable').innerHTML = `<table class="stock-table"><thead><tr><th>股票</th><th>市場</th><th>收盤</th><th>漲跌</th><th>成交量（張）</th><th></th></tr></thead><tbody>${rows.map(s => `<tr data-code="${esc(s[0])}"><td class="nm"><a href="/analysis/${esc(s[0])}"><span class="num">${esc(s[0])}</span>${esc(s[1])}</a></td><td class="small muted">${s[2]}</td><td class="num">${pxd(s[4])}</td><td class="num ${cls(s[5])}">${s[5] == null ? '—' : sg(s[5]) + '%'}</td><td class="num">${fi(s[6])}</td><td>${starBtn(s[0], s[1])}</td></tr>`).join('')}</tbody></table>
    ${total > rows.length ? `<button class="btn ghost" type="button" id="moreRows" style="margin-top:10px">顯示全部 ${total} 檔</button>` : ''}`;
  $('#browseDate').textContent = window.LIST_DATE ? window.LIST_DATE + ' 收盤資料' : '最近一個交易日收盤資料';
  bindStars($('#sectorTable'), renderWatch);
  $('#sectorTable').querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a,button')) goTo(tr.dataset.code); });
  const more = $('#moreRows'); if (more) more.onclick = () => { showAll = true; renderBrowse(); };
}
window.addEventListener('pageshow', e => { if (e.persisted) renderWatch(); });

/* 首頁摘要卡 */
const miniRow = (code, name, right, tag) => `<li><a href="/analysis/${esc(code)}"><span class="num code">${esc(code)}</span><span class="nm">${esc(name || '')}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</span>${right}</a></li>`;
async function renderPvWatch() {
  const box = $('#pvWatch'); if (!box) return;
  const list = Watch.get();
  if (!list.length) { box.innerHTML = `<p class="small muted" style="margin:0">還沒有加入股票。在個股頁按「☆ 加入我的選股」，或到<a href="/sectors">產業分類</a>點 ☆。</p>`; return; }
  const items = list.slice(0, 5);
  const draw = (q = {}) => { box.innerHTML = `<ul class="mini">${items.map(w => { const x = q[w.code] || {}; const chg = x.price && x.prev ? (x.price / x.prev - 1) * 100 : null; return miniRow(w.code, w.name, `<span class="num ${cls(chg)}">${x.price ? pxd(x.price) : '—'}　${chg == null ? '' : sg(chg) + '%'}</span>`); }).join('')}</ul>${list.length > 5 ? `<p class="note" style="margin:0">還有 ${list.length - 5} 檔，到「我的選股」看全部。</p>` : ''}`; };
  draw();
  try { const j = await fetch('/api/quote?codes=' + items.map(w => w.code).join(',')).then(r => r.json()); const q = {}; (j.quotes || []).forEach(x => { if (x.price) q[x.code] = x; }); draw(q); } catch (e) {}
}
async function renderPvIntra() {
  const box = $('#pvIntra'); if (!box) return;
  box.innerHTML = '<p class="small muted" style="margin:0">掃描中…</p>';
  try {
    const j = await fetch('/api/intraday').then(r => r.json()); if (j.error) throw new Error(j.error);
    const open = j.session && j.session.open;
    box.innerHTML = `<p class="small muted" style="margin:0">${open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((j.time || '').slice(0, 5))}</span>` : `${j.date ? esc(j.date.replace(/-/g, '/')) + ' ' : ''}收盤時的結果，開盤後自動更新`}</p>` +
      (j.picks.length ? `<ul class="mini">${j.picks.map(x => miniRow(x.code, x.name, `<span class="num ${cls(x.chg)}">${pxd(x.price)}　${sg(x.chg)}%</span>`)).join('')}</ul>` : '<p class="small muted" style="margin:0">目前沒有股票符合條件。</p>');
    if (open) setTimeout(renderPvIntra, 180000);
  } catch (e) { box.innerHTML = `<p class="small err" style="margin:0">${esc(e.message)}</p>`; }
}
async function renderPvPicks() {
  const box = $('#pvPicks'); if (!box) return;
  box.innerHTML = '<p class="small muted" style="margin:0">載入中…</p>';
  try {
    const j = await getPicks();
    const rows = [['當沖', j.day], ['短期', j.swing], ['長期', j.long]].flatMap(([t, l]) => l.slice(0, 1).map(x => miniRow(x.code, x.name, `<span class="num ${cls(x.chg)}">${pxd(x.close)}　${sg(x.chg)}%</span>`, t)));
    box.innerHTML = `<p class="small muted" style="margin:0">${esc(j.date)} 收盤後篩選，各類第一名：</p>${rows.length ? `<ul class="mini">${rows.join('')}</ul>` : '<p class="small muted">今天沒有股票符合條件。</p>'}`;
  } catch (e) { box.innerHTML = `<p class="small err" style="margin:0">${esc(e.message)}</p>`; }
}
function renderPvSectors() {
  const box = $('#pvSectors'); if (!box) return;
  const want = ['24', '28', '25', '26', '27', '17', '15', '22', '35', '10', '12', 'ETF'];
  const secs = want.map(id => SECTORS.find(s => s.id === id)).filter(Boolean);
  box.innerHTML = `<p class="small muted" style="margin:0">點一個產業，看這類股票今天的漲跌和成交量。</p><div class="chips">${secs.map(s => `<a class="chip" href="/sectors#${esc(s.id)}" style="text-decoration:none">${esc(s.name)} <span class="small muted num">${s.n}</span></a>`).join('')}</div>`;
}
renderPvWatch(); renderPvIntra(); renderPvPicks();

/* 類股強弱：依成交值加權的平均漲跌、上漲／下跌家數 */
function sectorStats() {
  return SECTORS.filter(s => s.id !== '80' && s.id !== '91').map(s => {
    const rows = STOCKS.filter(x => x[3] === s.id && x[5] != null && x[4] && x[6]);
    let w = 0, acc = 0, up = 0, dn = 0;
    rows.forEach(x => { const val = x[4] * x[6]; w += val; acc += x[5] * val; if (x[5] > 0) up++; else if (x[5] < 0) dn++; });
    return { id: s.id, name: s.name, chg: w ? acc / w : 0, up, dn, n: rows.length, value: w };
  }).filter(s => s.n >= 3);
}
function heatColor(chg) {
  const a = Math.min(1, Math.abs(chg) / 3);
  if (Math.abs(chg) < 0.05) return 'background:var(--sunk);color:var(--muted)';
  return chg > 0 ? `background:color-mix(in srgb, var(--up) ${Math.round(12 + a * 70)}%, var(--surface));color:${a > .55 ? '#fff' : 'var(--ink)'}`
                 : `background:color-mix(in srgb, var(--down) ${Math.round(12 + a * 70)}%, var(--surface));color:${a > .55 ? '#fff' : 'var(--ink)'}`;
}
function renderHeat(box, limit) {
  if (!box || !STOCKS) return;
  let st = sectorStats().sort((a, b) => b.value - a.value);
  if (limit) st = st.slice(0, limit);
  st.sort((a, b) => b.chg - a.chg);
  box.innerHTML = `<div class="heat">${st.map(s => `<a href="/sectors#${esc(s.id)}" style="${heatColor(s.chg)}" title="${esc(s.name)}：上漲 ${s.up} 家、下跌 ${s.dn} 家"><b>${esc(s.name)}</b><span class="num">${sg(s.chg)}%</span><small class="num">漲 ${s.up}・跌 ${s.dn}</small></a>`).join('')}</div>
    <p class="note" style="margin:8px 0 0">${window.LIST_DATE ? esc(window.LIST_DATE) + ' 收盤。' : ''}每格的漲跌幅以成交值加權（成交越大的股票影響越大），紅色代表上漲、綠色代表下跌，顏色越深漲跌越多。點一格看該產業的股票。</p>`;
}
loadStocks().then(() => { renderHeat($('#pvHeat'), 12); renderHeat($('#heatAll')); });
