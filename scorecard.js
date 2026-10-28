/* 名單成績單：讀每日排程算好的 data/scorecard.json */
const CAT = { day: ['隔日當沖觀察', '隔天開盤後當天進出'], swing: ['短期觀察', '持有約 1～2 週'], long: ['長期觀察', '持有數月以上'] };
const pct = s => s == null ? '—' : `<span class="num ${cls(s.avg)}">${sg(s.avg)}%</span>`;
const win = s => s == null ? '—' : `<span class="num">${s.win}%</span>`;
let filter = 'all', scope = 'top';
(async () => {
  let j;
  try { const r = await fetch('/data/scorecard.json'); if (!r.ok) throw new Error('成績單尚未產生，每個交易日收盤後更新。'); j = await r.json(); }
  catch (e) { $('#score').innerHTML = `<h2>名單成績單</h2><p class="err">${esc(e.message)}</p>`; return; }
  const render = () => {
  const S = scope === 'all' && j.summaryAll ? j.summaryAll : j.summary;
  const block = k => { const s = S[k]; if (!s || !s.picks) return `<div class="pcol"><h3>${CAT[k][0]}<small>${CAT[k][1]}</small></h3><div class="empty">紀錄不足。</div></div>`;
    const rows = j.horizons.map(h => { const r = s['r' + h], m = s['m' + h]; const ex = r && m ? r.avg - m.avg : null;
      return `<tr><td>${h === 1 ? '1 個交易日後' : `${h} 個交易日後`}</td><td>${pct(r)}</td><td>${win(r)}</td><td>${pct(m)}</td><td class="num ${cls(ex)}">${ex == null ? '—' : sg(ex) + '%'}</td><td class="num">${r ? r.n : 0}</td></tr>`; }).join('');
    const dayRows = k === 'day' ? `<tr><td>隔日開盤買、收盤賣</td><td>${pct(s.oc)}</td><td>${win(s.oc)}</td><td>—</td><td>—</td><td class="num">${s.oc ? s.oc.n : 0}</td></tr><tr><td>隔日開盤到最高點</td><td>${pct(s.oh)}</td><td>—</td><td>—</td><td>—</td><td class="num">${s.oh ? s.oh.n : 0}</td></tr>` : '';
    return `<div class="pcol"><h3>${CAT[k][0]}<small>${CAT[k][1]}・${s.picks} 檔次，自 ${esc((s.from || '').replace(/-/g, '/'))}</small></h3>
      <div class="scroll"><table><thead><tr><th>持有期間</th><th>平均報酬</th><th>勝率</th><th>同期大盤</th><th>超額報酬</th><th>筆數</th></tr></thead><tbody>${dayRows}${rows}</tbody></table></div></div>`; };
  $('#score').innerHTML = `<div class="section-head"><h2 id="scoreT">各名單表現</h2><span class="small muted num">統計至 ${esc(j.through.replace(/-/g, '/'))}</span></div>
    <div class="howto">
      <div><b>如何解讀</b><span>以入選當日收盤價為基準，計算第 1、5、10、20 個交易日後的漲跌；隔日當沖另計「隔日開盤買進、收盤賣出」的報酬。勝率為上漲筆數的比例，超額報酬為平均報酬減去同期加權指數漲跌。</span></div>
      <div><b>評估方式</b><span>平均報酬與勝率持續優於大盤，且樣本數足夠（建議 30 筆以上），名單才具參考價值；樣本數少時，個別股票的大漲大跌容易造成偏差。</span></div>
      <div><b>注意事項</b><span>統計未扣除手續費與證交稅（當沖一買一賣約 0.3%～0.4%，一般交易約 0.6%）。長期名單自有月營收資料的日期起計算。過去表現不代表未來結果。</span></div>
    </div>
    <div class="sort-row" style="margin-top:14px">統計範圍：${[['top', '每日前 3 名'], ['all', '每日全部（最多 10 檔）']].map(([k, l]) => `<button type="button" data-scope="${k}" aria-pressed="${scope === k}">${l}</button>`).join('')}</div>
    <div class="score-grid">${['day', 'swing', 'long'].map(block).join('')}</div>`;
  $('#score').querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; render(); });
  };
  render();
  const list = () => {
    const rows = j.picks.filter(p => filter === 'all' || p.cat === filter).slice(0, 80);
    $('#scoreList').innerHTML = `<div class="section-head"><h2 id="listT">歷史紀錄</h2><div class="sort-row" style="margin:0">${[['all', '全部'], ['day', '隔日當沖'], ['swing', '短期'], ['long', '長期']].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div></div>
      <div class="scroll"><table class="stock-table"><thead><tr><th>入選日</th><th>類別</th><th>名次</th><th>股票</th><th>入選收盤</th><th>1 日</th><th>5 日</th><th>10 日</th><th>20 日</th></tr></thead><tbody>${rows.map(p => `<tr data-code="${esc(p.code)}"><td class="num">${esc(p.date.replace(/-/g, '/'))}</td><td>${{ day: '隔日當沖', swing: '短期', long: '長期' }[p.cat]}</td><td class="num">${p.rank ?? '—'}</td><td class="nm"><a href="/analysis/${esc(p.code)}"><span class="num">${esc(p.code)}</span>${esc(p.name)}</a></td><td class="num">${pxd(p.close)}</td>${['r1', 'r5', 'r10', 'r20'].map(k => `<td class="num ${cls(p[k])}">${p[k] == null ? '尚未到期' : sg(p[k]) + '%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="note">顯示最近 80 筆。「尚未到期」表示入選後尚未經過該天數。</p>`;
    $('#scoreList').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; list(); });
  };
  list();
})();
