// 研究用：強度分數有沒有預測力？每檔每隔 5 個交易日算一次分數，看之後 20 個交易日的超額報酬（隔天開盤進場、相對同日全市場平均）
const fs = require('fs'), path = require('path');
const E = require('../engine.js'), { adjustDays } = require('../lib/adjust.js');
const C = path.join(__dirname, '..', 'data', 'cache');
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
let days = fs.readdirSync(path.join(C, 'daily')).sort().map(n => ({ d: n.slice(0, 10), q: rd(path.join(C, 'daily', n)) })).filter(x => x.q && !x.q.holiday);
days = adjustDays(days, (rd(path.join(__dirname, '..', 'data', 'exright.json')) || {}).ev || {}).days;
const inst = {}, val = {}; for (const x of days) { inst[x.d] = rd(path.join(C, 'inst', x.d + '.json')); val[x.d] = rd(path.join(C, 'val', x.d + '.json')); }
const N = days.length, STEP = 5, H = +(process.env.H || 20), out = [];
for (let i = 130; i + H < N; i += STEP) {
  const rows = [];
  for (const code of Object.keys(days[i].q)) {
    const bars = []; for (let j = i - 119; j <= i; j++) { const b = days[j].q[code]; if (b && b[3]) bars.push({ d: days[j].d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    if (bars.length < 110 || bars.at(-1).d !== days[i].d) continue;
    const tv = bars.slice(-20).reduce((a, b) => a + b.c * b.v * 1000, 0) / 20; if (tv < 2e8) continue;
    const o1 = (days[i + 1].q[code] || [])[0], cH = (days[i + H].q[code] || [])[3]; if (!o1 || !cH) continue;
    const ins = []; for (let j = i - 4; j <= i; j++) { const x = (inst[days[j].d] || {})[code]; if (x) ins.push({ d: days[j].d, f: x[0], t: x[1], dl: x[2] }); }
    const v = (val[days[i].d] || {})[code] || [];
    let a; try { a = E.analyze({ code, bars, inst: ins.length ? ins : undefined, fund: { pe: v[0] ?? null, yld: v[1] ?? null, pb: v[2] ?? null } }); } catch (e) { continue; }
    rows.push({ code, d: days[i].d, idx: a.index, raw: a.raw, pen: a.pen.reduce((s, p) => s + p.pts, 0), dims: a.dims.map(x => x.s), ret: (cH / o1 - 1) * 100 });
  }
  const m = rows.reduce((s, r) => s + r.ret, 0) / (rows.length || 1); rows.forEach(r => { r.x = r.ret - m; out.push(r); });
}
fs.writeFileSync(process.env.OUT || '/tmp/scoretest.json', JSON.stringify(out));
console.log('樣本', out.length, '期間', out[0] && out[0].d, '~', out.at(-1) && out.at(-1).d);
