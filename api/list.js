// 股票清單（代號、名稱、市場），給搜尋框自動完成用
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36', Accept: 'application/json' };
const get = url => fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) }).then(r => r.json()).catch(() => []);
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const [twse, tpex] = await Promise.all([get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'), get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')]);
  const list = [];
  const ok = c => /^\d{4}$/.test(c) || /^00\d{2,4}[A-Z]?$/.test(c); // 一般股票與 ETF，排除權證
  for (const x of Array.isArray(twse) ? twse : []) if (x.Code && ok(x.Code)) list.push([x.Code, String(x.Name).trim(), '上市']);
  for (const x of Array.isArray(tpex) ? tpex : []) { const c = x.SecuritiesCompanyCode || x.Code; if (c && ok(c)) list.push([c, String(x.CompanyName || x.Name || '').trim(), '上櫃']); }
  if (list.length < 300) { res.status(502).end(JSON.stringify({ error: '股票清單暫時取不到', n: list.length })); return; }
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
  res.status(200).end(JSON.stringify(list));
};
