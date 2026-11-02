const syncNote = () => window.Sync && Sync.ready() ? (Sync.user ? '資料已登入同步，不同裝置會顯示相同內容。' : '目前存在這台裝置；登入後可在不同裝置同步。') : '資料存在目前使用的瀏覽器中。';
/* 各分頁共用：依頁面上有哪些區塊決定要載入什麼 */
// 第 4 名以後用精簡列表顯示
const moreRows = (list, pk) => list.length ? `<ol class="rank-more" start="4">${list.map(x => `<li><button type="button" class="pick-row" data-code="${esc(x.code)}"><span class="num" style="color:var(--accent)">${esc(x.code)}</span><span class="nm">${esc(x.name)}${secTag(x.code)}</span><span class="num ${cls(x.chg)}">${pxd(x[pk])} ${sg(x.chg)}%</span>${x.index != null ? `<span class="num small" style="color:${scoreColor(x.index)}">${x.index}</span>` : ''}</button></li>`).join('')}</ol>` : '';
// 盤後名單：讀每日排程（GitHub Actions）存好的檔案
let pickIndex;
async function getIndex() { if (pickIndex === undefined) pickIndex = await fetch('/data/index.json').then(r => r.ok ? r.json() : null).catch(() => null); return pickIndex; }
async function getPicks(date) {
  if (date) { const r = await fetch(`/data/daily/${date}.json`); if (r.ok) return r.json(); }
  const s = await fetch('/data/latest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (s && s.day) return s;
  throw new Error('名單尚未產生，每個交易日約 17:00 更新。');
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
  if (!box.innerHTML) box.innerHTML = `<h2 id="intraTitle">盤中強勢股觀察</h2><div class="loading" style="margin-top:10px"><div class="dots"><span></span><span></span><span></span></div><span class="small muted">正在掃描即時行情…</span></div>`;
  try {
    const r = await fetch('/api/intraday'); const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    const open = j.session && j.session.open;
    const state = open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((j.time || '').slice(0, 5))}・每 3 分鐘更新</span>` : `<span class="live-badge"><span class="dot"></span>${j.date ? esc(j.date.replace(/-/g, '/')) + ' ' : ''}收盤結果・下個交易日 9:00 起即時更新</span>`;
    const cards = j.picks.length ? j.picks.slice(0, 3).map(x => `<button class="pick" type="button" data-code="${esc(x.code)}">
        <div class="top1"><span><span class="code num" style="color:var(--accent)">${esc(x.code)}</span> <span class="nm">${esc(x.name)}</span>${secTag(x.code)}</span><span class="num ${cls(x.chg)}">${pxd(x.price)} ${sg(x.chg)}%</span></div>
        <div class="sigs">${x.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
        <div class="lv num"><span>成交 ${fi(x.vol)} 張</span><span>更新 ${esc((x.time || '').slice(0, 5))}</span></div></button>`).join('') + moreRows(j.picks.slice(3), 'price')
      : `<div class="empty">${open ? '目前沒有符合條件的股票，3 分鐘後將重新掃描。' : '今日收盤時沒有符合條件的股票。'}</div>`;
    box.innerHTML = `<div class="section-head"><h2 id="intraTitle">盤中強勢股觀察</h2>${state}</div>
      <div class="howto">
        <div><b>內容</b><span>交易時間即時掃描前一交易日成交值最大的 150 檔上市股票，列出成交量放大、振幅較大、股價位於當日高檔的個股。此清單只反映當下盤勢，尚未經過歷史資料驗證。</span></div>
        <div><b>使用方式</b><span>可作為盤中觀察清單。點選個股查看支撐與壓力：股價守在支撐之上代表仍偏強，跌破支撐通常代表轉弱。</span></div>
        <div><b>注意事項</b><span>名單每 3 分鐘更新，強勢股可能隨時轉弱。本名單僅為即時篩選結果，不構成買賣建議。</span></div>
      </div>
      <div class="picks-grid">${cards}</div>
      <details class="rules"><summary>篩選條件</summary><p>條件：漲幅 1.5%～9% 且未鎖漲停、今日振幅 2.5% 以上、價格位於今日高低區間 60% 以上、累計成交量達前一交易日同時段估計量的 1.3 倍以上（依交易時間比例估算，例如 10:30 以前一交易日總量的三分之一為基準）。依量能倍數、振幅、高檔位置與漲幅加權排名。開盤初期成交較集中，量能倍數通常偏高。</p></details>`;
    box.querySelectorAll('.pick, .pick-row').forEach(b => b.onclick = () => goTo(b.dataset.code));
    clearTimeout(intraTimer); if (open) intraTimer = setTimeout(loadIntraday, 180000);
  } catch (e) {
    box.innerHTML = `<h2 id="intraTitle">盤中強勢股觀察</h2><p class="err">${esc(e.message)}</p><button class="btn ghost" type="button" id="retryIntra">再試一次</button>`;
    $('#retryIntra').onclick = loadIntraday;
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#intraday')) loadIntraday(); });

async function loadPicks(date) {
  const box = $('#picks'); if (!box) return;
  box.innerHTML = `<h2 id="picksTitle">盤後篩選名單</h2><div class="loading" style="margin-top:10px"><div class="dots"><span></span><span></span><span></span></div><span class="small muted">載入名單中…</span></div>`;
  try {
    const j = await getPicks(date); const idx = await getIndex();
    const sc = await fetch('/data/scorecard.json').then(r => r.ok ? r.json() : null).catch(() => null);
    const track = cat => { const s = sc && sc.summary && sc.summary[cat]; const v = s && s.all; if (!v) return `<p class="track">成績單：紀錄不足，暫無法評估。</p>`;
      const ok = v.n >= 30 && v.excess > 0;
      return `<p class="track ${ok ? 'good' : 'weak'}"><b>歷史表現</b>　每日前 3 名隔天開盤買進、持有 ${s.hold} 個交易日，扣交易成本後平均 <span class="num ${cls(v.avg)}">${sg(v.avg)}%</span>、勝率 ${v.win}%；同期間隨機買進全市場平均 ${sg(v.bench)}%（${v.n} 筆）。${ok ? '' : v.n < 30 ? '樣本數仍少，僅供參考。' : '目前未優於全市場平均，請審慎參考。'} <a href="/scorecard">成績單</a></p>`; };
    const col = (title, sub, list, n, cat) => `<div class="pcol"><h3>${title}<small>${sub}・符合 ${n} 檔</small></h3>${track(cat)}${list.length ? list.slice(0, 3).map(x => `<button class="pick" type="button" data-code="${esc(x.code)}">
      <div class="top1"><span><span class="code num" style="color:var(--accent)">${esc(x.code)}</span> <span class="nm">${esc(x.name)}</span>${secTag(x.code)}</span><span class="num ${cls(x.chg)}">${pxd(x.close)} ${sg(x.chg)}%</span></div>
      <div class="sigs">${x.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
      <div class="lv num"><span>強度分數 <b style="color:${scoreColor(x.index)}">${x.index ?? '—'}</b></span><span>支撐 <b style="color:var(--sup)">${x.sup != null ? pxd(x.sup) : '—'}</b></span><span>壓力 <b style="color:var(--res)">${x.res != null ? pxd(x.res) : '—'}</b></span></div></button>`).join('') + moreRows(list.slice(3), 'close') : '<div class="empty">今天沒有股票符合條件。</div>'}</div>`;
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 id="picksTitle">盤後篩選名單</h2><span class="small muted num">${idx && idx.dates.length > 1 ? `<label for="pickDate">查看日期 </label><select id="pickDate">${idx.dates.slice().reverse().map(d => `<option value="${d}"${d.replace(/-/g, '/') === j.date ? ' selected' : ''}>${d.replace(/-/g, '/')}</option>`).join('')}</select>　` : esc(j.date) + ' 收盤・'}掃描 ${j.universe} 檔上市櫃股票</span></div>
      <div class="howto">
        <div><b>內容</b><span>每個交易日收盤後，依固定規則從上市櫃股票中篩選，分為短線（約 1 週）、波段（約 1 個月）、長線（約 3 個月）三類，每類列出前 10 名。規則以 2025 年起的歷史資料回測選出，同一檔股票可能同時出現在多類名單。</span></div>
        <div><b>使用方式</b><span>名單的歷史表現以「隔天開盤買進、持有到期後賣出」計算，請依各類的持有期間參考。點選個股可查看強度分數與支撐壓力；若入選後跌破主要支撐，代表入選時的條件已經改變。</span></div>
        <div><b>注意事項</b><span>入選代表該股在收盤時符合篩選條件，並非對未來漲跌的預測，也不構成買賣建議。回測期間以多頭行情為主，行情轉弱時表現可能明顯變差。</span></div>
      </div>
      <div class="picks-grid">${col('短線觀察', '持有約 1 週', j.day, j.counts.day, 'day')}${col('波段觀察', '持有約 1 個月', j.swing, j.counts.swing, 'swing')}${col('長線觀察', '持有約 3 個月', j.long, j.counts.long, 'long')}</div>
      <details class="rules"><summary>篩選條件</summary>
        <p>共同條件：上市櫃普通股，近 20 日平均每日成交值 10 億元以上，三大法人近 5 個交易日中多數日子為合計買超。</p>
        <p><b>短線觀察</b>：均線多頭排列（收盤在月線之上、月線在季線之上，且月線與季線都向上）、收盤距離 60 日最高點 5% 以內、近 5 日至少 3 天法人買超。依法人買超占日均量的比例排名。</p>
        <p><b>波段觀察</b>：均線多頭排列、股價拉回到月線附近（高於月線 0%～8%）、近 5 日至少 4 天法人買超。依成交值與法人買超比例排名。</p>
        <p><b>長線觀察</b>：收盤站上季線且季線向上、本益比 12～40 倍、近 5 日至少 3 天法人買超。依成交值與法人買超比例排名。</p>
        <p><b>規則怎麼來的</b>：以 2025 年 1 月至 2026 年 10 月的上市櫃資料回測，比較多組條件，只保留在每個半年期間都優於「同一天隨機買進全市場股票」的規則。報酬以隔天開盤價買進、扣除手續費與證交稅（約 0.47%）計算。</p>
        <p>實際表現每日更新於<a href="/scorecard">名單成績單</a>。資料來源為證交所與櫃買中心盤後公開資料。</p>
      </details>`;
    box.querySelectorAll('.pick, .pick-row').forEach(b => b.onclick = () => goTo(b.dataset.code));
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
/* 選股與庫存的支撐壓力：每天收盤後算好的 data/levels.json，配合即時價格標示位置 */
let LV = null, lvP = null;
const getLevels = () => lvP || (lvP = fetch('/data/levels.json').then(r => r.ok ? r.json() : null).then(j => (LV = j)).catch(() => null));
const LV_STR = ['', '弱', '中', '強', '極強'];
const lvMode = { get: () => Store.read('jiegou-lvmode', 'simple'), set: v => Store.write('jiegou-lvmode', v) };
function lvInfo(code, px) {
  const a = LV && LV.s && LV.s[code]; if (!a || px == null) return null; const [s1, s1r, s2, s2r, r1, r1r, r2, r2r] = a;
  // 以現價重新分上下：跌破的支撐變成上方價位、突破的壓力變成下方價位
  const all = [[s1, s1r], [s2, s2r], [r1, r1r], [r2, r2r]].filter(x => x[0] != null);
  const below = all.filter(x => x[0] < px).sort((x, y) => y[0] - x[0])[0] || null, above = all.filter(x => x[0] > px).sort((x, y) => x[0] - y[0])[0] || null;
  let tag = null;
  if (s1 != null && px < s1) tag = ['跌破支撐', 'bad']; else if (r1 != null && px > r1) tag = ['突破壓力', 'good'];
  else if (below && (px - below[0]) / px <= 0.01) tag = ['接近支撐', 'warn']; else if (above && (above[0] - px) / px <= 0.01) tag = ['接近壓力', 'warn'];
  return { s1, s1r, s2, s2r, r1, r1r, r2, r2r, lo: below, hi: above, tag };
}
function lvCell(code, px) {
  const v = lvInfo(code, px); if (!v || (!v.lo && !v.hi)) return '<span class="muted small">—</span>';
  const lo = v.lo ? v.lo[0] : px * 0.95, hi = v.hi ? v.hi[0] : px * 1.05, pos = Math.min(1, Math.max(0, (px - lo) / (hi - lo)));
  const d = x => sg((x / px - 1) * 100, 1) + '%';
  return `<div class="lvx"><div class="lvx-ends num"><span class="sup">${v.lo ? pxd(v.lo[0]) : '—'}</span>${v.tag ? `<span class="lv-tag ${v.tag[1]}">${v.tag[0]}</span>` : ''}<span class="res">${v.hi ? pxd(v.hi[0]) : '—'}</span></div>
    <div class="lvx-bar" aria-hidden="true"><i style="left:${(pos * 100).toFixed(1)}%"></i></div>
    <div class="lvx-ends small muted num"><span>${v.lo ? '支撐 ' + d(v.lo[0]) : '下方無近端支撐'}</span><span>${v.hi ? '壓力 ' + d(v.hi[0]) : '上方無近端壓力'}</span></div></div>`;
}
function lvDetail(code, px, cols) {
  const v = lvInfo(code, px) || {};
  const all = [['支撐', v.s1, v.s1r], ['支撐', v.s2, v.s2r], ['壓力', v.r1, v.r1r], ['壓力', v.r2, v.r2r]].filter(x => x[1] != null);
  const ref = px ?? (v.s1 || v.r1);
  const it = x => { const side = ref != null && x[1] > ref ? '上方' : '下方', was = ref != null && ((x[0] === '支撐' && x[1] > ref) ? '（已跌破的支撐）' : (x[0] === '壓力' && x[1] < ref) ? '（已突破的壓力）' : '');
    return `<span><b>${side}</b> <span class="num">${pxd(x[1])}</span>${ref ? `<span class="muted">（${sg((x[1] / ref - 1) * 100, 1)}%）</span>` : ''}・${LV_STR[x[2]] || ''}${was ? `<span class="muted">${was}</span>` : ''}</span>`; };
  const body = all.sort((a, b) => b[1] - a[1]).map(it).join('');
  return `<tr class="lv-detail" data-for="${esc(code)}" hidden><td colspan="${cols}"><div class="lv-more">${body || '<span class="muted">近端沒有明確的支撐壓力。</span>'}<a href="/analysis/${esc(code)}">看完整分析 →</a></div></td></tr>`;
}
function bindLv(box, redraw) {
  const det = lvMode.get() === 'detail'; box.querySelectorAll('tr.lv-detail').forEach(t => t.hidden = !det);
  box.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = e => { if (e.target.closest('a,button,input')) return; const d = box.querySelector(`tr.lv-detail[data-for="${tr.dataset.code}"]`); if (d) d.hidden = !d.hidden; });
  const b = box.querySelector('[data-lvmode]'); if (b) b.onclick = () => { lvMode.set(lvMode.get() === 'detail' ? 'simple' : 'detail'); redraw(); };
}
const lvToggle = () => `<button class="linkbtn" type="button" data-lvmode title="切換是否展開所有股票的第二道支撐壓力">${lvMode.get() === 'detail' ? '收合價位' : '展開價位'}</button>`;
const lvNote = () => LV && LV.date ? `支撐壓力為 ${esc(LV.date.replace(/-/g, '/'))} 收盤後計算，點一下該列可看所有價位與強度。` : '';

async function renderWatch() {
  const box = $('#watch'); if (!box) return; const list = Watch.get();
  const head = `<div class="section-head"><h2 id="watchTitle">我的選股</h2><span class="small muted">${lvToggle()}　<span id="watchState"></span></span></div>`;
  if (!list.length) {
    box.innerHTML = head + `<p class="small muted" style="margin:6px 0 0">尚未加入股票。可在個股分析頁點選「☆ 加入我的選股」，或在<a href="/sectors">產業分類</a>中點選 ☆。${syncNote()}</p>`;
    return;
  }
  const rowsHtml = (q = {}) => list.map(w => { const x = q[w.code] || {}; const chg = x.price && x.prev ? (x.price / x.prev - 1) * 100 : null;
    return `<tr data-code="${esc(w.code)}"><td class="nm"><a href="/analysis/${esc(w.code)}"><span class="num">${esc(w.code)}</span>${esc(w.name || x.name || '')}</a>${secTag(w.code)}</td>
      <td class="num">${x.price ? pxd(x.price) : '—'}</td><td class="num ${cls(chg)}">${chg == null ? '—' : sg(chg) + '%'}</td><td class="lvc">${lvCell(w.code, x.price || null)}</td><td class="num hide-sm">${x.vol != null ? fi(x.vol) : '—'}</td>
      <td class="num" style="color:${scoreColor(w.index)}">${w.index ?? '—'}${w.trend ? `<span class="small muted">・${esc(w.trend)}</span>` : ''}</td><td>${starBtn(w.code, w.name)}</td></tr>${lvDetail(w.code, x.price || null, 7)}`; }).join('');
  const table = q => `<div class="scroll"><table class="stock-table"><thead><tr><th>股票</th><th>價格</th><th>漲跌</th><th class="lvc">支撐 ← 現價 → 壓力</th><th class="hide-sm">成交量（張）</th><th>強度分數</th><th></th></tr></thead><tbody>${rowsHtml(q)}</tbody></table></div>
    <p class="note" style="margin:6px 0 0">${lvNote()}強度分數為最近一次開啟該股分析頁時的結果，進入個股分析頁即可依最新資料重新計算。${syncNote()}</p>`;
  box.innerHTML = head + table();
  const bind = () => { bindStars(box, renderWatch); bindLv(box, renderWatch); };
  bind();
  try {
    const codes = list.map(w => w.code), q = {}; let sess = null;
    for (let i = 0; i < codes.length; i += 20) { const r = await fetch('/api/quote?codes=' + codes.slice(i, i + 20).join(',')); const j = await r.json(); sess = j.session; (j.quotes || []).forEach(x => { if (x.price) q[x.code] = x; }); }
    await getLevels(); box.innerHTML = head + table(q); bind();
    const any = Object.values(q)[0];
    $('#watchState').innerHTML = sess && sess.open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((any && any.time || '').slice(0, 5))}・每 30 秒更新</span>` : `<span class="live-badge"><span class="dot"></span>${any && any.date ? esc(any.date.replace(/-/g, '/')) + ' ' : ''}收盤價</span>`;
    clearTimeout(watchTimer); if (sess && sess.open) watchTimer = setTimeout(renderWatch, 30000);
  } catch (e) { $('#watchState').textContent = '即時價格暫時取不到'; }
}
renderWatch();

/* 庫存：股數與平均成本，計算市值與未實現損益 */
let holdTimer = null, holdEdit = null;
async function renderHold() {
  const box = $('#hold'); if (!box) return; const list = Holdings.get();
  const e = holdEdit ? list.find(x => x.code === holdEdit) : null;
  const form = `<form class="hold-form" id="holdForm" autocomplete="off">
      <label><span>股票</span><input id="hCode" list="hList" placeholder="代號或名稱" value="${e ? esc(e.code + ' ' + (e.name || '')) : ''}" required></label><datalist id="hList"></datalist>
      <label><span>股數</span><input id="hShares" inputmode="numeric" placeholder="例如 1000" value="${e ? e.shares : ''}" required></label>
      <label><span>平均成本（元）</span><input id="hAvg" inputmode="decimal" placeholder="例如 52.3" value="${e ? e.avg : ''}" required></label>
      <button class="btn" type="submit">${e ? '更新' : '新增'}</button>${e ? '<button class="btn ghost" type="button" id="hCancel">取消</button>' : ''}
      <p class="small err" id="hMsg" hidden></p></form>`;
  const head = `<div class="section-head"><h2 id="holdTitle">我的庫存</h2><span class="small muted">${list.length ? lvToggle() + '　' : ''}<span id="holdState"></span></span></div>`;
  const body = (q = {}) => {
    if (!list.length) return `<p class="small muted" style="margin:6px 0 0">尚未記錄庫存。輸入股票、股數（1 張 = 1,000 股）與平均成本即可計算損益。</p>`;
    let tc = 0, tv = 0, pv = 0, hasAll = true;
    const rows = list.map(h => { const x = q[h.code] || {}; const px = x.price || null, cost = h.shares * h.avg, mv = px ? h.shares * px : null, pl = mv != null ? mv - cost : null;
      tc += cost; if (mv != null) { tv += mv; pv += cost; } else hasAll = false;
      const day = x.price && x.prev ? (x.price - x.prev) * h.shares : null;
      return `<tr data-code="${esc(h.code)}"><td class="nm"><a href="/analysis/${esc(h.code)}"><span class="num">${esc(h.code)}</span>${esc(h.name || x.name || '')}</a>${secTag(h.code)}</td>
        <td class="num">${fi(h.shares)}</td><td class="num">${pxd(h.avg)}</td><td class="num">${px ? pxd(px) : '—'}</td><td class="lvc">${lvCell(h.code, px)}</td><td class="num">${fi(cost)}</td><td class="num">${mv != null ? fi(mv) : '—'}</td>
        <td class="num ${cls(day)}">${day != null ? sgi(day) : '—'}</td><td class="num ${cls(pl)}">${pl != null ? sgi(pl) : '—'}</td><td class="num ${cls(pl)}">${pl != null ? sg(pl / cost * 100) + '%' : '—'}</td>
        <td class="hold-act"><button class="linkbtn" type="button" data-edit="${esc(h.code)}">編輯</button><button class="linkbtn" type="button" data-del="${esc(h.code)}">刪除</button></td></tr>${lvDetail(h.code, px, 11)}`; }).join('');
    const tpl = tv - pv;
    return `<div class="hold-sum"><div><span>總成本</span><b class="num">${fi(tc)}</b></div><div><span>目前市值</span><b class="num">${tv ? fi(tv) : '—'}</b></div><div><span>未實現損益</span><b class="num ${cls(tpl)}">${pv ? sgi(tpl) : '—'}</b></div><div><span>報酬率</span><b class="num ${cls(tpl)}">${pv ? sg(tpl / pv * 100) + '%' : '—'}</b></div></div>
      <div class="scroll"><table class="stock-table"><thead><tr><th>股票</th><th>股數</th><th>平均成本</th><th>現價</th><th class="lvc">支撐 ← 現價 → 壓力</th><th>成本</th><th>市值</th><th>今日損益</th><th>未實現損益</th><th>報酬率</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note" style="margin:6px 0 0">金額單位為元。損益以現價（盤中為即時價、收盤後為收盤價）計算，未扣除手續費與證交稅${hasAll ? '' : '；部分股票暫時取不到價格，未列入市值合計'}。${lvNote()}${syncNote()}</p>`;
  };
  const draw = q => {
    box.innerHTML = head + form + body(q);
    const f = $('#holdForm'), msg = $('#hMsg');
    const dl = $('#hList'), ci = $('#hCode');
    ci.addEventListener('input', () => { if (!STOCKS) return; dl.innerHTML = findStocks(ci.value, 8).map(x => `<option value="${esc(x[0] + ' ' + x[1])}">`).join(''); });
    loadStocks();
    f.onsubmit = async ev => { ev.preventDefault(); msg.hidden = true;
      await loadStocks(); const raw = ci.value.trim(), hit = findStocks(raw.split(/\s+/)[0], 1)[0] || findStocks(raw, 1)[0];
      const shares = +String($('#hShares').value).replace(/,/g, ''), avg = +String($('#hAvg').value).replace(/,/g, '');
      const bad = !hit ? '找不到這檔股票，請輸入代號或完整名稱。' : !(shares > 0 && Number.isFinite(shares)) ? '股數請輸入大於 0 的數字。' : !(avg > 0 && Number.isFinite(avg)) ? '平均成本請輸入大於 0 的數字。' : '';
      if (bad) { msg.textContent = bad; msg.hidden = false; return; }
      if (holdEdit && holdEdit !== hit[0]) Holdings.remove(holdEdit);
      Holdings.set(hit[0], hit[1], shares, avg); holdEdit = null; renderHold(); };
    const cc = $('#hCancel'); if (cc) cc.onclick = () => { holdEdit = null; renderHold(); };
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { holdEdit = b.dataset.edit; renderHold(); $('#hShares').focus(); });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Holdings.remove(b.dataset.del); if (holdEdit === b.dataset.del) holdEdit = null; renderHold(); });
    bindLv(box, () => draw(q));
  };
  draw();
  if (!list.length) return;
  try {
    const codes = list.map(h => h.code), q = {}; let sess = null;
    for (let i = 0; i < codes.length; i += 20) { const r = await fetch('/api/quote?codes=' + codes.slice(i, i + 20).join(',')); const j = await r.json(); sess = j.session; (j.quotes || []).forEach(x => { if (x.price) q[x.code] = x; }); }
    await getLevels();
    const keep = document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (!keep) draw(q);
    const any = Object.values(q)[0];
    $('#holdState').innerHTML = sess && sess.open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((any && any.time || '').slice(0, 5))}・每 30 秒更新</span>` : `<span class="live-badge"><span class="dot"></span>${any && any.date ? esc(any.date.replace(/-/g, '/')) + ' ' : ''}收盤價</span>`;
    clearTimeout(holdTimer); if (sess && sess.open) holdTimer = setTimeout(renderHold, 30000);
  } catch (e) { const st = $('#holdState'); if (st) st.textContent = '即時價格暫時取不到'; }
}
renderHold();
document.addEventListener('jiegou-data', () => { renderHold(); renderWatch(); });

/* 依類型找股票 */
let curSector = null, sortBy = 'vol', showAll = false;
function renderBrowse() {
  if (!STOCKS) { $('#sectorTable').innerHTML = '<p class="err">股票清單暫時無法載入，請重新整理頁面。</p>'; return; }
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
const miniRow = (code, name, right, tag) => `<li><a href="/analysis/${esc(code)}"><span class="num code">${esc(code)}</span><span class="nm">${esc(name || '')}${secTag(code)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</span>${right}</a></li>`;
async function renderPvWatch() {
  const box = $('#pvWatch'); if (!box) return;
  const list = Watch.get();
  if (!list.length) { box.innerHTML = `<p class="small muted" style="margin:0">尚未加入股票。可在個股分析頁點選「☆ 加入我的選股」，或在<a href="/sectors">產業分類</a>中點選 ☆。</p>`; return; }
  const items = list.slice(0, 5);
  const draw = (q = {}) => { box.innerHTML = `<ul class="mini">${items.map(w => { const x = q[w.code] || {}; const chg = x.price && x.prev ? (x.price / x.prev - 1) * 100 : null; return miniRow(w.code, w.name, `<span class="num ${cls(chg)}">${x.price ? pxd(x.price) : '—'}　${chg == null ? '' : sg(chg) + '%'}</span>`); }).join('')}</ul>${list.length > 5 ? `<p class="note" style="margin:0">另有 ${list.length - 5} 檔，請至「我的選股」查看。</p>` : ''}`; };
  draw();
  try { const j = await fetch('/api/quote?codes=' + items.map(w => w.code).join(',')).then(r => r.json()); const q = {}; (j.quotes || []).forEach(x => { if (x.price) q[x.code] = x; }); draw(q); } catch (e) {}
}
async function renderPvIntra() {
  const box = $('#pvIntra'); if (!box) return;
  box.innerHTML = '<p class="small muted" style="margin:0">掃描中…</p>';
  try {
    const j = await fetch('/api/intraday').then(r => r.json()); if (j.error) throw new Error(j.error);
    const open = j.session && j.session.open;
    box.innerHTML = `<p class="small muted" style="margin:0">${open ? `<span class="live-badge"><span class="dot on"></span>盤中 ${esc((j.time || '').slice(0, 5))}</span>` : `${j.date ? esc(j.date.replace(/-/g, '/')) + ' ' : ''}收盤結果，開盤後即時更新`}</p>` +
      (j.picks.length ? `<ul class="mini">${j.picks.slice(0, 3).map(x => miniRow(x.code, x.name, `<span class="num ${cls(x.chg)}">${pxd(x.price)}　${sg(x.chg)}%</span>`)).join('')}</ul>` : '<p class="small muted" style="margin:0">目前沒有股票符合條件。</p>');
    if (open) setTimeout(renderPvIntra, 180000);
  } catch (e) { box.innerHTML = `<p class="small err" style="margin:0">${esc(e.message)}</p>`; }
}
async function renderPvPicks() {
  const box = $('#pvPicks'); if (!box) return;
  box.innerHTML = '<p class="small muted" style="margin:0">載入中…</p>';
  try {
    const j = await getPicks();
    const cats = [['day', '短線'], ['swing', '波段'], ['long', '長線']];
    let cur = 'day';
    const draw = () => { const l = j[cur] || [];
      box.innerHTML = `<p class="small muted" style="margin:0">${esc(j.date)} 收盤後篩選，各類前 3 名</p><div class="mini-tabs" role="tablist">${cats.map(([k, t]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === cur}">${t}</button>`).join('')}</div>${l.length ? `<ul class="mini">${l.slice(0, 3).map(x => miniRow(x.code, x.name, `<span class="num ${cls(x.chg)}">${pxd(x.close)}　${sg(x.chg)}%</span>`)).join('')}</ul>` : '<p class="small muted" style="margin:0">此類別今日沒有符合條件的股票。</p>'}`;
      box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { cur = b.dataset.k; draw(); }); };
    draw();
  } catch (e) { box.innerHTML = `<p class="small err" style="margin:0">${esc(e.message)}</p>`; }
}
function renderPvSectors() {
  const box = $('#pvSectors'); if (!box) return;
  const want = ['24', '28', '25', '26', '27', '17', '15', '22', '35', '10', '12', 'ETF'];
  const secs = want.map(id => SECTORS.find(s => s.id === id)).filter(Boolean);
  box.innerHTML = `<p class="small muted" style="margin:0">點選產業查看個股漲跌與成交量。</p><div class="chips">${secs.map(s => `<a class="chip" href="/sectors#${esc(s.id)}" style="text-decoration:none">${esc(s.name)} <span class="small muted num">${s.n}</span></a>`).join('')}</div>`;
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
    <p class="note" style="margin:8px 0 0">${window.LIST_DATE ? esc(window.LIST_DATE) + ' 收盤。' : ''}各格漲跌幅以成交值加權計算；紅色為上漲、綠色為下跌，顏色越深代表幅度越大。點選可查看該產業個股。</p>`;
}
loadStocks().then(() => { renderHeat($('#pvHeat'), 6); renderHeat($('#heatAll')); });
