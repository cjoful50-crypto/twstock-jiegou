// 股票清單：代號、名稱、市場、產業、收盤價、漲跌幅、成交量（張）。給搜尋與產業瀏覽用
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36', Accept: 'application/json' };
const errs = [];
const get = (url, ms = 15000) => fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }).then(async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { errs.push(url + ' ' + r.status + ' ' + t.slice(0, 120)); return []; } }).catch(e => { errs.push(url + ' ' + e); return []; });
const num = s => { const v = parseFloat(String(s ?? '').replace(/[,+\s]/g, '')); return isNaN(v) ? null : v; };
const ok = c => /^\d{4}$/.test(c) || /^00\d{2,4}[A-Z]?$/.test(c); // 一般股票與 ETF，排除權證
const key = (o, re) => Object.keys(o || {}).find(k => re.test(k));

const SECTORS = { '01': '水泥', '02': '食品', '03': '塑膠', '04': '紡織纖維', '05': '電機機械', '06': '電器電纜', '08': '玻璃陶瓷', '09': '造紙', '10': '鋼鐵', '11': '橡膠', '12': '汽車', '13': '電子', '14': '建材營造', '15': '航運', '16': '觀光餐旅', '17': '金融保險', '18': '貿易百貨', '19': '綜合', '20': '其他', '21': '化學', '22': '生技醫療', '23': '油電燃氣', '24': '半導體', '25': '電腦及週邊', '26': '光電', '27': '通信網路', '28': '電子零組件', '29': '電子通路', '30': '資訊服務', '31': '其他電子', '32': '文化創意', '33': '農業科技', '34': '電子商務', '35': '綠能環保', '36': '數位雲端', '37': '運動休閒', '38': '居家生活', '80': '管理股票', '91': '存託憑證' };

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  errs.length = 0;
  let [twse, tpex, twInfo, otInfo] = await Promise.all([
    get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
    get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'),
    get('https://openapi.twse.com.tw/v1/opendata/t187ap03_L'),
    get('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')
  ]);
  if (!Array.isArray(otInfo) || !otInfo.length) otInfo = await get('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', 25000);
  let tpexRows = null;
  if (!Array.isArray(tpex) || !tpex.length) {
    const j = await get('https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?type=EW&response=json');
    tpexRows = { fields: (j.tables || [])[0]?.fields || [], data: (j.tables || []).flatMap(t => t.data || []) };
  }
  if (req.query && req.query.debug) {
    res.end(JSON.stringify({ twse: twse.length, tpex: tpex.length, twInfo: twInfo.length, otInfo: otInfo.length, tpexSample: tpex[0], otInfoSample: otInfo[0], twInfoKeys: Object.keys(twInfo[0] || {}), tpexRows: tpexRows && { fields: tpexRows.fields, first: tpexRows.data[0] }, errs }));
    return;
  }
  const sector = new Map();
  for (const info of [twInfo, otInfo]) if (Array.isArray(info) && info.length) {
    const kc = key(info[0], /公司代號|SecuritiesCompanyCode|^Code$/), ki = key(info[0], /產業|Industry/);
    if (kc && ki) for (const x of info) sector.set(String(x[kc]).trim(), String(x[ki]).trim().padStart(2, '0'));
  }
  const list = [];
  const push = (code, name, mkt, close, change, vol) => {
    if (!ok(code)) return;
    const sec = code.startsWith('00') ? 'ETF' : (sector.get(code) || '');
    const prev = close != null && change != null ? close - change : null;
    list.push([code, name, mkt, sec, close, prev ? +((change / prev) * 100).toFixed(2) : null, vol != null ? Math.round(vol / 1000) : null]);
  };
  for (const x of Array.isArray(twse) ? twse : []) push(String(x.Code), String(x.Name).trim(), '上市', num(x.ClosingPrice), num(x.Change), num(x.TradeVolume));
  if (Array.isArray(tpex) && tpex.length) {
    const s = tpex[0], kc = key(s, /SecuritiesCompanyCode|^Code$/), kn = key(s, /CompanyName|^Name$/), kp = key(s, /^Close$|ClosingPrice/), kch = key(s, /^Change$/), kv = key(s, /TradingShares|TradeVolume|Volume/);
    for (const x of tpex) push(String(x[kc]).trim(), String(x[kn]).trim(), '上櫃', num(x[kp]), num(x[kch]), num(x[kv]));
  } else if (tpexRows) {
    const f = tpexRows.fields, ix = re => f.findIndex(k => re.test(k));
    const iC = ix(/代號/) >= 0 ? ix(/代號/) : 0, iN = ix(/名稱/) >= 0 ? ix(/名稱/) : 1, iP = ix(/收盤/), iCh = ix(/漲跌/), iV = ix(/成交股數/);
    for (const r of tpexRows.data) push(String(r[iC]).trim(), String(r[iN]).trim(), '上櫃', iP >= 0 ? num(r[iP]) : null, iCh >= 0 ? num(r[iCh]) : null, iV >= 0 ? num(r[iV]) : null);
  }
  if (list.length < 300) { res.status(502).end(JSON.stringify({ error: '股票清單暫時取不到', n: list.length, errs })); return; }
  const counts = {}; for (const s of list) if (s[3]) counts[s[3]] = (counts[s[3]] || 0) + 1;
  const sectors = Object.entries(counts).map(([id, n]) => ({ id, name: id === 'ETF' ? 'ETF' : (SECTORS[id] || '其他'), n })).filter(s => s.name !== '其他' || s.n > 0).sort((a, b) => (a.id === 'ETF') - (b.id === 'ETF') || a.id.localeCompare(b.id));
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
  res.status(200).end(JSON.stringify({ sectors, stocks: list }));
};
