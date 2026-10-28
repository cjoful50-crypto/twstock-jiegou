// 盤後結構室：從證交所（上市）/ 櫃買中心（上櫃）抓收盤資料，整理成前端分析引擎要的格式
const TWSE = 'https://www.twse.com.tw/rwd/zh';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'zh-TW,zh;q=0.9' };

// 同一個 function 實例內共用快取：全市場的日報表（法人、融資、借券、本益比）每檔股票都一樣
const cache = globalThis.__twCache || (globalThis.__twCache = new Map());

// 證交所對過快的請求會暫時封鎖 IP，所以限制同時 2 個、每個間隔 300ms
let active = 0, last = 0; const queue = [];
function schedule(fn) {
  return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
}
function pump() {
  if (active >= 2 || !queue.length) return;
  const wait = Math.max(0, last + 300 - Date.now());
  if (wait) { setTimeout(pump, wait); return; }
  const job = queue.shift(); active++; last = Date.now();
  job.fn().then(job.resolve, job.reject).finally(() => { active--; pump(); });
  pump();
}
async function getJSON(url, ttlMs) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data;
  const data = await schedule(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const txt = await r.text();
        return JSON.parse(txt);
      } catch (e) { if (attempt) throw e; await new Promise(r => setTimeout(r, 800)); }
    }
  });
  cache.set(url, { t: Date.now(), data });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return data;
}

const num = s => { if (s == null) return null; const v = parseFloat(String(s).replace(/[,\s+]/g, '')); return isNaN(v) ? null : v; };
const rocToISO = s => { const m = String(s).trim().match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})/); if (!m) return null; let y = +m[1]; if (y < 1911) y += 1911; return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; };
const ymd = iso => iso.replace(/-/g, '');
const slash = iso => iso.replace(/-/g, '/');

function taipeiToday() {
  const d = new Date(Date.now() + 8 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), iso: d.toISOString().slice(0, 10) };
}
function monthList(n) {
  const t = taipeiToday(), out = [];
  for (let i = n - 1; i >= 0; i--) { let y = t.y, m = t.m - i; while (m <= 0) { m += 12; y--; } out.push({ y, m, current: i === 0 }); }
  return out;
}

/* 上市：個股日成交 */
async function twseBars(code) {
  let name = null; const bars = [];
  for (const { y, m, current } of monthList(7)) {
    const url = `${TWSE}/afterTrading/STOCK_DAY?date=${y}${String(m).padStart(2, '0')}01&stockNo=${code}&response=json`;
    let j; try { j = await getJSON(url, current ? 10 * 60e3 : 24 * 3600e3); } catch (e) { continue; }
    if (j.stat !== 'OK' || !j.data) continue;
    if (!name && j.title) { const t = j.title.split(/\s+/); const i = t.indexOf(code); if (i >= 0) name = t[i + 1]; }
    for (const r of j.data) {
      const d = rocToISO(r[0]), o = num(r[3]), h = num(r[4]), l = num(r[5]), c = num(r[6]), v = num(r[1]);
      if (d && c && o && h && l) bars.push({ d, o, h, l, c, v: Math.round(v / 1000) });
    }
  }
  return { name, bars };
}

