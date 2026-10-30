// 研究用：檢驗支撐壓力準不準。每檔股票每隔幾天，用當時資料算出價位，再看之後 20 天碰到時是否守住
// 對照組：同樣寬度、同樣距離範圍的隨機價位，用同一套標準判斷，比較兩者差距
const fs = require('fs'), path = require('path');
const E = require('../engine.js'); if (process.env.LVOPT) E.setLevelOpts(JSON.parse(process.env.LVOPT));
const C = path.join(__dirname, '..', 'data', 'cache');
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const days = fs.readdirSync(path.join(C, 'daily')).sort().map(n => ({ d: n.slice(0, 10), q: rd(path.join(C, 'daily', n)) })).filter(x => !x.q.holiday);
const N = days.length, STEP = +(process.env.STEP || 5), FWD = 20, HOLDN = 3, BRK = +(process.env.BRK || 0.01);
const codes = new Set(); for (const x of days) for (const c of Object.keys(x.q)) codes.add(c);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const out = []; // {side, dist, w, labels, cats, rank, shown, touched, held, rand}
// 判斷一個區間 [lo, hi] 在 i 之後的表現
function judge(side, lo, hi, Bf) {
  for (let k = 0; k < Bf.length; k++) {
    const b = Bf[k];
    const touch = side === 'S' ? b.l <= hi : b.h >= lo;
    if (!touch) continue;
    // 碰到後當天起 HOLDN 天內，收盤沒有跌破（站上）區間超過 BRK 就算守住
    let broke = false; for (let j = k; j < Math.min(Bf.length, k + HOLDN + 1); j++) { const cl = Bf[j].c; if (side === 'S' ? cl < lo * (1 - BRK) : cl > hi * (1 + BRK)) { broke = true; break; } }
    if (k + HOLDN >= Bf.length) return { touched: true, held: null };
    return { touched: true, held: !broke, k };
  }
  return { touched: false };
}
for (const code of codes) {
  const S = days.map(x => x.q[code]);
  for (let i = 130; i + FWD < N; i += STEP) {
    // 需要連續 120 天資料、之後 20 天也連續，且沒有除權息等價格斷層
    let ok = true; for (let j = i - 119; j <= i + FWD; j++) { const b = S[j]; if (!b || !b[3]) { ok = false; break; } if (j > i - 119) { const r = (b[0] || b[3]) / S[j - 1][3]; if (r < 0.895 || r > 1.105) { ok = false; break; } } }
    if (!ok) continue;
    const t = S[i]; let sv = 0; for (let j = i - 19; j <= i; j++) sv += S[j][4]; if (sv / 20 * t[3] * 1000 < 2e8) continue;
    const bars = []; for (let j = i - 119; j <= i; j++) { const b = S[j]; bars.push({ d: days[j].d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    const Bf = []; for (let j = i + 1; j <= i + FWD; j++) { const b = S[j]; Bf.push({ h: b[1] || b[3], l: b[2] || b[3], c: b[3] }); }
    let a; try { a = E.analyze({ code, bars }); } catch (e) { continue; }
    const sid = code + i, c = t[3], shown = new Set([...a.st.sup, ...a.st.res].map(b => b.side + b.level));
    for (const b of a.st.bands) {
      const dist = (b.level / c - 1) * 100; if (Math.abs(dist) > 15) continue;
      const r = judge(b.side, b.lo, b.hi, Bf);
      out.push({ sid, n: b.labels.length, k: b.cats.length, d: days[i].d, side: b.side, dist, w: (b.hi - b.lo) / c * 100, labels: b.labels, cats: b.cats, rank: b.rank, shown: shown.has(b.side + b.level), first: (b.side === 'S' ? a.st.sup[0] : a.st.res[0])?.level === b.level, ...r });
      // 隨機對照：同寬度、距離在同樣的 1%～15% 範圍內隨機
      const u = 0.1 + rnd() * 14.9, half = (b.hi - b.lo) / 2, mid = b.side === 'S' ? c * (1 - u / 100) - half : c * (1 + u / 100) + half;
      const rr = judge(b.side, mid - half, mid + half, Bf);
      out.push({ sid, d: days[i].d, side: b.side, dist: b.side === 'S' ? -u : u, w: (b.hi - b.lo) / c * 100, rand: true, ...rr });
    }
  }
}
fs.writeFileSync(process.env.OUT || '/tmp/srtest.json', JSON.stringify(out));
console.log('樣本', out.length);
