/* 歷史成績：盤後名單頁的第二個分頁，讀取每日排程計算的 data/scorecard.json */
const CAT = { day: ['短線', '持有 5 個交易日'], swing: ['波段', '持有 20 個交易日'], long: ['長線', '持有 60 個交易日'] };
const pc = v => v == null ? '—' : `<span class="num ${cls(v)}">${sg(v)}%</span>`;
let scTab = 'day', hf = 'all', hr = 'all', hn = 20, scData = null;
// 歷史紀錄排序：預設最新在前，選擇會記在這台裝置
let hs = (() => { try { return localStorage.getItem('jiegou-hsort') || 'new'; } catch (e) { return 'new'; } })();

/* 分頁切換：今日名單／歷史成績，網址加上 #score 時直接開啟歷史成績 */
function showPage(tab) {
  const score = tab === 'score';
  document.querySelectorAll('[data-page-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pageTab === tab));
  ['#picks'].forEach(s => { const el = $(s); if (el) el.hidden = score; });
  ['#score', '#scoreList', '#scoreStat'].forEach(s => { const el = $(s); if (el) el.hidden = !score; });
  if (score) loadScore();
  if (history.replaceState) history.replaceState(null, '', score ? '#score' : location.pathname);
}
document.querySelectorAll('[data-page-tab]').forEach(b => b.onclick = () => { showPage(b.dataset.pageTab); window.scrollTo(0, 0); });
window.addEventListener('hashchange', () => showPage(location.hash === '#score' ? 'score' : 'list'));

async function loadScore() {
  if (scData) return;
  const box = $('#score');
  try { const r = await fetch('/data/scorecard.json'); if (!r.ok) throw new Error('歷史成績尚未產生，每個交易日收盤後更新。'); scData = await r.json(); }
  catch (e) { box.innerHTML = `<h2 id="scoreT">歷史成績</h2><p class="err">${esc(e.message)}</p>`; return; }
  renderScore(); renderHist(); renderStat();
  // 完整歷史紀錄較大，另外載入；載入前先用 scorecard.json 內最近的紀錄
  try { const r = await fetch('/data/scorehist.json'); if (r.ok) { const h = await r.json(); if (h.picks && h.picks.length) { scData.picks = h.picks; renderHist(); } } } catch (e) {}
}

function renderScore() {
  const j = scData, S = j.summary, R = j.regime || {};
  const col = k => { const s = S[k], a = s && s.all; if (!a) return `<div class="pcol" data-pcat="${k}"><h3><span>${CAT[k][0]}</span></h3><div class="empty">紀錄不足。</div></div>`;
    const ok = a.n >= 30 && a.excess > 0, good = s.periods.filter(p => p.s.excess > 0).length, r = R[k] || {};
    const reg = (lab, v) => v ? `<tr><td>${lab}<span class="th-sub">${fi(v.n)} 筆</span></td><td class="r">${pc(v.avg)}</td><td class="r">${pc(v.excess)}</td><td class="r num">${v.win}%</td></tr>` : '';
    return `<div class="pcol" data-pcat="${k}"><h3><span>${CAT[k][0]} <span class="tg ${ok ? 'good' : 'weak'}">${a.n < 30 ? '樣本不足' : ok ? '優於大盤' : '未優於大盤'}</span></span><small>${CAT[k][1]}</small></h3>
      <div class="sc-main"><div><span class="lab">平均報酬</span><b>${pc(a.avg)}</b></div><div><span class="lab">同期全市場</span><b>${pc(a.bench)}</b></div><div><span class="lab">勝率</span><b class="num">${a.win}%</b></div></div>
      <p class="small muted" style="margin:0">共 ${fi(a.n)} 筆，${s.periods.length} 個半年期間中有 ${good} 個優於全市場。</p>
      <div class="scroll"><table class="follow-t"><thead><tr><th>入選時大盤</th><th class="r">平均</th><th class="r">相對全市場</th><th class="r">勝率</th></tr></thead><tbody>${reg('季線之上', r.up)}${reg('季線之下', r.down)}</tbody></table></div>
      <details class="sc-more"><summary>各期間明細 <span class="more">展開</span></summary><div class="scroll"><table class="follow-t"><thead><tr><th>期間</th><th class="r">平均</th><th class="r">相對全市場</th><th class="r hide-sm">勝率</th><th class="r hide-sm">最差一筆</th></tr></thead><tbody>${s.periods.map(p => `<tr><td>${esc(p.label)}</td><td class="r">${pc(p.s.avg)}</td><td class="r">${pc(p.s.excess)}</td><td class="r num hide-sm">${p.s.win}%</td><td class="r hide-sm">${pc(p.s.worst)}</td></tr>`).join('')}</tbody></table></div></details></div>`; };
  $('#score').innerHTML = `<div class="section-head"><h2 id="scoreT">各名單表現</h2><span class="small muted num">統計至 ${esc(j.through.replace(/-/g, '/'))}</span></div>
    <p class="small muted" style="margin:6px 0 0">每日前 3 名，入選次一交易日以開盤價買進，持有期滿以收盤價賣出，報酬已扣除交易成本約 ${j.cost}%。</p>
    <div class="ptabs" role="tablist">${Object.entries(CAT).map(([k, v]) => `<button type="button" data-sctab="${k}" aria-pressed="${k === scTab}">${v[0]}</button>`).join('')}</div>
    <div class="picks-grid" data-tab="${scTab}">${['day', 'swing', 'long'].map(col).join('')}</div>
    <details class="howto-d"><summary>計算方式</summary><div class="howto">
      <div><b>報酬計算</b><span>入選次一交易日以開盤價買進，持有期滿（短線 5 日、波段 20 日、長線 60 個交易日）以收盤價賣出，扣除手續費與證交稅約 ${j.cost}%。勝率為扣除成本後獲利的比例。</span></div>
      <div><b>比較基準</b><span>「同期全市場」為同一天買進全市場股票（日均成交值 2 億元以上）、持有相同天數的平均報酬，同樣扣除成本。「相對全市場」為名單平均報酬減去全市場平均，大於 0 代表名單表現較佳。</span></div>
      <div><b>資料說明</b><span>2026 年 10 月以前為依目前規則回推的回測結果，2026 年 11 月起為每日實際發布的名單。價格已還原除權息，包含現金股利與配股。過去表現不代表未來結果。</span></div>
    </div></details>`;
  $('#score').querySelectorAll('[data-sctab]').forEach(b => b.onclick = () => { scTab = b.dataset.sctab; renderScore(); });
}

// 2026/11 起為每日實際發布的名單，之前為依目前規則回推的回測結果
const LIVE_FROM = '2026-11-01';
const PER = [[1, '近 1 個月'], [3, '近 3 個月'], [6, '近 6 個月'], [0, '全部']];
let hp = 3, hk = 'top', openM = new Set(), fullM = new Set();
function renderHist() {
  const j = scData, F = { all: '全部', day: '短線', swing: '波段', long: '長線' };
  const latest = j.picks.reduce((m, p) => p.date > m ? p.date : m, '');
  const cut = hp ? (() => { const d = new Date(latest.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - hp + 1); return d.toISOString().slice(0, 7); })() : '';
  const rows = j.picks.filter(p => p.entry != null && (hf === 'all' || p.cat === hf) && (hk === 'all' || p.rank <= 3) && p.date.slice(0, 7) >= cut);
  // 依月份彙總：已持有期滿的紀錄列入統計，未滿的另計「持有中」
  const by = new Map(); rows.forEach(p => { const m = p.date.slice(0, 7); if (!by.has(m)) by.set(m, []); by.get(m).push(p); });
  let months = [...by.keys()].sort(); if (hs === 'new') months.reverse();
  const sum = list => { const d = list.filter(p => p.ret != null), b = d.filter(p => p.bench != null), on = list.filter(p => p.ret == null && p.now != null);
    const avg = d.length ? d.reduce((a, p) => a + p.ret, 0) / d.length : null, bAvg = b.length ? b.reduce((a, p) => a + p.bench, 0) / b.length : null;
    const days = new Set(list.map(p => p.date)), weak = new Set(list.filter(p => p.weak).map(p => p.date));
    return { n: d.length, on: on.length, onAvg: on.length ? on.reduce((a, p) => a + p.now, 0) / on.length : null, avg, ex: avg != null && bAvg != null ? avg - bAvg : null, win: d.length ? Math.round(d.filter(p => p.ret > 0).length / d.length * 100) : null, weak: weak.size, days: days.size }; };
  const mkt = s => s.weak === 0 ? '<span class="small muted">季線之上</span>' : s.weak === s.days ? '<span class="fs bad">季線之下</span>' : `<span class="fs wait">季線下 ${s.weak} 日</span>`;
  const st = p => p.ret != null ? pc(p.ret) : `${pc(p.now)}<span class="th-sub">持有中 ${p.held}/${j.hold[p.cat]} 日</span>`;
  const trades = list => `<div class="scroll"><table class="follow-t"><thead><tr><th>股票</th><th class="r">入選日</th><th class="r hide-sm">進場價</th><th class="r">報酬<span class="th-sub">扣除成本</span></th><th class="hide-sm">狀態</th></tr></thead><tbody>${list.map(p => `<tr><td class="nm"><a href="/analysis/${esc(p.code)}"><span class="num">${esc(p.code)}</span> ${esc(p.name)}</a></td><td class="r num">${esc(p.date.slice(5).replace('-', '/'))}<span class="th-sub">${CAT[p.cat][0]}第 ${p.rank} 名</span></td><td class="r num hide-sm">${pxd(p.entry)}</td><td class="r">${st(p)}${p.broke ? '<span class="th-sub show-sm" style="color:var(--warn)">跌破支撐</span>' : ''}</td><td class="hide-sm">${p.broke ? '<span class="fs bad">跌破</span>' : '<span class="fs ok">守住</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  const live = rows.filter(p => p.date >= LIVE_FROM), back = rows.filter(p => p.date < LIVE_FROM), sl = sum(live), sb = sum(back);
  const line = (lab, s) => s.n || s.on ? `<tr><td>${lab}</td><td class="r">${s.n ? pc(s.avg) : s.on ? `${pc(s.onAvg)}<span class="th-sub">持有中</span>` : '—'}</td><td class="r">${pc(s.ex)}</td><td class="r num hide-sm">${s.win != null ? s.win + '%' : '—'}</td><td class="r num hide-sm">${fi(s.n)}${s.on ? `<span class="th-sub">持有中 ${s.on}</span>` : ''}</td></tr>` : '';
  $('#scoreList').innerHTML = `<div class="section-head"><h2 id="listT">歷史紀錄</h2></div>
    <div class="sort-row">期間：${PER.map(([k, l]) => `<button type="button" data-hp="${k}" aria-pressed="${hp === +k}">${l}</button>`).join('')}</div>
    <div class="sort-row" style="margin-top:6px">類別：${Object.entries(F).map(([k, l]) => `<button type="button" data-hf="${k}" aria-pressed="${hf === k}">${l}</button>`).join('')}</div>
    <div class="sort-row" style="margin-top:6px">名次：${[['top', '前 3 名'], ['all', '全部名次']].map(([k, l]) => `<button type="button" data-hk="${k}" aria-pressed="${hk === k}">${l}</button>`).join('')}　排序：${[['new', '最新在前'], ['old', '最早在前']].map(([k, l]) => `<button type="button" data-hs="${k}" aria-pressed="${hs === k}">${l}</button>`).join('')}</div>
    ${rows.length ? `<div class="scroll" style="margin-top:10px"><table class="follow-t"><thead><tr><th>資料類型</th><th class="r">平均報酬</th><th class="r">相對全市場</th><th class="r hide-sm">勝率</th><th class="r hide-sm">已結算筆數</th></tr></thead><tbody>${line('實際發布<span class="th-sub">' + LIVE_FROM.slice(0, 7).replace('-', '/') + ' 起</span>', sl) || `<tr><td>實際發布<span class="th-sub">${LIVE_FROM.slice(0, 7).replace('-', '/')} 起</span></td><td colspan="4" class="small muted" style="white-space:normal">紀錄累積中，持有期滿後列入統計。</td></tr>`}${line('回測<span class="th-sub">依目前規則回推</span>', sb)}</tbody></table></div>
    <div class="mlist"><div class="mhead"><span>月份</span><span class="r">平均報酬</span><span class="r">相對全市場</span><span class="r hide-sm">勝率</span><span>大盤</span></div>
    ${months.map(m => { const list = by.get(m).slice().sort((a, b) => (hs === 'new' ? -1 : 1) * (a.date > b.date ? 1 : a.date < b.date ? -1 : 0) || a.rank - b.rank), s = sum(list); return `<details class="mrow" data-m="${m}"${openM.has(m) ? ' open' : ''}><summary><span><b class="num">${m.replace('-', '/')}</b><span class="th-sub"${m + '-01' >= LIVE_FROM ? ' style="color:var(--sup)"' : ''}>${m + '-01' >= LIVE_FROM ? '實際' : '回測'}・${fi(list.length)} 筆${s.on ? `，持有中 ${s.on}` : ''}</span></span><span class="r">${s.n ? pc(s.avg) : s.on ? `${pc(s.onAvg)}<span class="th-sub">持有中</span>` : '—'}</span><span class="r">${pc(s.ex)}</span><span class="r num hide-sm">${s.win != null ? s.win + '%' : '—'}</span><span>${mkt(s)}</span></summary>${trades(fullM.has(m) ? list : list.slice(0, 30))}${list.length > 30 && !fullM.has(m) ? `<button class="btn ghost" type="button" data-full="${m}" style="width:100%;margin-bottom:10px">顯示當月全部 ${fi(list.length)} 筆</button>` : ''}</details>`; }).join('')}</div>` : '<div class="empty">此期間沒有紀錄。</div>'}
    <p class="note" style="margin:8px 0 0">點選月份可查看當月入選股票。平均報酬、相對全市場與勝率以持有期滿的紀錄計算；尚未期滿者標示「持有中」，報酬為截至最新收盤。「回測」為依目前規則回推的結果，「實際」為每日實際發布的名單。「跌破」為持有期間曾以收盤價跌破入選時的支撐價位。</p>`;
  const box = $('#scoreList');
  box.querySelectorAll('[data-hf]').forEach(b => b.onclick = () => { hf = b.dataset.hf; renderHist(); });
  box.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => { hp = +b.dataset.hp; renderHist(); });
  box.querySelectorAll('[data-hk]').forEach(b => b.onclick = () => { hk = b.dataset.hk; renderHist(); });
  box.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { hs = b.dataset.hs; try { localStorage.setItem('jiegou-hsort', hs); } catch (e) {} renderHist(); });
  box.querySelectorAll('[data-full]').forEach(b => b.onclick = () => { fullM.add(b.dataset.full); openM.add(b.dataset.full); renderHist(); });
  box.querySelectorAll('.mrow').forEach(d => d.ontoggle = () => { d.open ? openM.add(d.dataset.m) : openM.delete(d.dataset.m); });
}

