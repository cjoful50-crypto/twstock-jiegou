// 每日篩選名單：用證交所全市場日報，依規則篩出當沖、短期、長期觀察名單各 3 檔
const Engine = require('../engine.js');
const TWSE = 'https://www.twse.com.tw/rwd/zh';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'zh-TW,zh;q=0.9' };
const cache = globalThis.__pkCache || (globalThis.__pkCache = new Map());
const DAYS = 62;

let active = 0, last = 0; const queue = [];
const schedule = fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
function pump() {
  if (active >= 3 || !queue.length) return;
  const wait = Math.max(0, last + 250 - Date.now());
  if (wait) { setTimeout(pump, wait); return; }
  const job = queue.shift(); active++; last = Date.now();
  job.fn().then(job.resolve, job.reject).finally(() => { active--; pump(); });
  pump();
}
async function getJSON(url, ttl) {
  const hit = cache.get(url); if (hit && Date.now() - hit.t < ttl) return hit.data;
  const data = await schedule(async () => {
    for (let a = 0; a < 2; a++) {
      try { const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return JSON.parse(await r.text()); }
      catch (e) { if (a) throw e; await new Promise(r => setTimeout(r, 900)); }
    }
  });
  cache.set(url, { t: Date.now(), data }); return data;
}
const safe = p => p.catch(() => null);
const num = s => { if (s == null) return null; const v = parseFloat(String(s).replace(/[,\s+]/g, '')); return isNaN(v) ? null : v; };
const sum = a => a.reduce((s, x) => s + x, 0);
const avg = a => sum(a) / a.length;
const iso = d => d.toISOString().slice(0, 10);

/* 全市場每日收盤：MI_INDEX 取出「每日收盤行情」那張表 */
function parseDaily(j) {
  if (!j || j.stat !== 'OK') return null;
  const tables = j.tables || [];
  const t = tables.find(t => (t.fields || []).includes('證券代號') && (t.fields || []).includes('收盤價'));
  if (!t) return null;
  const f = t.fields, ix = k => f.indexOf(k);
  const iC = ix('證券代號'), iN = ix('證券名稱'), iV = ix('成交股數'), iO = ix('開盤價'), iH = ix('最高價'), iL = ix('最低價'), iCl = ix('收盤價');
  const map = new Map();
  for (const r of t.data || []) {
    const code = String(r[iC]).trim(); if (!/^[1-9]\d{3}$/.test(code)) continue; // 只看一般股票，排除 ETF（00 開頭）與權證
    const c = num(r[iCl]), o = num(r[iO]), h = num(r[iH]), l = num(r[iL]), v = num(r[iV]);
    if (!c || !o || !h || !l) continue;
    map.set(code, { name: String(r[iN]).trim(), o, h, l, c, v: Math.round((v || 0) / 1000) });
  }
  return map;
}

