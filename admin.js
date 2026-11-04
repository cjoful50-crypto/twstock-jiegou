/* 網站後台：流量（Vercel Web Analytics）、會員統計、資料更新狀態 */
(async () => {
  const box = $('#admin'), tok = Store.read('jiegou-token', null);
  if (!tok) { box.innerHTML = `<section class="card"><p>請先以管理員帳號登入（右上角「登入」）。</p></section>`; document.addEventListener('jiegou-data', () => location.reload(), { once: true }); return; }
  let j; try { const r = await fetch('/api/member?admin=1', { headers: { Authorization: 'Bearer ' + tok } }); j = await r.json(); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); }
  catch (e) { box.innerHTML = `<section class="card"><p class="err">${esc(e.message)}</p></section>`; return; }
  await loadStocks(); const nameOf = c => { const s = (STOCKS || []).find(x => x[0] === c); return s ? s[1] : ''; };
  const T = j.traffic || {}, M = j.members || {}, dt = s => s ? new Date(s).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }).replace(/:\d\d$/, '') : '—';
  const kpi = (lab, v, sub) => `<div class="kpi"><span>${lab}</span><b class="num">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const pathLabel = p => { const m = String(p).match(/^\/analysis\/(\w+)/); if (m) return `個股：${m[1]} ${esc(nameOf(m[1]))}`; return ({ '/': '首頁', '/picks': '盤後名單', '/watch': '選股與庫存', '/sectors': '產業分類', '/intraday': '盤中強勢股', '/guide': '使用說明', '/admin': '網站後台' })[p] || esc(p); };
  const bars = rows => { if (!rows || !rows.length) return '<p class="small muted">尚無資料。</p>'; const mx = Math.max(...rows.map(r => r.visitors || 0), 1), W = window.innerWidth < 640 ? 400 : 1000, H = window.innerWidth < 640 ? 120 : 150, bw = W / rows.length;
    return `<svg viewBox="0 0 ${W} ${H + 18}" class="mc">${rows.map((r, i) => { const h = (r.visitors || 0) / mx * H; return `<rect class="adm-bar" x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(String(r.timestamp).slice(5, 10))}：訪客 ${r.visitors}、瀏覽 ${r.pageviews}</title></rect>`; }).join('')}
      <text class="mc-t" x="0" y="${H + 14}">${esc(String(rows[0].timestamp).slice(5, 10).replace('-', '/'))}</text><text class="mc-t" x="${W}" y="${H + 14}" text-anchor="end">${esc(String(rows.at(-1).timestamp).slice(5, 10).replace('-', '/'))}</text></svg>`; };
  const table = (rows, key, lab) => rows && rows.length ? `<table class="follow-t"><thead><tr><th>${lab}</th><th class="r">訪客</th><th class="r">瀏覽</th></tr></thead><tbody>${rows.map(r => `<tr><td>${key(r)}</td><td class="r num">${fi(r.visitors)}</td><td class="r num">${fi(r.pageviews)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">尚無資料。</p>';
  const dev = { desktop: '電腦', mobile: '手機', tablet: '平板' };
  const traffic = T.missing ? `<p>尚未設定 Vercel 存取金鑰（環境變數 <code>VERCEL_TOKEN</code>），設定後即可顯示流量。</p>`
    : T.error ? `<p class="err">流量資料暫時無法取得：${esc(T.error)}</p>`
    : `<div class="kpis">${kpi('今日訪客', fi(T.today && T.today.visitors), `瀏覽 ${fi(T.today && T.today.pageviews)} 次`)}${kpi('近 7 日訪客', fi(T.week && T.week.visitors), `瀏覽 ${fi(T.week && T.week.pageviews)} 次`)}${kpi('近 30 日訪客', fi(T.month && T.month.visitors), `瀏覽 ${fi(T.month && T.month.pageviews)} 次`)}</div>
      <h3 class="adm-h">近 30 日每日訪客</h3>${bars(T.daily)}
      <div class="adm-grid"><div><h3 class="adm-h">熱門頁面（近 7 日）</h3>${table(T.pages, r => pathLabel(r.requestPath), '頁面')}</div>
      <div><h3 class="adm-h">裝置（近 30 日）</h3>${table(T.dev, r => dev[r.deviceType] || esc(r.deviceType), '裝置')}<h3 class="adm-h">來源網站（近 30 日）</h3>${table((T.ref || []).filter(r => r.referrerHostname), r => esc(r.referrerHostname), '來源')}</div></div>
      <p class="note">資料來源為 Vercel Web Analytics，自 2026/11/04 開始統計，免費方案保留最近 30 日。訪客以裝置計算，不使用 cookie。</p>`;
  box.innerHTML = `<section class="card"><h2>流量</h2>${traffic}</section>
    <section class="card"><h2>會員</h2>${M.error ? `<p class="err">${esc(M.error)}</p>` : `<div class="kpis">${kpi('註冊會員', fi(M.total))}${kpi('近 7 日有同步', fi(M.active7), '登入後有更新選股或庫存')}${kpi('近 30 日有同步', fi(M.active30))}</div><p class="note">最近一次同步：${dt(M.lastSync)}。僅統計人數，不讀取會員的選股與庫存內容。</p>`}</section>
    <section class="card"><h2>資料更新狀態</h2><div id="admData" class="small muted">檢查中…</div></section>`;
  // 資料更新狀態：各資料檔的日期＋最近幾次自動更新
  const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const [L, MK, CH, IN, TD, SC, RUN] = await Promise.all(['/data/latest.json', '/data/market.json', '/data/chip.json', '/data/ind.json', '/data/tdcc/summary.json', '/data/scorecard.json'].map(get).concat([get('https://api.github.com/repos/cjoful50-crypto/twstock-jiegou/actions/workflows/daily.yml/runs?per_page=6')]));
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), norm = d => String(d || '').replace(/\//g, '-');
  const row = (lab, d, note) => { const ok = norm(d) === today; return `<tr><td>${lab}</td><td class="r num">${d ? esc(norm(d).replace(/-/g, '/')) : '—'}</td><td>${ok ? '<span class="fs ok">今日已更新</span>' : `<span class="fs wait">${esc(note || '非今日')}</span>`}</td></tr>`; };
  const ST = { success: '<span class="fs ok">成功</span>', failure: '<span class="fs bad">失敗</span>', cancelled: '<span class="fs wait">取消</span>', skipped: '<span class="fs wait">略過</span>' };
  $('#admData').outerHTML = `<table class="follow-t"><thead><tr><th>資料</th><th class="r">資料日期</th><th>狀態</th></tr></thead><tbody>
    ${row('盤後名單', L && L.date)}${row('法人買賣超', L && L.instDate)}${row('大盤狀態', MK && MK.date)}${row('籌碼動向', CH && CH.date)}${row('技術指標', IN && IN.date)}${row('歷史成績', SC && SC.through)}${row('集保大戶（每週）', TD && TD.date, '每週更新')}</tbody></table>
    <p class="small muted" style="margin:6px 0 0">交易日約 17:00 後更新；收盤前或非交易日顯示前一交易日屬正常。</p>
    <h3 class="adm-h">最近的自動更新</h3>${RUN && RUN.workflow_runs ? `<table class="follow-t"><thead><tr><th>開始時間</th><th>觸發方式</th><th>結果</th></tr></thead><tbody>${RUN.workflow_runs.map(r => `<tr><td class="num">${dt(r.run_started_at || r.created_at)}</td><td>${r.event === 'schedule' ? '排程' : '手動'}</td><td>${r.status !== 'completed' ? '<span class="fs wait">執行中</span>' : ST[r.conclusion] || esc(r.conclusion)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">暫時無法取得。</p>'}`;
})();