/* 強度分數與後續表現：預設收合 */
async function renderStat() {
  const box = $('#scoreStat'); if (!box) return;
  let j = null; try { const r = await fetch('/data/scorestat.json'); if (r.ok) j = await r.json(); } catch (e) {}
  if (!j) { box.remove(); return; }
  box.innerHTML = `<details><summary><h2 id="statT" style="display:inline">強度分數與後續表現</h2> <span class="more">展開</span></summary>
    <p class="small muted" style="margin:8px 0 0">統計期間 ${esc(j.from.replace(/-/g, '/'))}～${esc(j.to.replace(/-/g, '/'))}。日均成交值 2 億元以上的股票每 5 個交易日計算一次強度分數，次一交易日以開盤價買進、持有 ${j.hold} 個交易日，與同日全市場平均比較（共 ${fi(j.n)} 筆，價格已還原除權息）。</p>
    <div class="scroll"><table class="follow-t"><thead><tr><th>強度分數</th><th class="r">相對全市場</th><th class="r">優於全市場比例</th><th class="r">筆數</th></tr></thead><tbody>
    ${j.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r">${pc(r.excess)}</td><td class="r num">${r.beat}%</td><td class="r num">${fi(r.n)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin:8px 0 0">強度分數用於描述個股目前的技術與籌碼條件，並非漲跌預測。歷史資料顯示，35 分以下的股票其後 20 日平均落後全市場，55～74 分略為領先，75 分以上未見較佳表現。整體而言，分數與後續漲跌的關聯性有限，建議搭配支撐壓力與篩選名單參考。各組優於全市場的比例皆低於五成，原因是全市場平均受少數大漲個股拉高。</p></details>`;
}

showPage(location.hash === '#score' ? 'score' : 'list');
