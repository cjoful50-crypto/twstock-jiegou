// 研究用回測：一次算好每檔每天的特徵，再比較多組名單規則（扣交易成本、分期間看穩定度）
// 進場一律用「訊號日隔天開盤價」，比較接近實際能買到的價格
const fs = require('fs'), path = require('path');
const C = path.join(__dirname, '..', 'data', 'cache');
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function load() {
  const days = fs.readdirSync(path.join(C, 'daily')).sort().map(n => ({ d: n.slice(0, 10), q: rd(path.join(C, 'daily', n)) })).filter(x => x.q && !x.q.holiday);
  const inst = {}, val = {};
  for (const n of fs.readdirSync(path.join(C, 'inst'))) inst[n.slice(0, 10)] = rd(path.join(C, 'inst', n));
  for (const n of fs.readdirSync(path.join(C, 'val'))) val[n.slice(0, 10)] = rd(path.join(C, 'val', n));
  const revSnaps = fs.readdirSync(path.join(C, 'rev')).map(n => rd(path.join(C, 'rev', n))).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from));
  const taiex = rd(path.join(C, 'taiex.json')) || {};
  return { days, inst, val, revSnaps, taiex };
}

// 每檔股票的時間序列 → 每天的特徵
function build({ days, inst, val, revSnaps, taiex }) {
  const N = days.length, codes = new Set(); for (const x of days) for (const c of Object.keys(x.q)) codes.add(c);
  // 大盤：加權指數與月線、全市場站上月線比例
  const tx = days.map(x => taiex[x.d] || null);
  for (let i = 1; i < N; i++) if (tx[i] == null) tx[i] = tx[i - 1];
  const mkt = days.map((_, i) => { if (i < 20 || tx[i] == null) return null; const w = tx.slice(i - 19, i + 1); const m20 = w.reduce((a, b) => a + b, 0) / 20; const w60 = i >= 59 ? tx.slice(i - 59, i + 1) : null;
    return { tx: tx[i], aboveMa20: tx[i] > m20, ma20Up: tx[i - 5] != null && m20 > tx.slice(i - 24, i - 4).reduce((a, b) => a + b, 0) / 20, r5: (tx[i] / tx[i - 5] - 1) * 100, aboveMa60: w60 ? tx[i] > w60.reduce((a, b) => a + b, 0) / 60 : null }; });
  const breadthCnt = new Array(N).fill(0), breadthTot = new Array(N).fill(0);
  const rows = [], series = {}; // 每天的候選特徵、每檔收盤序列（算停損用）
  for (let i = 0; i < N; i++) rows.push([]);
  const revAt = d => { let s = null; for (const x of revSnaps) if (x.from <= d) s = x; return s; };
  const revByDay = days.map(x => revAt(x.d));
  for (const code of codes) {
    const O = [], H = [], L = [], Cl = [], V = [], ok = [];
    for (const x of days) { const b = x.q[code]; if (b && b[3]) { O.push(b[0] || b[3]); H.push(b[1] || b[3]); L.push(b[2] || b[3]); Cl.push(b[3]); V.push(b[4] || 0); ok.push(true); } else { O.push(null); H.push(null); L.push(null); Cl.push(null); V.push(null); ok.push(false); } }
    series[code] = { Cl, L, O };
    // 只用連續有資料的區段（停牌就斷開）
    let run = 0;
    for (let i = 0; i < N; i++) {
      run = ok[i] ? run + 1 : 0;
      if (run < 61) continue;
      const c = Cl[i];
      const ma = (k, back = 0) => { let s = 0; for (let j = i - back - k + 1; j <= i - back; j++) s += Cl[j]; return s / k; };
      const ma20 = ma(20); breadthTot[i]++; if (c > ma20) breadthCnt[i]++;
      let sv = 0; for (let j = i - 19; j <= i; j++) sv += V[j]; const avgV20 = sv / 20;
      if (c < 10 || avgV20 < 500) continue;
      let g = 0, l = 0; for (let j = i - 13; j <= i; j++) { const df = Cl[j] - Cl[j - 1]; if (df > 0) g += df; else l -= df; }
      let tr = 0; for (let j = i - 13; j <= i; j++) tr += Math.max(H[j] - L[j], Math.abs(H[j] - Cl[j - 1]), Math.abs(L[j] - Cl[j - 1]));
      let hi20 = 0, lo20 = 1e9, hi60 = 0; for (let j = i - 19; j <= i; j++) { hi20 = Math.max(hi20, H[j]); lo20 = Math.min(lo20, L[j]); } for (let j = i - 59; j <= i; j++) hi60 = Math.max(hi60, H[j]);
      let hi20p = 0; for (let j = i - 20; j <= i - 1; j++) hi20p = Math.max(hi20p, H[j]);
      let i5 = 0, t5 = 0, f5 = 0, buyDays = 0, iToday = null;
      for (let j = i - 4; j <= i; j++) { const x = (inst[days[j].d] || {})[code]; if (x) { i5 += x[0] + x[1] + x[2]; t5 += x[1]; f5 += x[0]; if (x[0] + x[1] + x[2] > 0) buyDays++; if (j === i) iToday = x[0] + x[1] + x[2]; } }
      const hasInst = !!inst[days[i].d] && Object.keys(inst[days[i].d]).length > 0;
      const vv = (val[days[i].d] || {})[code] || [], rs = revByDay[i], rv = rs && rs.data[code];
      const f = { code, i, c, o: O[i], h: H[i], l: L[i], chg: (c / Cl[i - 1] - 1) * 100, gap: (O[i] / Cl[i - 1] - 1) * 100,
        ma5: ma(5), ma10: ma(10), ma20, ma60: ma(60), ma5p3: ma(5, 3), ma20p3: ma(20, 3), ma20p5: ma(20, 5), ma60p5: ma(60, 5),
        avgV20, vr: V[i] / avgV20, v5r: (V.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5) / avgV20, turnover: avgV20 * c * 1000,
        rsi: l === 0 ? 100 : 100 - 100 / (1 + g / l), atr: tr / 14 / c * 100, pos: H[i] > L[i] ? (c - L[i]) / (H[i] - L[i]) : .5, locked: H[i] === L[i],
        upShadow: H[i] > L[i] ? (H[i] - Math.max(O[i], c)) / (H[i] - L[i]) : 0, body: (c - O[i]) / Cl[i - 1] * 100,
        r5: (c / Cl[i - 5] - 1) * 100, r20: (c / Cl[i - 20] - 1) * 100, r60: (c / Cl[i - 60] - 1) * 100, hi20, hi20p, lo20, hi60, bias20: (c / ma20 - 1) * 100,
        hasInst, inst5: i5, instR: i5 / avgV20 * 100, trust5: t5, f5, buyDays, iToday,
        pe: vv[0] ?? null, yld: vv[1] ?? null, pb: vv[2] ?? null, revYoY: rv ? rv.yoy : null, revMoM: rv ? rv.mom : null };
      // 結果：隔天開盤進場
      if (i + 1 < N && ok[i + 1]) {
        const o1 = O[i + 1]; f.oc = (Cl[i + 1] / o1 - 1) * 100; f.oh = (H[i + 1] / o1 - 1) * 100; f.gapNext = (o1 / c - 1) * 100;
        for (const h of [5, 10, 20]) { const j = i + h; if (j < N && Cl[j]) f['h' + h] = (Cl[j] / o1 - 1) * 100; }
        // 停損版本：持有到第 h 天，期間收盤跌破停損價就隔天開盤出場（近似用收盤價）
        f.o1 = o1;
      }
      rows[i].push(f);
    }
  }
  const mk = days.map((_, i) => mkt[i] ? Object.assign({}, mkt[i], { breadth: breadthTot[i] ? breadthCnt[i] / breadthTot[i] * 100 : null }) : null);
  return { rows, mk, series };
}

