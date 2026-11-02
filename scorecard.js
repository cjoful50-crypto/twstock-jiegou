/* 歷史成績：盤後名單頁的第二個分頁，讀取每日排程計算的 data/scorecard.json */
const CAT = { day: ['短線', '持有 5 個交易日'], swing: ['波段', '持有 20 個交易日'], long: ['長線', '持有 60 個交易日'] };
const pc = v => v == null ? '—' : `<span class="num ${cls(v)}">${sg(v)}%</span>`;
let scTab = 'day', hf = 'all', hr = 'all', hn = 20, scData = null;
// 歷史紀錄排序：預設最早在前，選擇會記在這台裝置
let hs = (() => { try { return localStorage.getItem('jiegou-hsort') || 'old'; } catch (e) { return 'old'; } })();

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
      <div><b>資料說明</b><span>2026 年 10 月以前為依目前規則回推的歷史結果，之後為每日實際產生的名單。價格已還原除權息，包含現金股利與配股。過去表現不代表未來結果。</span></div>
    </div></details>`;
  $('#score').querySelectorAll('[data-sctab]').forEach(b => b.onclick = () => { scTab = b.dataset.sctab; renderScore(); });
}

function renderHist() {
  const j = scData, F = { all: '全部', day: '短線', swing: '波段', long: '長線' }, RF = { all: '全部', win: '獲利', loss: '虧損', broke: '跌破支撐' };
  const val = p => p.ret ?? p.now;
  const all = j.picks.filter(p => p.entry != null && (hf === 'all' || p.cat === hf) && (hr === 'all' || (hr === 'win' ? val(p) > 0 : hr === 'loss' ? val(p) < 0 : !!p.broke)));
  if (hs === 'old') all.reverse();
  const rows = all.slice(0, hn);
  const st = p => p.ret != null ? pc(p.ret) : p.now != null ? `${pc(p.now)}<span class="th-sub">持有中 ${p.held}/${j.hold[p.cat]} 日</span>` : '<span class="small muted">不列入統計</span>';
  $('#scoreList').innerHTML = `<div class="section-head"><h2 id="listT">歷史紀錄</h2></div>
    <div class="sort-row">${Object.entries(F).map(([k, l]) => `<button type="button" data-hf="${k}" aria-pressed="${hf === k}">${l}</button>`).join('')}</div>
    <div class="sort-row" style="margin-top:6px">${Object.entries(RF).map(([k, l]) => `<button type="button" data-hr="${k}" aria-pressed="${hr === k}">${l}</button>`).join('')}</div>
    <div class="sort-row" style="margin-top:6px">排序：${[['old', '最早在前'], ['new', '最新在前']].map(([k, l]) => `<button type="button" data-hs="${k}" aria-pressed="${hs === k}">${l}</button>`).join('')}</div>
    ${rows.length ? `<div class="scroll"><table class="follow-t"><thead><tr><th>股票</th><th class="r">入選日</th><th class="r hide-sm">進場價</th><th class="r">報酬<span class="th-sub">扣除成本</span></th><th class="hide-sm">狀態</th></tr></thead><tbody>${rows.map(p => `<tr><td class="nm"><a href="/analysis/${esc(p.code)}"><span class="num">${esc(p.code)}</span> ${esc(p.name)}</a></td><td class="r num">${esc(p.date.replace(/-/g, '/'))}<span class="th-sub">${CAT[p.cat][0]}第 ${p.rank} 名</span></td><td class="r num hide-sm">${p.entry != null ? pxd(p.entry) : '—'}</td><td class="r">${st(p)}${p.broke ? '<span class="th-sub show-sm" style="color:var(--warn)">跌破支撐</span>' : ''}</td><td class="hide-sm">${p.broke ? '<span class="fs bad">跌破</span>' : p.entry != null ? '<span class="fs ok">守住</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">沒有符合條件的紀錄。</div>'}
    ${all.length > hn ? `<button class="btn ghost" type="button" id="histMore" style="margin-top:10px;width:100%">顯示更多（共 ${fi(all.length)} 筆）</button>` : ''}
    <p class="note" style="margin:8px 0 0">最新一日入選的股票自次一交易日起列入。「持有中」為截至最新收盤的報酬，持有期滿後列入統計。「跌破」為持有期間曾以收盤價跌破入選時的支撐價位。</p>`;
  const box = $('#scoreList');
  box.querySelectorAll('[data-hf]').forEach(b => b.onclick = () => { hf = b.dataset.hf; hn = 20; renderHist(); });
  box.querySelectorAll('[data-hr]').forEach(b => b.onclick = () => { hr = b.dataset.hr; hn = 20; renderHist(); });
  box.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { hs = b.dataset.hs; hn = 20; try { localStorage.setItem('jiegou-hsort', hs); } catch (e) {} renderHist(); });
  const m = $('#histMore'); if (m) m.onclick = () => { hn += 20; renderHist(); };
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