async function collect() {
  const now = new Date(Date.now() + 8 * 3600e3), todayIso = iso(now);
  const dates = []; const d = new Date(now);
  while (dates.length < DAYS + 30) { const wd = d.getUTCDay(); if (wd && wd < 6) dates.push(iso(d)); d.setUTCDate(d.getUTCDate() - 1); }
  // 先抓最近的 DAYS+30 個平日，假日會回傳無資料
  const days = [];
  const results = await Promise.all(dates.map(ds => safe(getJSON(`${TWSE}/afterTrading/MI_INDEX?date=${ds.replace(/-/g, '')}&type=ALLBUT0999&response=json`, ds === todayIso ? 20 * 60e3 : 7 * 24 * 3600e3)).then(j => [ds, parseDaily(j)])));
  for (const [ds, m] of results) if (m && m.size > 100) days.push({ d: ds, m });
  days.sort((a, b) => a.d < b.d ? -1 : 1);
  return days.slice(-DAYS);
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const days = await collect();
    if (days.length < 40) throw new Error('只取得 ' + days.length + ' 個交易日的全市場資料');
    const lastDay = days.at(-1).d, dd = s => s.replace(/-/g, '');
    const instDays = days.slice(-5).map(x => x.d);
    const [instRes, bw, rev] = await Promise.all([
      Promise.all(instDays.map(ds => safe(getJSON(`${TWSE}/fund/T86?date=${dd(ds)}&selectType=ALLBUT0999&response=json`, ds === lastDay ? 20 * 60e3 : 7 * 24 * 3600e3)).then(j => [ds, j]))),
      safe(getJSON(`${TWSE}/afterTrading/BWIBBU_d?date=${dd(lastDay)}&selectType=ALL&response=json`, 6 * 3600e3)),
      safe(getJSON('https://openapi.twse.com.tw/v1/opendata/t187ap05_L', 6 * 3600e3))
    ]);
    const inst = new Map(); // code -> [{d,f,t,dl}]
    for (const [ds, j] of instRes) for (const r of (j && j.data) || []) {
      const code = String(r[0]).trim(); if (!inst.has(code)) inst.set(code, []);
      inst.get(code).push({ d: ds, f: Math.round(num(r[4]) / 1000), t: Math.round(num(r[10]) / 1000), dl: Math.round(num(r[11]) / 1000) });
    }
    const val = new Map(); for (const r of (bw && bw.data) || []) val.set(String(r[0]).trim(), { yld: num(r[3]), pe: num(r[5]), pb: num(r[6]) });
    const rv = new Map();
    if (Array.isArray(rev)) for (const x of rev) { const k = p => Object.keys(x).find(z => z.includes(p)); const ym = String(x[k('資料年月')] || ''); rv.set(String(x['公司代號']).trim(), { revYoY: num(x[k('去年同月增減')]), revMoM: num(x[k('上月比較增減')]), revMonth: ym.length >= 4 ? `${+ym.slice(0, -2) + 1911}/${ym.slice(-2)}` : null }); }

    // 每檔股票的日K
    const codes = [...days.at(-1).m.keys()];
    const rows = [];
    for (const code of codes) {
      const bars = days.map(x => { const b = x.m.get(code); return b ? { d: x.d, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } : null; }).filter(Boolean);
      if (bars.length < 40) continue;
      const C = bars.map(b => b.c), V = bars.map(b => b.v), t = bars.at(-1), p = bars.at(-2), n = bars.length;
      const ma = k => n >= k ? avg(C.slice(-k)) : null, maPrev = (k, back) => n >= k + back ? avg(C.slice(-k - back, -back)) : null;
      const avgV20 = avg(V.slice(-20)); if (t.c < 10 || avgV20 < 1000) continue;
      let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const df = C[i] - C[i - 1]; if (df > 0) g += df; else l -= df; }
      const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      const tr = bars.slice(-14).map((b, i, a) => Math.max(b.h - b.l, Math.abs(b.h - (i ? a[i - 1].c : bars[n - 15].c)), Math.abs(b.l - (i ? a[i - 1].c : bars[n - 15].c))));
      const atrPct = avg(tr) / t.c * 100;
      const ins = inst.get(code) || [];
      const inst5 = sum(ins.map(x => x.f + x.t + x.dl)), trust5 = sum(ins.map(x => x.t));
      rows.push({ code, name: days.at(-1).m.get(code).name, bars, c: t.c, chg: (t.c / p.c - 1) * 100, ma5: ma(5), ma10: ma(10), ma20: ma(20), ma60: ma(60), ma20p: maPrev(20, 5), ma60p: maPrev(60, 5) ?? maPrev(55, 5),
        avgV20, volRatio: t.v / avgV20, turnover: avgV20 * t.c * 1000, rsi, atrPct, closePos: t.h > t.l ? (t.c - t.l) / (t.h - t.l) : 0.5, locked: t.h === t.l,
        ret20: (t.c / C[n - 21] - 1) * 100, high60: Math.max(...bars.map(b => b.h)), ins, inst5, trust5, fund: Object.assign({}, val.get(code) || {}, rv.get(code) || {}) });
    }

    const fmt = x => (x > 0 ? '+' : '') + x.toFixed(1);
    const day = rows.filter(r => r.turnover >= 5e8 && r.atrPct >= 3 && r.volRatio >= 1.5 && r.chg >= 2 && r.chg <= 9.5 && !r.locked && r.closePos >= 0.7 && r.c > r.ma5)
      .map(r => Object.assign(r, { score: Math.min(r.volRatio, 5) * 10 + r.atrPct * 3 + r.closePos * 10 + r.chg,
        why: [`量比 ${r.volRatio.toFixed(1)} 倍`, `近 14 日平均振幅 ${r.atrPct.toFixed(1)}%`, `收在當日高檔（${Math.round(r.closePos * 100)}%）`, `日均成交值 ${(r.turnover / 1e8).toFixed(0)} 億`] }));
    const swing = rows.filter(r => r.ma60 && r.c > r.ma5 && r.ma5 > r.ma10 && r.ma10 > r.ma20 && r.ma20 > r.ma20p && r.rsi >= 55 && r.rsi <= 78 && r.ret20 >= 3 && r.ret20 <= 30 && r.volRatio >= 1 && r.inst5 > 0 && r.c >= r.high60 * 0.92)
      .map(r => Object.assign(r, { score: Math.min(r.inst5 / r.avgV20 * 100, 50) + (r.rsi - 50) + Math.min(r.volRatio, 3) * 5 + (r.trust5 > 0 ? 10 : 0),
        why: ['均線多頭排列（MA5 > MA10 > MA20）', `RSI ${r.rsi.toFixed(0)}`, `法人近 5 日買超 ${Math.round(r.inst5).toLocaleString('en-US')} 張`, r.trust5 > 0 ? '投信同步買超' : `近 20 日 ${fmt(r.ret20)}%`] }));
    const longT = rows.filter(r => r.ma60 && r.fund.revYoY != null && r.fund.revYoY >= 15 && r.fund.pe > 0 && r.fund.pe <= 25 && r.fund.yld >= 1.5 && r.c > r.ma60 && r.ma20 > r.ma60 && r.avgV20 >= 500)
      .map(r => Object.assign(r, { score: Math.min(r.fund.revYoY, 100) * 0.4 + (25 - r.fund.pe) + r.fund.yld * 3 + (r.inst5 > 0 ? 5 : 0),
        why: [`${r.fund.revMonth || '最新'} 營收年增 ${fmt(r.fund.revYoY)}%`, `本益比 ${r.fund.pe}`, `殖利率 ${r.fund.yld}%`, '站上季線且月線在季線之上'] }));

    const used = new Set();
    const top = list => list.sort((a, b) => b.score - a.score).filter(r => !used.has(r.code) && used.add(r.code)).slice(0, 3).map(r => {
      let a = null; try { a = Engine.analyze({ code: r.code, name: r.name, bars: r.bars, inst: r.ins.length ? r.ins : undefined, fund: r.fund }); } catch (e) {}
      return { code: r.code, name: r.name, close: r.c, chg: r.chg, why: r.why, index: a ? a.index : null, trend: a ? a.trendLabel : null,
        sup: a && a.st.sup[0] ? a.st.sup[0].level : null, res: a && a.st.res[0] ? a.st.res[0].level : (a && a.st.limitRef) || null };
    });
    const out = { date: lastDay.replace(/-/g, '/'), universe: rows.length, counts: { day: day.length, swing: swing.length, long: longT.length },
      day: top(day), swing: top(swing), long: top(longT), instDate: instRes.filter(([, j]) => j && j.data && j.data.length).map(([d]) => d).pop() || null, generatedAt: new Date().toISOString() };
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).end(JSON.stringify(out));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: '整理今日名單時向證交所抓資料失敗，請稍後再試。', detail: String(e && e.message || e) }));
  }
};