// 交易成本（來回）：手續費 0.1425%×2 約六折＋證交稅（當沖 0.15%、一般 0.3%）
const COST = { day: 0.33, hold: 0.47 };
function evaluate(data, rule, opt) {
  const { rows, mk } = data, { days } = opt, K = opt.k || 3, out = [];
  for (let i = 61; i < rows.length; i++) {
    const m = mk[i]; if (!m) continue;
    if (rule.mkt && !rule.mkt(m)) continue;
    const q = rows[i].filter(r => rule.f(r, m)).sort((a, b) => rule.s(b) - rule.s(a)).slice(0, K);
    for (const r of q) { const ret = rule.ret(r); if (ret == null) continue; out.push({ d: days[i].d, code: r.code, ret, r }); }
  }
  return out;
}
const sum = a => a.reduce((s, x) => s + x, 0);
function stats(trades, periods) {
  const f = ts => { if (!ts.length) return { n: 0 }; const v = ts.map(t => t.ret); const s = v.slice().sort((a, b) => a - b);
    const byDay = {}; for (const t of ts) (byDay[t.d] = byDay[t.d] || []).push(t.ret); const dv = Object.values(byDay).map(a => sum(a) / a.length);
    return { n: v.length, days: dv.length, avg: sum(v) / v.length, med: s[Math.floor(s.length / 2)], win: v.filter(x => x > 0).length / v.length * 100, dayAvg: sum(dv) / dv.length, worst: s[0], p10: s[Math.floor(s.length * .1)] }; };
  const res = { all: f(trades) }; for (const [k, [a, b]] of Object.entries(periods)) res[k] = f(trades.filter(t => t.d >= a && t.d <= b)); return res;
}
const fmt = s => s.n ? `${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}% 勝${s.win.toFixed(0)}% n${s.n}/${s.days}天` : '—';
module.exports = { load, build, evaluate, stats, fmt, COST };
