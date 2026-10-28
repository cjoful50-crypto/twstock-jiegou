/* 名單成績單：讀每日排程算好的 data/scorecard.json */
const CAT = { day: ['當沖觀察', '當天買賣'], swing: ['短期觀察', '持有數天到數週'], long: ['長期觀察', '持有數月以上'] };
const pct = s => s == null ? '—' : `<span class="num ${cls(s.avg)}">${sg(s.avg)}%</span>`;
const win = s => s == null ? '—' : `<span class="num">${s.win}%</span>`;
let filter = 'all';
(async () => {
  let j;
  try { const r = await fetch('/data/scorecard.json'); if (!r.ok) throw new Error('成績單還沒產生，每個交易日收盤後會自動更新。'); j = await r.json(); }
  catch (e) { $('#score').innerHTML = `<h2>名單成績單</h2><p class="err">${esc(e.message)}</p>`; return; }
  const S = j.summary;
  const block = k => { const s = S[k]; if (!s || !s.picks) return `<div class="pcol"><h3>${CAT[k][0]}<small>${CAT[k][1]}</small></h3><div class="empty">還沒有足夠的紀錄。</div></div>`;
    const rows = j.horizons.map(h => { const r = s['r' + h], m = s['m' + h]; const ex = r && m ? r.avg - m.avg : null;
      return `<tr><td>${h === 1 ? '隔 1 個交易日' : `${h} 個交易日後`}</td><td>${pct(r)}</td><td>${win(r)}</td><td>${pct(m)}</td><td class="num ${cls(ex)}">${ex == null ? '—' : sg(ex) + '%'}</td><td class="num">${r ? r.n : 0}</td></tr>`; }).join('');
    const dayRows = k === 'day' ? `<tr><td>隔日開盤買、收盤賣</td><td>${pct(s.oc)}</td><td>${win(s.oc)}</td><td>—</td><td>—</td><td class="num">${s.oc ? s.oc.n : 0}</td></tr><tr><td>隔日開盤到最高點</td><td>${pct(s.oh)}</td><td>—</td><td>—</td><td>—</td><td class="num">${s.oh ? s.oh.n : 0}</td></tr>` : '';
    return `<div class="pcol"><h3>${CAT[k][0]}<small>${CAT[k][1]}・${s.picks} 檔次，自 ${esc((s.from || '').replace(/-/g, '/'))}</small></h3>
      <div class="scroll"><table><thead><tr><th>持有期間</th><th>平均報酬</th><th>勝率</th><th>同期大盤</th><th>贏大盤</th><th>筆數</th></tr></thead><tbody>${dayRows}${rows}</tbody></table></div></div>`; };
  $('#score').innerHTML = `<div class="section-head"><h2 id="scoreT">各名單表現</h2><span class="small muted num">統計至 ${esc(j.through.replace(/-/g, '/'))}</span></div>
    <div class="howto">
      <div><b>怎麼看</b><span>以入選當天的收盤價為基準，看之後第 1、5、20 個交易日的漲跌。「勝率」是上漲的比例，「贏大盤」是平均報酬減掉同期加權指數的漲跌。</span></div>
      <div><b>怎麼判斷有沒有用</b><span>平均報酬和勝率都穩定比大盤好，而且筆數夠多（建議 30 筆以上），名單才有參考價值。筆數少時，一兩檔大漲大跌就會讓數字失真。</span></div>
      <div><b>要注意</b><span>沒有扣手續費與交易稅；歷史回補的長期名單只從有月營收資料的日期開始。過去的表現不代表未來，這份成績單是用來調整規則，不是保證獲利。</span></div>
    </div>
    <div class="score-grid">${['day', 'swing', 'long'].map(block).join('')}</div>`;
  const list = () => {
    const rows = j.picks.filter(p => filter === 'all' || p.cat === filter).slice(0, 80);
    $('#scoreList').innerHTML = `<div class="section-head"><h2 id="listT">每一筆紀錄</h2><div class="sort-row" style="margin:0">${[['all', '全部'], ['day', '當沖'], ['swing', '短期'], ['long', '長期']].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div></div>
      <div class="scroll"><table class="stock-table"><thead><tr><th>入選日</th><th>類別</th><th>股票</th><th>入選收盤</th><th>1 日</th><th>5 日</th><th>20 日</th></tr></thead><tbody>${rows.map(p => `<tr data-code="${esc(p.code)}"><td class="num">${esc(p.date.replace(/-/g, '/'))}</td><td>${CAT[p.cat][0].slice(0, 2)}</td><td class="nm"><a href="/analysis/${esc(p.code)}"><span class="num">${esc(p.code)}</span>${esc(p.name)}</a></td><td class="num">${pxd(p.close)}</td>${['r1', 'r5', 'r20'].map(k => `<td class="num ${cls(p[k])}">${p[k] == null ? '尚未到期' : sg(p[k]) + '%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="note">顯示最近 80 筆。「尚未到期」代表入選後還沒經過那麼多個交易日。</p>`;
    $('#scoreList').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; list(); });
  };
  list();
})();
