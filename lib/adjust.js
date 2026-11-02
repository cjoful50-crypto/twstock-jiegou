// 還原權值：把除權息、減資、分割之前的價格乘上調整係數，讓價格前後可比
// events：[[生效日, 係數], ...]（係數 = 參考價 ÷ 前一日收盤）；生效日之前（不含）的價格乘上係數
// 另外，若出現超過漲跌幅限制的跳空（開盤相對前收超過 ±10.5%）且當天沒有事件，視為未收錄的公司事件，以開盤 ÷ 前收估計係數
const r = x => Math.round(x * 10000) / 10000;
function adjustBars(bars, events) {
  if (!bars || bars.length < 2) return bars;
  const ev = (events || []).filter(e => e[0] > bars[0].d && e[0] <= bars.at(-1).d).map(e => e.slice());
  const evDays = new Set(ev.map(e => e[0]));
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].c, o = bars[i].o || bars[i].c; if (!p || !o || evDays.has(bars[i].d)) continue;
    const g = o / p; if (g < 0.895 || g > 1.105) ev.push([bars[i].d, g]);
  }
  if (!ev.length) return bars;
  ev.sort((a, b) => a[0].localeCompare(b[0]));
  const out = new Array(bars.length); let f = 1, vf = 1, k = ev.length - 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    while (k >= 0 && ev[k][0] > b.d) { f *= ev[k][1]; if (Math.abs(1 - ev[k][1]) > 0.05) vf *= ev[k][1]; k--; }
    out[i] = f === 1 ? b : Object.assign({}, b, { o: r(b.o * f), h: r(b.h * f), l: r(b.l * f), c: r(b.c * f), v: Math.round(b.v / vf) });
  }
  return out;
}
module.exports = { adjustBars };
// 整個市場的每日行情（days: [{d, q:{code:[o,h,l,c,v]}}]）一次還原，回傳新的 days（沒變動的股票共用原資料）
function adjustDays(days, events) {
  const out = days.map(x => ({ d: x.d, q: x.q })), codes = new Set(); for (const x of days) for (const c of Object.keys(x.q)) codes.add(c);
  let n = 0;
  for (const code of codes) {
    const idx = [], bars = [];
    days.forEach((x, i) => { const b = x.q[code]; if (b && b[3]) { idx.push(i); bars.push({ d: x.d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); } });
    const adj = adjustBars(bars, events && events[code]); if (adj === bars) continue; n++;
    adj.forEach((b, k) => { if (b === bars[k]) return; const i = idx[k]; if (out[i].q === days[i].q) out[i].q = Object.assign({}, days[i].q); out[i].q[code] = [b.o, b.h, b.l, b.c, b.v]; });
  }
  return { days: out, n };
}
module.exports.adjustDays = adjustDays;
