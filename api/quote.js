// 盤中即時報價：/api/quote?codes=2330,6488
const { quotes, session } = require('../lib/mis.js');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const codes = String((req.query && req.query.codes) || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[0-9A-Z]{4,6}$/.test(s) || s === 'TAIEX').slice(0, 20);
  if (!codes.length) { res.status(400).end(JSON.stringify({ error: '請提供股票代號。' })); return; }
  try {
    // TAIEX 為加權指數（MIS 代號 t00）
    const q = (await quotes(codes.map(c => c === 'TAIEX' ? { code: 't00', market: 'tse' } : c))).map(x => x.code === 't00' ? Object.assign(x, { code: 'TAIEX' }) : x);
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).end(JSON.stringify({ session: session(), quotes: q }));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: '即時行情暫時取不到。', detail: String(e && e.message || e) }));
  }
};