/* 上櫃：個股日成交（櫃買中心） */
async function tpexBars(code) {
  let name = null; const bars = [];
  for (const { y, m, current } of monthList(7)) {
    const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${code}&date=${y}/${String(m).padStart(2, '0')}/01&id=&response=json`;
    let j; try { j = await getJSON(url, current ? 10 * 60e3 : 24 * 3600e3); } catch (e) { continue; }
    const tables = j.tables || (j.aaData ? [{ data: j.aaData }] : []);
    if (!name && j.name) name = j.name;
    for (const t of tables) for (const r of (t.data || [])) {
      const d = rocToISO(String(r[0]).replace(/\*/g, '')); if (!d) continue;
      const v = num(r[1]), o = num(r[3]), h = num(r[4]), l = num(r[5]), c = num(r[6]);
      if (c && o && h && l) bars.push({ d, o, h, l, c, v: Math.round(v) });
    }
    if (!name && tables[0] && tables[0].title) { const mm = String(tables[0].title).match(new RegExp(code + '\\s*(\\S+)')); if (mm) name = mm[1]; }
  }
  return { name, bars };
}

async function safe(p) { try { return await p; } catch (e) { return null; } }

module.exports = async (req, res) => {
  const code = String((req.query && req.query.code) || '').trim().toUpperCase();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!/^[0-9A-Z]{4,6}$/.test(code)) { res.status(400).end(JSON.stringify({ error: '請輸入 4 到 6 碼的股票代號，例如 2330。' })); return; }
  try {
    let market = 'TWSE', { name, bars } = await twseBars(code);
    if (bars.length < 30) { const t = await tpexBars(code); if (t.bars.length > bars.length) { market = 'TPEx'; name = t.name || name; bars = t.bars; } }
    if (!bars.length) { res.status(404).end(JSON.stringify({ error: `找不到 ${code} 的成交資料。請確認代號是上市或上櫃股票，ETF 與權證不在支援範圍。` })); return; }
    bars.sort((a, b) => a.d < b.d ? -1 : 1);
    const seen = new Set(); bars = bars.filter(b => !seen.has(b.d) && seen.add(b.d));

    const out = { code, name: name || code, market, bars, inst: [], margin: [], sbl: [], fund: {}, dates: { price: slash(bars.at(-1).d) }, fetchedAt: new Date().toISOString(),
      source: market === 'TWSE' ? '臺灣證券交易所、公開資訊觀測站' : '證券櫃檯買賣中心' };

    if (market === 'TWSE') {
      const today = taipeiToday().iso;
      const ttl = d => d === today ? 30 * 60e3 : 12 * 3600e3;
      const days = bars.slice(-6).map(b => b.d);           // 最近 6 個交易日
      const instDays = days.slice(-5), chipDays = [days[0], days.at(-1)];

      const [instRes, marRes, sblRes, bw, rev] = await Promise.all([
        Promise.all(instDays.map(d => safe(getJSON(`${TWSE}/fund/T86?date=${ymd(d)}&selectType=ALLBUT0999&response=json`, ttl(d))).then(j => [d, j]))),
        Promise.all(chipDays.map(d => safe(getJSON(`${TWSE}/marginTrading/MI_MARGN?date=${ymd(d)}&selectType=ALL&response=json`, ttl(d))).then(j => [d, j]))),
        Promise.all(chipDays.map(d => safe(getJSON(`${TWSE}/marginTrading/TWT93U?date=${ymd(d)}&response=json`, ttl(d))).then(j => [d, j]))),
        safe(getJSON(`${TWSE}/afterTrading/BWIBBU_d?date=${ymd(days.at(-1))}&selectType=ALL&response=json`, ttl(days.at(-1)))),
        safe(getJSON('https://openapi.twse.com.tw/v1/opendata/t187ap05_L', 6 * 3600e3))
      ]);

      for (const [d, j] of instRes) {
        const r = j && (j.data || []).find(x => String(x[0]).trim() === code);
        if (r) out.inst.push({ d, f: Math.round(num(r[4]) / 1000), t: Math.round(num(r[10]) / 1000), dl: Math.round(num(r[11]) / 1000) });
      }
      for (const [d, j] of marRes) {
        if (!j) continue;
        const rows = (j.tables || []).flatMap(t => t.data || []).concat(j.data || []);
        const r = rows.find(x => String(x[0]).trim() === code);
        if (r) out.margin.push({ d, mb: num(r[6]), sb: num(r[12]) });
      }
      for (const [d, j] of sblRes) {
        const r = j && (j.data || []).find(x => String(x[0]).trim() === code);
        if (r) out.sbl.push({ d, bal: Math.round(num(r[12]) / 1000), sell: Math.round(num(r[9]) / 1000), ret: Math.round(num(r[10]) / 1000) });
      }
      const b = bw && (bw.data || []).find(x => String(x[0]).trim() === code);
      if (b) { out.fund.yld = num(b[3]); out.fund.pe = num(b[5]); out.fund.pb = num(b[6]); if (!name && b[1]) out.name = String(b[1]).trim(); }
      const rv = Array.isArray(rev) && rev.find(x => String(x['公司代號']).trim() === code);
      if (rv) {
        const key = part => Object.keys(rv).find(k => k.includes(part));
        out.fund.revYoY = num(rv[key('去年同月增減')]); out.fund.revMoM = num(rv[key('上月比較增減')]);
        const ym = String(rv[key('資料年月')] || ''); if (ym.length >= 4) { const y = +ym.slice(0, -2) + 1911; out.fund.revMonth = `${y}/${ym.slice(-2)}`; }
      }
      if (out.inst.length) out.dates.inst = slash(out.inst.at(-1).d);
      if (out.margin.length || out.sbl.length) out.dates.chip = slash((out.margin.at(-1) || out.sbl.at(-1)).d);
      if (b) out.dates.val = slash(days.at(-1));
      if (out.fund.revMonth) out.dates.rev = out.fund.revMonth + ' 月營收';
      if (!out.inst.length) delete out.inst; if (!out.margin.length) delete out.margin; if (!out.sbl.length) delete out.sbl;
    } else { delete out.inst; delete out.margin; delete out.sbl; }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).end(JSON.stringify(out));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: '向證交所抓資料時失敗，可能是對方暫時限制連線，請過一分鐘再試。', detail: String(e && e.message || e) }));
  }
};
