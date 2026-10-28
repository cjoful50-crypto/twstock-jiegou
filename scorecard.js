/* 名單成績單：讀每日排程算好的 data/scorecard.json */
const CAT = { day: ['短線觀察', '持有約 1 週'], swing: ['波段觀察', '持有約 1 個月'], long: ['長線觀察', '持有約 3 個月'] };
const CATS = { day: '短線', swing: '波段', long: '長線' };
const pc = v => v == null ? '—' : `<span class="num ${cls(v)}">${sg(v)}%</span>`;
let filter = 'all', scope = 'top';
(async () => {
  let j;
  try { const r = await fetch('/data/scorecard.json'); if (!r.ok) throw new Error('成績單尚未產生，每個交易日收盤後更新。'); j = await r.json(); }
  catch (e) { $('#score').innerHTML = `<h2>名單成績單</h2><p class="err">${esc(e.message)}</p>`; return; }
  if (!j.hold) { $('#score').innerHTML = `<h2 id="scoreT">名單成績單</h2><p class="small muted">成績單正在依新規則重新計算，請稍後再看。</p>`; return; }
  const render = () => {
    const S = scope === 'all' && j.summaryAll ? j.summaryAll : j.summary;
    const row = (label, s, strong) => s ? `<tr${strong ? ' style="font-weight:600"' : ''}><td>${label}</td><td>${pc(s.avg)}</td><td class="num">${s.win}%</td><td>${pc(s.bench)}</td><td>${pc(s.excess)}</td><td>${pc(s.worst)}</td><td class="num">${s.n}</td></tr>` : '';
    const block = k => { const s = S[k]; if (!s || !s.all) return `<div class="pcol"><h3>${CAT[k][0]}<small>${CAT[k][1]}</small></h3><div class="empty">紀錄不足。</div></div>`;
      const good = s.periods.filter(p => p.s.excess > 0).length;
      return `<div class="pcol"><h3>${CAT[k][0]}<small>隔天開盤買進，持有 ${s.hold} 個交易日・自 ${esc((s.from || '').replace(/-/g, '/'))}</small></h3>
        <p class="track ${s.all.excess > 0 ? 'good' : 'weak'}">${s.periods.length} 個半年期間中，有 ${good} 個期間優於隨機買進。</p>
        <div class="scroll"><table><thead><tr><th>期間</th><th>平均報酬</th><th>勝率</th><th>隨機買進</th><th>超額報酬</th><th>最差一筆</th><th>筆數</th></tr></thead><tbody>
        ${s.periods.map(p => row(p.label, p.s)).join('')}${row('全部', s.all, true)}</tbody></table></div></div>`; };
    $('#score').innerHTML = `<div class="section-head"><h2 id="scoreT">各名單表現</h2><span class="small muted num">統計至 ${esc(j.through.replace(/-/g, '/'))}</span></div>
      <div class="howto">
        <div><b>計算方式</b><span>入選隔天以開盤價買進，持有到期（短線 5 日、波段 20 日、長線 60 個交易日）後以收盤價賣出，並扣除手續費與證交稅約 ${j.cost}%。勝率為扣除成本後仍獲利的比例。</span></div>
        <div><b>比較基準</b><span>「隨機買進」是同一天、同樣持有期間，買進全市場股票（日均成交值 2 億元以上）的平均報酬，同樣扣除成本。超額報酬為名單平均報酬減去隨機買進，大於 0 代表名單比隨便買好。</span></div>
        <div><b>注意事項</b><span>2026 年 10 月以前的紀錄是用目前規則回推的歷史結果，之後為每日實際產生的名單。回測期間以多頭行情為主，過去表現不代表未來結果。</span></div>
      </div>
      <div class="sort-row" style="margin-top:14px">統計範圍：${[['top', '每日前 3 名'], ['all', '每日全部（最多 10 檔）']].map(([k, l]) => `<button type="button" data-scope="${k}" aria-pressed="${scope === k}">${l}</button>`).join('')}</div>
      <div class="score-grid">${['day', 'swing', 'long'].map(block).join('')}</div>`;
    $('#score').querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; render(); });
  };
  render();
  const list = () => {
    const rows = j.picks.filter(p => filter === 'all' || p.cat === filter).slice(0, 80);
    $('#scoreList').innerHTML = `<div class="section-head"><h2 id="listT">歷史紀錄</h2><div class="sort-row" style="margin:0">${[['all', '全部'], ['day', '短線'], ['swing', '波段'], ['long', '長線']].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div></div>
      <div class="scroll"><table class="stock-table"><thead><tr><th>入選日</th><th>類別</th><th>名次</th><th>股票</th><th>入選收盤</th><th>隔天開盤</th><th>報酬（扣成本）</th></tr></thead><tbody>${rows.map(p => `<tr data-code="${esc(p.code)}"><td class="num">${esc(p.date.replace(/-/g, '/'))}</td><td>${CATS[p.cat]}</td><td class="num">${p.rank ?? '—'}</td><td class="nm"><a href="/analysis/${esc(p.code)}"><span class="num">${esc(p.code)}</span>${esc(p.name)}</a></td><td class="num">${pxd(p.close)}</td><td class="num">${p.entry != null ? pxd(p.entry) : '—'}</td><td class="num ${cls(p.ret ?? p.now)}">${p.ret != null ? sg(p.ret) + '%' : p.now != null ? `持有中 ${sg(p.now)}%` : '尚未進場'}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">顯示最近 80 筆。「持有中」為到目前為止的報酬，持有到期後才列入統計。</p>`;
    $('#scoreList').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; list(); });
  };
  list();
})();
