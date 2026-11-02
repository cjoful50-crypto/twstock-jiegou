// 每日所有股票的支撐壓力（給「選股與庫存」頁直接顯示，不必逐檔進個股頁）
// 輸出 data/levels.json：{ date, s: { code: [支撐1, 強度, 支撐2, 強度, 壓力1, 強度, 壓力2, 強度] } }，強度 1～4（弱～極強）
const fs = require('fs'), path = require('path');
const Engine = require('../engine.js');
function buildLevels(days, instByDay) {
  const i = days.length - 1, D = days[i].d, win = days.slice(Math.max(0, i - 119), i + 1), out = {};
  const instDays = days.slice(Math.max(0, i - 4), i + 1).map(x => x.d);
  for (const code of Object.keys(days[i].q)) {
    const bars = []; for (const x of win) { const b = x.q[code]; if (b && b[3]) bars.push({ d: x.d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    if (bars.length < 40 || bars.at(-1).d !== D) continue;
    const inst = instDays.map(d => { const x = (instByDay[d] || {})[code]; return x ? { d, f: x[0], t: x[1], dl: x[2] } : null; }).filter(Boolean);
    let a; try { a = Engine.analyze({ code, bars, inst: inst.length ? inst : undefined }); } catch (e) { continue; }
    const g = b => b ? [b.level, b.rank] : [null, null];
    out[code] = [...g(a.st.sup[0]), ...g(a.st.sup[1]), ...g(a.st.res[0]), ...g(a.st.res[1])];
  }
  return { date: D, s: out };
}
module.exports = { buildLevels };
if (require.main === module) {
  const C = path.join(__dirname, '..', 'data', 'cache'), rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const days = fs.readdirSync(path.join(C, 'daily')).sort().slice(-180).map(n => ({ d: n.slice(0, 10), q: rd(path.join(C, 'daily', n)) })).filter(x => x.q && !x.q.holiday);
  const inst = {}; for (const x of days.slice(-5)) inst[x.d] = rd(path.join(C, 'inst', x.d + '.json')) || {};
  const r = buildLevels(days, inst); fs.writeFileSync(path.join(__dirname, '..', 'data', 'levels.json'), JSON.stringify(r));
  console.log(r.date, Object.keys(r.s).length, '檔', r.s['2330']);
}
