// 每日排程：抓全市場資料（有快取）→ 算當天名單 → 回補歷史名單 → 計算名單成績單
// 由 .github/workflows/daily.yml 在每個交易日收盤後執行，結果寫進 data/ 由網站直接讀取
const fs = require('fs'), path = require('path');
const M = require('./market.js'), { screenAt } = require('./screen.js');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data'), CACHE = path.join(DATA, 'cache');
const BACKFILL = +(process.env.BACKFILL || 60), HISTORY = BACKFILL + 62;
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const tpeNow = () => new Date(Date.now() + 8 * 3600e3);
const isoOf = d => d.toISOString().slice(0, 10);

(async () => {
  const now = tpeNow(), today = isoOf(now), afterClose = now.getUTCHours() * 60 + now.getUTCMinutes() >= 14 * 60 + 30;
  // 1. 交易日行情（快取在 data/cache/daily）
  const weekdays = []; for (const d = new Date(now); weekdays.length < Math.round(HISTORY * 1.15) + 10; d.setUTCDate(d.getUTCDate() - 1)) { const w = d.getUTCDay(); if (w && w < 6) weekdays.push(isoOf(d)); }
  weekdays.reverse();
  const days = [], names = rd(path.join(CACHE, 'names.json')) || {}, taiex = rd(path.join(CACHE, 'taiex.json')) || {};
  for (const d of weekdays) {
    if (d === today && !afterClose) continue;
    const f = path.join(CACHE, 'daily', d + '.json'); let c = rd(f);
    if (!c) {
      const r = await M.daily(d);
      if (r.n > 500) {
        c = {}; for (const [code, q] of Object.entries(r.quotes)) { c[code] = q.slice(0, 5); names[code] = [q[5], q[6] === 'tse' ? '上市' : '上櫃']; }
        if (r.taiex) taiex[d] = r.taiex; wr(f, c); console.log('行情', d, r.n);
      } else if (d < today && r.noData) { c = { holiday: true }; wr(f, c); console.log('休市', d); }
      else continue;
    }
    if (!c.holiday) days.push({ d, q: c });
  }
  wr(path.join(CACHE, 'names.json'), names); wr(path.join(CACHE, 'taiex.json'), taiex);
  if (days.length < 45) throw new Error('交易日資料不足：' + days.length);
  const last = days.length - 1, from = Math.max(61, last - BACKFILL + 1);

  // 2. 法人、本益比（只抓需要的日期）
  const instByDay = {}, valByDay = {};
  for (let i = Math.max(0, from - 4); i <= last; i++) {
    const d = days[i].d, f = path.join(CACHE, 'inst', d + '.json'); let x = rd(f);
    if (!x || (!Object.keys(x).length && d >= days[last - 1].d)) { x = await M.inst(d); if (Object.keys(x).length || d < days[last - 1].d) wr(f, x); console.log('法人', d, Object.keys(x).length); }
    instByDay[d] = x;
  }
  for (let i = from; i <= last; i++) {
    const d = days[i].d, f = path.join(CACHE, 'val', d + '.json'); let x = rd(f);
    if (!x || !Object.keys(x).length) { x = await M.val(d); if (Object.keys(x).length) wr(f, x); console.log('本益比', d, Object.keys(x).length); }
    valByDay[d] = x;
  }

  // 3. 月營收快照：記錄每個月份的營收「從哪一天起可用」，回補時只用當時已公布的營收
  const revNow = await M.revenue(); const month = Object.values(revNow).map(x => x.month).filter(Boolean).sort().pop();
  if (month) {
    const f = path.join(CACHE, 'rev', month.replace('/', '-') + '.json');
    if (!rd(f)) { const [y, m] = month.split('/').map(Number); const avail = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 11)); wr(f, { month, from: isoOf(avail) < today ? isoOf(avail) : today, data: revNow }); }
  }
  const revSnaps = fs.existsSync(path.join(CACHE, 'rev')) ? fs.readdirSync(path.join(CACHE, 'rev')).map(n => rd(path.join(CACHE, 'rev', n))).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from)) : [];
  const revAt = d => { let s = null; for (const x of revSnaps) if (x.from <= d) s = x; return s ? s.data : null; };

  // 4. 每日名單（已存在的歷史名單不重算，最新一天每次重算）
  const dates = [];
  for (let i = from; i <= last; i++) {
    const d = days[i].d, f = path.join(DATA, 'daily', d + '.json');
    if (rd(f) && i < last && !process.env.RESCREEN) { dates.push(d); continue; }
    const res = screenAt(days, i, instByDay, valByDay, revAt(d), names);
    res.generatedAt = new Date().toISOString(); wr(f, res); dates.push(d); console.log('名單', d, res.counts);
  }
  const latest = rd(path.join(DATA, 'daily', days[last].d + '.json'));
  wr(path.join(DATA, 'latest.json'), latest);
  const allDates = fs.readdirSync(path.join(DATA, 'daily')).map(n => n.replace('.json', '')).sort();
  wr(path.join(DATA, 'index.json'), { dates: allDates, latest: days[last].d });

  // 5. 名單成績單：入選後第 1、5、20 個交易日的報酬，與加權指數比較
  const idx = new Map(days.map((x, i) => [x.d, i]));
  const H = [1, 5, 10, 20], picks = [];
  for (const d of allDates) {
    const i = idx.get(d); if (i == null) continue; const L = rd(path.join(DATA, 'daily', d + '.json'));
    for (const cat of ['day', 'swing', 'long']) (L[cat] || []).forEach((p, rank) => {
      const c0 = (days[i].q[p.code] || [])[3]; if (!c0) return;
      const row = { date: d, cat, rank: rank + 1, code: p.code, name: p.name, close: c0 };
      for (const h of H) { const j = i + h; if (j <= last) { const c1 = (days[j].q[p.code] || [])[3]; if (c1) row['r' + h] = +((c1 / c0 - 1) * 100).toFixed(2); const t0 = taiex[d], t1 = taiex[days[j].d]; if (t0 && t1) row['m' + h] = +((t1 / t0 - 1) * 100).toFixed(2); } }
      if (i + 1 <= last) { const nb = days[i + 1].q[p.code]; if (nb && nb[0]) { row.oc = +((nb[3] / nb[0] - 1) * 100).toFixed(2); row.oh = +((nb[1] / nb[0] - 1) * 100).toFixed(2); } }
      picks.push(row);
    });
  }
  const stat = (rows, k) => { const v = rows.map(r => r[k]).filter(x => x != null); if (!v.length) return null; const s = v.slice().sort((a, b) => a - b);
    return { n: v.length, avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), median: +s[Math.floor(s.length / 2)].toFixed(2), win: +(v.filter(x => x > 0).length / v.length * 100).toFixed(0) }; };
  // 兩種統計：每天前 3 名、每天全部（最多 10 檔）
  const summarize = sel => { const out = {}; for (const cat of ['day', 'swing', 'long']) {
    const rows = picks.filter(p => p.cat === cat && sel(p)); out[cat] = { picks: rows.length, from: rows.length ? rows[0].date : null };
    for (const h of H) { out[cat]['r' + h] = stat(rows, 'r' + h); out[cat]['m' + h] = stat(rows, 'm' + h); }
    out[cat].oc = stat(rows, 'oc'); out[cat].oh = stat(rows, 'oh'); } return out; };
  const summary = summarize(p => p.rank <= 3), summaryAll = summarize(() => true);
  wr(path.join(DATA, 'scorecard.json'), { updated: new Date().toISOString(), through: days[last].d, horizons: H, summary, summaryAll, picks: picks.slice().reverse() });
  console.log(`::notice::完成 ${days[last].d}：名單 ${allDates.length} 天、成績單 ${picks.length} 筆、交易日 ${days.length}；最新名單 ${JSON.stringify(latest.counts)}`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
