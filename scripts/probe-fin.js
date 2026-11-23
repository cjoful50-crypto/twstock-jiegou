// 實測財報資料來源：能否取得各季損益（EPS、營收、毛利、營業利益）與資產負債（權益、負債）
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: '*/*' };
const show = async (label, url, opt = {}) => {
  try { const t0 = Date.now(), r = await fetch(url, Object.assign({ headers: UA }, opt)); const t = await r.text();
    console.log(`\n=== ${label} ｜ ${r.status} ｜ ${t.length} 字元 ｜ ${Date.now() - t0}ms\n${t.replace(/\s+/g, ' ').slice(0, 700)}`); }
  catch (e) { console.log(`\n=== ${label} ｜ 錯誤 ${e}`); }
  await new Promise(r => setTimeout(r, 2500));
};
const form = o => ({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, UA), body: new URLSearchParams(o).toString() });
(async () => {
  await show('證交所 OpenAPI 綜合損益（一般業，最新一季）', 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci');
  await show('證交所 OpenAPI 資產負債（一般業，最新一季）', 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci');
  await show('櫃買 OpenAPI 綜合損益（一般業）', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci');
  const q = { encodeURIComponent: 1, step: 1, firstin: 1, off: 1, isQuery: 'Y', TYPEK: 'sii', year: '114', season: '02' };
  await show('觀測站（舊站 mopsov）綜合損益彙總 114Q2 上市', 'https://mopsov.twse.com.tw/mops/web/ajax_t163sb04', form(q));
  await show('觀測站（mops）綜合損益彙總 114Q2 上市', 'https://mops.twse.com.tw/mops/web/ajax_t163sb04', form(q));
  await show('觀測站（舊站）資產負債彙總 114Q2 上市', 'https://mopsov.twse.com.tw/mops/web/ajax_t163sb05', form(q));
  await show('觀測站（舊站）綜合損益彙總 112Q1 上櫃', 'https://mopsov.twse.com.tw/mops/web/ajax_t163sb04', form(Object.assign({}, q, { TYPEK: 'otc', year: '112', season: '01' })));
  await show('FinMind 免費 API 台積電財報', 'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=2330&start_date=2024-01-01');
})();
