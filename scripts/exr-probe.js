// 測試：除權息、減資等公告資料能否取得
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*' };
const tests = [
  ['TWSE 除權息', 'https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20250101&endDate=20251231&response=json'],
  ['TWSE 減資', 'https://www.twse.com.tw/rwd/zh/reducation/TWTAVU?startDate=20250101&endDate=20261102&response=json'],
  ['TWSE 面額變更', 'https://www.twse.com.tw/rwd/zh/change/TWTB8U?startDate=20250101&endDate=20261102&response=json'],
  ['TPEx 除權息', 'https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=2025%2F01%2F01&endDate=2025%2F12%2F31&response=json'],
  ['TPEx 除權息2', 'https://www.tpex.org.tw/www/zh-tw/exRight/dailyQ?startDate=2025/01/01&endDate=2025/12/31&response=json'],
  ['TPEx 減資', 'https://www.tpex.org.tw/www/zh-tw/bulletin/revivt?startDate=2025/01/01&endDate=2026/11/02&response=json'],
  ['TPEx openapi 除權息', 'https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost'],
];
(async () => {
  for (const [n, u] of tests) {
    try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); const t = await r.text(); let info = t.slice(0, 260).replace(/\s+/g, ' ');
      try { const j = JSON.parse(t); const tb = j.tables ? j.tables[0] : j; const rows = (tb && (tb.data || (Array.isArray(tb) ? tb : null))) || j.data || []; info = `stat=${j.stat || ''} fields=${JSON.stringify((tb && tb.fields) || j.fields || (rows[0] && Object.keys(rows[0])) || '').slice(0, 300)} n=${rows.length} first=${JSON.stringify(rows[0] || '').slice(0, 250)}`; } catch (e) {}
      console.log(`::notice::${n} HTTP ${r.status} ${info}`);
    } catch (e) { console.log(`::notice::${n} 失敗 ${e}`); }
    await new Promise(z => setTimeout(z, 1500));
  }
})();
