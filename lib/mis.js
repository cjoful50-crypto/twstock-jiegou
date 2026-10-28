// 證交所「基本市況報導」即時行情（MIS），上市 tse_、上櫃 otc_
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
let cookie = '';
async function getCookie() {
  try {
    const r = await fetch('https://mis.twse.com.tw/stock/index.jsp', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
    cookie = sc.map(c => c.split(';')[0]).join('; ');
  } catch (e) {}
}
const num = s => { if (s == null || s === '-' || s === '') return null; const v = parseFloat(String(s).split('_')[0]); return isNaN(v) ? null : v; };

async function fetchBatch(exch) {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exch.join('|'))}&json=1&delay=0&_=${Date.now()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://mis.twse.com.tw/stock/index.jsp', ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(10000) });
      const txt = await r.text(); const j = JSON.parse(txt);
      if (j.rtcode && j.rtcode !== '0000' && !j.msgArray) throw new Error(j.rtmessage || j.rtcode);
      return j.msgArray || [];
    } catch (e) { if (attempt) throw e; await getCookie(); }
  }
}

// codes: [{code, market:'tse'|'otc'}] 或字串（兩邊都查）
async function quotes(codes) {
  const exch = [];
  for (const c of codes) { if (typeof c === 'string') exch.push(`tse_${c}.tw`, `otc_${c}.tw`); else exch.push(`${c.market}_${c.code}.tw`); }
  const out = [];
  for (let i = 0; i < exch.length; i += 60) {
    const rows = await fetchBatch(exch.slice(i, i + 60));
    for (const m of rows) {
      if (!m.c) continue;
      const bid = num(m.b), ask = num(m.a), last = num(m.z);
      const price = last ?? (bid && ask ? (bid + ask) / 2 : bid ?? ask ?? null);
      out.push({ code: m.c, name: m.n, market: m.ex, price, last, prev: num(m.y), open: num(m.o), high: num(m.h), low: num(m.l), vol: num(m.v), limitUp: num(m.u), limitDown: num(m.w),
        date: m.d ? `${m.d.slice(0, 4)}-${m.d.slice(4, 6)}-${m.d.slice(6, 8)}` : null, time: m.t || null, ts: m.tlong ? +m.tlong : null });
    }
  }
  return out;
}
function session() {
  const t = new Date(Date.now() + 8 * 3600e3), wd = t.getUTCDay(), mins = t.getUTCHours() * 60 + t.getUTCMinutes();
  const open = wd >= 1 && wd <= 5 && mins >= 9 * 60 && mins <= 13 * 60 + 30;
  return { open, elapsed: Math.max(0.03, Math.min(1, (mins - 9 * 60) / 270)), today: t.toISOString().slice(0, 10) };
}
module.exports = { quotes, session };
