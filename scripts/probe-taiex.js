// 檢查加權指數、成交資訊、法人合計三個來源的原始回應
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*' };
(async () => {
  for (const u of ['https://www.twse.com.tw/rwd/zh/indicesReport/MI_5MINS_HIST?date=20261001&response=json',
    'https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=json&date=20261001',
    'https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=20261001&response=json',
    'https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=20261102&response=json']) {
    try { const r = await fetch(u, { headers: UA }); const t = await r.text(); console.log(r.status, u, '\n', t.slice(0, 600)); } catch (e) { console.log('ERR', u, String(e)); }
    await new Promise(r => setTimeout(r, 1500));
  }
})();
