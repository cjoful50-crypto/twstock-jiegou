/* 首頁：搜尋、快速選股、盤中當沖觀察、盤後名單 */
attachSearch($('#searchForm'), $('#q'), $('#suggest'));
loadStocks();

(function quick() {
  const rec = Recent.get();
  const list = rec.length ? rec.slice(0, 6) : [{ code: '2330', name: '台積電' }, { code: '2317', name: '鴻海' }, { code: '2454', name: '聯發科' }, { code: '2303', name: '聯電' }];
  $('#quick').innerHTML = `<span class="lab">${rec.length ? '最近查詢' : '試試看'}</span>` + list.map(s => `<a class="chip" href="/analysis/${esc(s.code)}" style="text-decoration:none"><span class="num" style="color:var(--accent)">${esc(s.code)}</span> ${esc(s.name || '')}</a>`).join('');
})();

let intraTimer = null;
async function loadIntraday() {
  const box = $('#intraday');
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadIntraday(); });

async function loadPicks() {
  const box = $('#picks');
  box.innerHTML = `<h2 id="picksTitle">盤後篩選名單</h2><div class="loading" style="margin-top:10px"><div class="dots"><span></span><span></span><span></span></div><span class="small muted">正在從證交所整理全市場近 3 個月資料，第一次約需 30～60 秒。</span></div>`;
  try {
    const r = await fetch('/api/picks'); const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    const col = (title, sub, list, n) => `<div class="pcol"><h3>${title}<small>${sub}・符合 ${n} 檔</small></h3>${list.length ? list.map(x => `<button class="pick" type="button" data-code="${esc(x.code)}">
      <div class="top1"><span><span class="code num" style="color:var(--accent)">${esc(x.code)}</span> <span class="nm">${esc(x.name)}</span></span><span class="num ${cls(x.chg)}">${pxd(x.close)} ${sg(x.chg)}%</span></div>
      <div class="sigs">${x.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
      <div class="lv num"><span>漲停指數 <b style="color:${scoreColor(x.index)}">${x.index ?? '—'}</b></span><span>支撐 <b style="color:var(--sup)">${x.sup != null ? pxd(x.sup) : '—'}</b></span><span>壓力 <b style="color:var(--res)">${x.res != null ? pxd(x.res) : '—'}</b></span></div></button>`).join('') : '<div class="empty">今天沒有股票符合條件。</div>'}</div>`;
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 id="picksTitle">盤後篩選名單</h2><span class="small muted num">${esc(j.date)} 收盤・掃描 ${j.universe} 檔上市股票</span></div>
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
  } catch (e) {
    box.innerHTML = `<h2 id="picksTitle">盤後篩選名單</h2><p class="err">${esc(e.message)}</p><button class="btn ghost" type="button" id="retryPicks">再試一次</button>`;
    $('#retryPicks').onclick = loadPicks;
  }
}

loadIntraday();
loadPicks();
