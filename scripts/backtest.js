// 本機回測：用 data/cache 的歷史資料比較多組名單規則（不影響網站）
const fs = require('fs'), path = require('path');
const C = path.join(__dirname, '..', 'data', 'cache');
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const taiex = rd(path.join(C, 'taiex.json'));
const days = fs.readdirSync(path.join(C, 'daily')).sort().map(n => ({ d: n.slice(0, 10), q: rd(path.join(C, 'daily', n)) })).filter(x => !x.q.holiday);
const inst = {}; for (const n of fs.readdirSync(path.join(C, 'inst'))) inst[n.slice(0, 10)] = rd(path.join(C, 'inst', n));
const sum = a => a.reduce((s, x) => s + x, 0), avg = a => sum(a) / a.length;

function features(i) {
  const D = days[i].d, win = days.slice(Math.max(0, i - 61), i + 1), idays = days.slice(Math.max(0, i - 4), i + 1).map(x => x.d), out = [];
  for (const code of Object.keys(days[i].q)) {
    const B = []; for (const x of win) { const b = x.q[code]; if (b && b[3]) B.push({ o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    const n = B.length; if (n < 61) continue;
    const Cl = B.map(b => b.c), V = B.map(b => b.v), t = B[n - 1], p = B[n - 2];
    const ma = (k, back = 0) => avg(Cl.slice(n - k - back, n - back));
    const avgV20 = avg(V.slice(-20)); if (t.c < 10 || avgV20 < 1000) continue;
    let g = 0, l = 0; for (let j = n - 14; j < n; j++) { const df = Cl[j] - Cl[j - 1]; if (df > 0) g += df; else l -= df; }
    const tr = B.slice(-14).map((b, j, a) => { const pc = j ? a[j - 1].c : B[n - 15].c; return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); });
    const ins = idays.map(d => (inst[d] || {})[code]).filter(Boolean);
    out.push({ code, c: t.c, chg: (t.c / p.c - 1) * 100, ma5: ma(5), ma10: ma(10), ma20: ma(20), ma60: ma(60), ma5p3: ma(5, 3), ma20p3: ma(20, 3), ma20p5: ma(20, 5), ma60p5: ma(60, 1),
      avgV20, vr: t.v / avgV20, turnover: avgV20 * t.c * 1000, rsi: l === 0 ? 100 : 100 - 100 / (1 + g / l), atr: avg(tr) / t.c * 100,
      pos: t.h > t.l ? (t.c - t.l) / (t.h - t.l) : .5, locked: t.h === t.l, r20: (t.c / Cl[n - 21] - 1) * 100, r5: (t.c / Cl[n - 6] - 1) * 100,
      hi60: Math.max(...B.map(b => b.h)), hi20: Math.max(...B.slice(-20).map(b => b.h)), lo20: Math.min(...B.slice(-20).map(b => b.l)),
      inst5: sum(ins.map(x => x[0] + x[1] + x[2])), f5: sum(ins.map(x => x[0])), t5: sum(ins.map(x => x[1])) });
  }
  return out;
}
const RULES = {
  '原當沖': { f: r => r.turnover >= 5e8 && r.atr >= 3 && r.vr >= 1.5 && r.chg >= 2 && r.chg <= 9.5 && !r.locked && r.pos >= .7 && r.c > r.ma5, s: r => Math.min(r.vr, 5) * 10 + r.atr * 3 + r.pos * 10 + r.chg },
  '原短期': { f: r => r.c > r.ma5 && r.ma5 > r.ma10 && r.ma10 > r.ma20 && r.ma20 > r.ma20p5 && r.rsi >= 55 && r.rsi <= 78 && r.r20 >= 3 && r.r20 <= 30 && r.vr >= 1 && r.inst5 > 0 && r.c >= r.hi60 * .92, s: r => Math.min(r.inst5 / r.avgV20 * 100, 50) + (r.rsi - 50) + Math.min(r.vr, 3) * 5 + (r.t5 > 0 ? 10 : 0) },
  // 剛轉強：MA5 近 3 日內上穿 MA20、還沒漲多
  '剛轉強': { f: r => r.ma5 > r.ma20 && r.ma5p3 <= r.ma20p3 && r.c > r.ma20 && r.ma20 >= r.ma20p5 && r.r20 >= -5 && r.r20 <= 12 && r.rsi >= 50 && r.rsi <= 68 && r.vr >= 1.2 && r.inst5 > 0, s: r => Math.min(r.inst5 / r.avgV20 * 100, 50) + Math.min(r.vr, 3) * 5 + (r.t5 > 0 ? 10 : 0) },
  // 多頭回檔：長線向上、拉回月線附近、法人仍在買
  '多頭回檔': { f: r => r.ma20 > r.ma60 && r.ma60 >= r.ma60p5 && r.c > r.ma60 && r.c <= r.ma20 * 1.03 && r.c >= r.ma20 * .97 && r.rsi >= 40 && r.rsi <= 58 && r.inst5 > 0 && r.turnover >= 2e8, s: r => Math.min(r.inst5 / r.avgV20 * 100, 50) + (r.t5 > 0 ? 10 : 0) - Math.abs(r.c / r.ma20 - 1) * 100 },
  // 量價突破：創 20 日新高、量增、收高
  '量價突破': { f: r => r.c >= r.hi20 * .995 && r.vr >= 1.8 && r.pos >= .7 && r.chg >= 1.5 && r.chg <= 7 && r.r20 <= 25 && r.c > r.ma60 && r.turnover >= 3e8, s: r => Math.min(r.vr, 5) * 8 + r.pos * 10 + Math.min(r.inst5 / r.avgV20 * 100, 30) },
  // 隔日當沖：盤後強勢但不過熱，給隔日開盤買、收盤賣用
  '隔日當沖候選': { f: r => r.turnover >= 5e8 && r.atr >= 3 && r.vr >= 1.3 && r.chg >= .5 && r.chg <= 4 && r.pos >= .8 && r.c > r.ma20 && r.r5 <= 8, s: r => Math.min(r.vr, 4) * 8 + r.atr * 3 + r.pos * 10 }
};
const H = [1, 5, 10, 20];
const res = {};
for (const k of Object.keys(RULES)) res[k] = { top: [], all: [] };
for (let i = 61; i < days.length; i++) {
  const F = features(i);
  for (const [k, R] of Object.entries(RULES)) {
    const q = F.filter(R.f).sort((a, b) => R.s(b) - R.s(a));
    const rec = r => { const o = { d: days[i].d, code: r.code }; for (const h of H) { const j = i + h; if (j < days.length) { const c1 = (days[j].q[r.code] || [])[3]; if (c1) o['r' + h] = (c1 / r.c - 1) * 100; const t0 = taiex[days[i].d], t1 = taiex[days[j].d]; if (t0 && t1) o['m' + h] = (t1 / t0 - 1) * 100; } }
      if (i + 1 < days.length) { const nb = days[i + 1].q[r.code]; if (nb && nb[0]) o.oc = (nb[3] / nb[0] - 1) * 100; } return o; };
    q.slice(0, 3).forEach(r => res[k].top.push(rec(r))); q.forEach(r => res[k].all.push(rec(r)));
  }
}
const st = (rows, key, mkey) => { const v = rows.filter(r => r[key] != null); if (!v.length) return '—'; const a = avg(v.map(r => r[key])), w = v.filter(r => r[key] > 0).length / v.length * 100, m = mkey ? avg(v.filter(r => r[mkey] != null).map(r => r[mkey])) : null;
  return `${a >= 0 ? '+' : ''}${a.toFixed(2)}% 勝${w.toFixed(0)}%${m != null ? ` 超${(a - m >= 0 ? '+' : '')}${(a - m).toFixed(2)}` : ''} n${v.length}`; };
console.log('期間', days[61].d, '~', days.at(-1).d);
for (const [k, r] of Object.entries(res)) {
  const days_ = new Set(r.top.map(x => x.d)).size;
  console.log(`\n【${k}】出現 ${days_} 天`);
  for (const g of ['top', 'all']) console.log(` ${g === 'top' ? '前3名' : '全部符合'}: 隔日開收 ${st(r[g], 'oc')} | ` + H.map(h => `${h}日 ${st(r[g], 'r' + h, 'm' + h)}`).join(' | '));
}
// 穩定度：前後兩段期間分開看
if (process.env.SPLIT) {
  const mid = days[Math.floor((61 + days.length) / 2)].d;
  for (const k of ['原短期', '剛轉強', '多頭回檔', '量價突破', '原當沖']) for (const [lab, f] of [['前半', x => x.d < mid], ['後半', x => x.d >= mid]]) {
    const rows = res[k].top.filter(f); console.log(`${k} ${lab}: 隔日開收 ${st(rows, 'oc')} | 5日 ${st(rows, 'r5', 'm5')} | 10日 ${st(rows, 'r10', 'm10')}`);
  }
}
