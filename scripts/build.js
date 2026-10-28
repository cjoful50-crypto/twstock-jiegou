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
  const weekdays = []; for (const d = new Date(now); weekdays.length < 90; d.setUTCDate(d.getUTCDate() - 1)) { const w = d.getUTCDay(); if (w && w < 6) weekdays.push(isoOf(d)); }
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
  // 名單與成績單用快取裡所有交易日（含研究用回補的歷史）
  days.length = 0;
  for (const n of fs.readdirSync(path.join(CACHE, 'daily')).sort()) { const d = n.slice(0, 10); if (d === today && !afterClose) continue; const c = rd(path.join(CACHE, 'daily', n)); if (c && !c.holiday) days.push({ d, q: c }); }
  if (days.length < 45) throw new Error('交易日資料不足：' + days.length);
  const last = days.length - 1, from = Math.max(70, last - BACKFILL + 1);

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

  // 5. 名單成績單：訊號隔天開盤買進，短線持有 5 日、波段 20 日、長線 60 日後以收盤賣出，扣交易成本（約 0.47%）
  //    同時算「同一天隨便買全市場（日均成交值 2 億以上）」的平均，當作比較基準
  const COST = 0.47, HOLD = { day: 5, swing: 20, long: 60 };
  const idx = new Map(days.map((x, i) => [x.d, i]));
  const benchCache = {};
  // 除權息、減資、分割會讓價格出現超過漲跌幅限制的斷層，持有期間碰到這種情況的交易不列入統計
  const jumpFree = (code, i, j) => { for (let k = i + 1; k <= j; k++) { const a = days[k - 1].q[code], b = days[k].q[code]; if (!a || !b || !a[3]) continue; const r = (b[0] || b[3]) / a[3]; if (r < 0.895 || r > 1.105) return false; } return true; };
  const bench = (i, h) => { const k = i + ':' + h; if (k in benchCache) return benchCache[k]; let s = 0, n = 0;
    if (i + h <= last) for (const [code, b] of Object.entries(days[i].q)) { const nb = days[i + 1].q[code], eb = days[i + h].q[code]; if (!nb || !nb[0] || !eb || !eb[3] || !b[3]) continue;
      // 成交值門檻用當日成交量近似
      if (b[3] * (b[4] || 0) * 1000 < 2e8 || !jumpFree(code, i, i + h)) continue; s += (eb[3] / nb[0] - 1) * 100; n++; }
    return benchCache[k] = n ? +(s / n - COST).toFixed(2) : null; };
  const picks = [];
  for (const d of allDates) {
    const i = idx.get(d); if (i == null) continue; const L = rd(path.join(DATA, 'daily', d + '.json'));
    for (const cat of ['day', 'swing', 'long']) (L[cat] || []).forEach((p, rank) => {
      const c0 = (days[i].q[p.code] || [])[3]; if (!c0) return;
      const row = { date: d, cat, rank: rank + 1, code: p.code, name: p.name, close: c0 }, h = HOLD[cat];
      const nb = i + 1 <= last ? days[i + 1].q[p.code] : null;
      if (nb && nb[0]) { row.entry = nb[0];
        // 持有期間若停牌，取最後一個有收盤價的日子
        let ex = null; for (let j = i + 1; j <= Math.min(last, i + h); j++) { const b = days[j].q[p.code]; if (b && b[3]) ex = b[3]; }
        const clean = jumpFree(p.code, i, Math.min(last, i + h));
        row.now = ex != null && clean ? +((ex / nb[0] - 1) * 100 - COST).toFixed(2) : null; if (!clean) row.note = '持有期間有除權息、減資或分割，不列入統計';
        if (i + h <= last && ex != null) { row.ret = row.now; row.bench = bench(i, h); }
      }
      picks.push(row);
    });
  }
  const stat = rows => { const v = rows.filter(r => r.ret != null); if (!v.length) return null; const s = v.map(r => r.ret).sort((a, b) => a - b), b = v.filter(r => r.bench != null);
    const avg = s.reduce((a, x) => a + x, 0) / s.length, bAvg = b.length ? b.reduce((a, r) => a + r.bench, 0) / b.length : null;
    return { n: v.length, avg: +avg.toFixed(2), median: +s[Math.floor(s.length / 2)].toFixed(2), win: +(s.filter(x => x > 0).length / s.length * 100).toFixed(0), worst: +s[0].toFixed(2), bench: bAvg == null ? null : +bAvg.toFixed(2), excess: bAvg == null ? null : +(avg - bAvg).toFixed(2) }; };
  const halves = [...new Set(picks.map(p => p.date.slice(0, 4) + (p.date.slice(5, 7) <= '06' ? '上' : '下')))].sort();
  const summarize = sel => { const out = {}; for (const cat of ['day', 'swing', 'long']) {
    const rows = picks.filter(p => p.cat === cat && sel(p)); out[cat] = Object.assign({ hold: HOLD[cat], picks: rows.length, from: rows.length ? rows[0].date : null }, { all: stat(rows) });
    out[cat].periods = halves.map(hf => ({ label: hf.slice(0, 4) + (hf.endsWith('上') ? ' 上半年' : ' 下半年'), s: stat(rows.filter(p => p.date.slice(0, 4) + (p.date.slice(5, 7) <= '06' ? '上' : '下') === hf)) })).filter(x => x.s);
  } return out; };
  const summary = summarize(p => p.rank <= 3), summaryAll = summarize(() => true);
  wr(path.join(DATA, 'scorecard.json'), { updated: new Date().toISOString(), through: days[last].d, cost: COST, hold: HOLD, summary, summaryAll, picks: picks.slice(-3000).reverse() });
  console.log(`::notice::完成 ${days[last].d}：名單 ${allDates.length} 天、成績單 ${picks.length} 筆、交易日 ${days.length}；最新名單 ${JSON.stringify(latest.counts)}`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
