// 盤中即時報價：/api/quote?codes=2330,6488
const { quotes, session } = require('../lib/mis.js');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const codes = String((req.query && req.query.codes) || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[0-9A-Z]{4,6}$/.test(s)).slice(0, 20);
  if (!codes.length) { res.status(400).end(JSON.stringify({ error: '請提供股票代號。' })); return; }
  try {
    const q = await quotes(codes);
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).end(JSON.stringify({ session: session(), quotes: q }));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: '即時行情暫時取不到。', detail: String(e && e.message || e) }));
  }
};
