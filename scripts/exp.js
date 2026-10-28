// 研究用：逐一測試加上某個條件後，名單在各期間的表現（扣成本後）
const R = require('./research.js');
const raw = R.load(), data = R.build(raw), days = raw.days;
const PER = JSON.parse(process.env.PER || JSON.stringify({ '25上': ['2025-01-01', '2025-06-30'], '25下': ['2025-07-01', '2025-12-31'], '26上': ['2026-01-01', '2026-06-30'], '26下': ['2026-07-01', '2026-12-31'] }));
const CAT = process.env.CAT || 'day', K = +(process.env.K || 3);
const S = data.series;
// 持有 h 天、收盤跌破停損就以收盤出場（停損 sl 為 0 表示不設）
const hold = (h, sl = 0, tp = 0) => r => { if (r.o1 == null) return null; const s = S[r.code].Cl; let j = r.i + 1, last = null;
  for (; j <= r.i + h && j < s.length; j++) { if (s[j] == null) break; last = s[j] / r.o1 - 1; if (sl && last <= -sl) break; if (tp && last >= tp) break; }
  return last == null ? null : last * 100 - R.COST.hold; };
const dayRet = r => r.oc == null ? null : r.oc - R.COST.day;

const BASE = {
  day: { f: r => r.c >= r.hi20 * .995 && r.vr >= 1.8 && r.pos >= .7 && r.chg >= 1.5 && r.chg <= 7 && r.r20 <= 25 && r.c > r.ma60 && r.turnover >= 3e8,
    s: r => Math.min(r.vr, 5) * 8 + r.pos * 10 + Math.min(Math.max(r.inst5, 0) / r.avgV20 * 100, 30), ret: dayRet },
  swing: { f: r => r.ma5 > r.ma20 && r.ma5p3 <= r.ma20p3 && r.c > r.ma20 && r.ma20 >= r.ma20p5 && r.r20 >= -5 && r.r20 <= 12 && r.rsi >= 50 && r.rsi <= 68 && r.vr >= 1.2 && r.inst5 > 0,
    s: r => Math.min(r.inst5 / r.avgV20 * 100, 50) + Math.min(r.vr, 3) * 5 + (r.trust5 > 0 ? 10 : 0), ret: hold(10) },
  long: { f: r => r.revYoY != null && r.revYoY >= 15 && r.pe > 0 && r.pe <= 25 && r.yld >= 1.5 && r.c > r.ma60 && r.ma20 > r.ma60 && r.avgV20 >= 500,
    s: r => Math.min(r.revYoY, 100) * 0.4 + (25 - r.pe) + r.yld * 3 + (r.inst5 > 0 ? 5 : 0), ret: hold(20) }
};
const ADD = {
  day: {
    '大盤站上月線': [null, m => m.aboveMa20], '大盤月線上揚': [null, m => m.ma20Up], '多數股站上月線(>50%)': [null, m => m.breadth > 50],
    '乖離月線<=10%': [r => r.bias20 <= 10], '乖離月線<=15%': [r => r.bias20 <= 15], 'RSI<=75': [r => r.rsi <= 75], '收在高點85%以上': [r => r.pos >= .85],
    '上影線<=15%': [r => r.upShadow <= .15], '法人5日買超': [r => r.hasInst && r.inst5 > 0], '法人當日買超': [r => r.hasInst && r.iToday > 0],
    '成交值>=10億': [r => r.turnover >= 1e9], '漲幅<=5%': [r => r.chg <= 5], '漲幅>=3%': [r => r.chg >= 3], '量比<=4': [r => r.vr <= 4], '量比>=2.5': [r => r.vr >= 2.5],
    '近5日漲<=10%': [r => r.r5 <= 10], '實體紅K>=2%': [r => r.body >= 2], '開盤跳空<=2%': [r => r.gap <= 2], '波動>=3%': [r => r.atr >= 3], '創60日新高': [r => r.c >= r.hi60 * .995],
    '月線上揚': [r => r.ma20 > r.ma20p5], '季線上揚': [r => r.ma60 > r.ma60p5]
  },
  swing: {
    '大盤站上月線': [null, m => m.aboveMa20], '大盤站上季線': [null, m => m.aboveMa60], '多數股站上月線(>50%)': [null, m => m.breadth > 50],
    '季線上揚': [r => r.ma60 > r.ma60p5], '站上季線': [r => r.c > r.ma60], '投信買超': [r => r.trust5 > 0], '法人連買>=3天': [r => r.buyDays >= 3], '法人買超>=5%均量': [r => r.instR >= 5],
    '量比>=1.5': [r => r.vr >= 1.5], 'RSI<=62': [r => r.rsi <= 62], '近20日<=8%': [r => r.r20 <= 8], '近60日>0': [r => r.r60 > 0], '營收年增>0': [r => r.revYoY != null && r.revYoY > 0],
    '收在高點70%以上': [r => r.pos >= .7], '成交值>=3億': [r => r.turnover >= 3e8], '本益比<=30': [r => r.pe > 0 && r.pe <= 30]
  },
  long: {
    '大盤站上季線': [null, m => m.aboveMa60], '季線上揚': [r => r.ma60 > r.ma60p5], '營收年增>=25%': [r => r.revYoY >= 25], '營收月增>0': [r => r.revMoM > 0], '本益比<=18': [r => r.pe <= 18],
    '殖利率>=3%': [r => r.yld >= 3], '法人5日買超': [r => r.inst5 > 0], '投信買超': [r => r.trust5 > 0], '乖離月線<=8%': [r => r.bias20 <= 8], '近60日漲<=30%': [r => r.r60 <= 30],
    '成交值>=1億': [r => r.turnover >= 1e8], '股價淨值比<=3': [r => r.pb > 0 && r.pb <= 3], 'RSI<=70': [r => r.rsi <= 70]
  }
};
function run(rule, label, extra) {
  const st = R.stats(R.evaluate(data, rule, { days, k: K }), PER);
  const line = [label.padEnd(16), R.fmt(st.all), ...Object.keys(PER).map(p => `${p} ${st[p].n ? (st[p].avg >= 0 ? '+' : '') + st[p].avg.toFixed(2) + '/' + st[p].win.toFixed(0) + '%/' + st[p].n : '—'}`)].join(' | ');
  console.log(line + (extra || '')); return st;
}
const combine = (base, adds) => ({ f: (r, m) => base.f(r, m) && adds.every(([fr]) => !fr || fr(r)), mkt: m => (!base.mkt || base.mkt(m)) && adds.every(([, fm]) => !fm || fm(m)), s: base.s, ret: base.ret });
module.exports = { R, data, days, PER, BASE, ADD, run, combine, hold, dayRet };
if (require.main === module) {
  const base = BASE[CAT]; console.log(`【${CAT}】每天取前 ${K} 名，扣成本後（平均/勝率/筆數）`);
  const b = run(base, '原規則');
  for (const [k, a] of Object.entries(ADD[CAT])) {
    const st = run(combine(base, [a]), '+' + k);
    const better = Object.keys(PER).filter(p => st[p].n >= 5 && b[p].n && st[p].avg > b[p].avg).length;
    if (better >= 3) console.log('   ↑ 在', better, '個期間變好');
  }
}
