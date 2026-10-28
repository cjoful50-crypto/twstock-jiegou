// 盤中當沖觀察：前一日成交值前 150 大的上市股票，用即時行情找量能放大、振幅大、價格在高檔的股票
const { quotes, session } = require('../lib/mis.js');
let base = null;
async function baseline() {
  if (base && Date.now() - base.t < 30 * 60e3) return base.rows;
  const r = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  const n = s => parseFloat(String(s).replace(/,/g, ''));
  const rows = j.filter(x => /^[1-9]\d{3}$/.test(x.Code)).map(x => ({ code: x.Code, name: String(x.Name).trim(), vol: n(x.TradeVolume) / 1000, value: n(x.TradeValue), close: n(x.ClosingPrice) }))
    .filter(x => x.close >= 10 && x.vol > 0).sort((a, b) => b.value - a.value).slice(0, 150);
  base = { t: Date.now(), rows }; return rows;
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const ses = session(), rows = await baseline(), byCode = new Map(rows.map(r => [r.code, r]));
    const q = await quotes(rows.map(r => ({ code: r.code, market: 'tse' })));
    const today = q.find(x => x.date)?.date;
    const live = q.filter(x => x.price && x.prev && x.high && x.low && x.vol != null).map(x => {
      const b = byCode.get(x.code), chg = (x.price / x.prev - 1) * 100, range = (x.high - x.low) / x.prev * 100;
      const pos = x.high > x.low ? (x.price - x.low) / (x.high - x.low) : 0.5;
      const pace = ses.open ? x.vol / (b.vol * ses.elapsed) : x.vol / b.vol;
      return { code: x.code, name: x.name || b.name, price: x.price, chg, range, pos, pace, vol: x.vol, atLimit: x.limitUp != null && x.price >= x.limitUp, time: x.time };
    });
    const picks = live.filter(x => x.chg >= 1.5 && x.chg <= 9 && !x.atLimit && x.range >= 2.5 && x.pos >= 0.6 && x.pace >= 1.3)
      .map(x => Object.assign(x, { score: Math.min(x.pace, 5) * 10 + x.range * 3 + x.pos * 10 + x.chg }))
      .sort((a, b) => b.score - a.score).slice(0, 3)
      .map(x => Object.assign(x, { why: [`成交量約為昨日按時間比例的 ${x.pace.toFixed(1)} 倍`, `盤中振幅 ${x.range.toFixed(1)}%`, `位於今日高低區間 ${Math.round(x.pos * 100)}%`] }));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).end(JSON.stringify({ session: ses, date: today, time: live.map(x => x.time).filter(Boolean).sort().pop() || null, scanned: live.length, picks }));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: '盤中行情暫時取不到，請稍後再試。', detail: String(e && e.message || e) }));
  }
};
