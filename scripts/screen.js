// 篩選規則（與網站上「名單怎麼選出來的」說明一致）。只用評估當天以前的資料，避免偷看未來
const Engine = require('../engine.js');
const sum = a => a.reduce((s, x) => s + x, 0), avg = a => sum(a) / a.length;
const fmt = x => (x > 0 ? '+' : '') + x.toFixed(1);

/* days: [{d, q:{code:[o,h,l,c,v]}}]（依日期排序），i: 評估日索引
   instByDay: {d: {code:[f,t,dl]}}，valByDay: {d: {code:[pe,yld,pb]}}，rev: {code:{yoy,mom,month}} 或 null（當時還沒有可用營收）
   names: {code:[name, market]} */
function screenAt(days, i, instByDay, valByDay, rev, names) {
  const win = days.slice(Math.max(0, i - 69), i + 1), D = days[i].d;
  const instDays = days.slice(Math.max(0, i - 4), i + 1).map(x => x.d);
  const val = valByDay[D] || {};
  const rows = [];
  for (const code of Object.keys(days[i].q)) {
    const bars = []; for (const x of win) { const b = x.q[code]; if (b && b[3]) bars.push({ d: x.d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    const n = bars.length; if (n < 66 || bars.at(-1).d !== D) continue;
    const C = bars.map(b => b.c), V = bars.map(b => b.v), t = bars.at(-1), p = bars.at(-2);
    const ma = k => n >= k ? avg(C.slice(-k)) : null, maPrev = (k, back) => n >= k + back ? avg(C.slice(-k - back, -back)) : null;
    const hi20 = Math.max(...bars.slice(-20).map(b => b.h));
    const avgV20 = avg(V.slice(-20)); if (t.c < 10 || avgV20 < 1000) continue;
    let g = 0, l = 0; for (let j = n - 14; j < n; j++) { const df = C[j] - C[j - 1]; if (df > 0) g += df; else l -= df; }
    const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    const tr = bars.slice(-14).map((b, j, a) => { const pc = j ? a[j - 1].c : bars[n - 15].c; return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); });
    const ins = instDays.map(d => { const x = (instByDay[d] || {})[code]; return x ? { d, f: x[0], t: x[1], dl: x[2] } : null; }).filter(Boolean);
    const vv = val[code] || [], rv = rev && rev[code];
    rows.push({ code, name: (names[code] || [])[0] || code, market: (names[code] || [])[1] || '', bars, c: t.c, chg: (t.c / p.c - 1) * 100,
      ma5: ma(5), ma10: ma(10), ma20: ma(20), ma60: ma(60), ma20p: maPrev(20, 5), ma60p: maPrev(60, 5), ma5p3: maPrev(5, 3), ma20p3: maPrev(20, 3), hi20, avgV20, volRatio: t.v / avgV20, turnover: avgV20 * t.c * 1000, rsi,
      atrPct: avg(tr) / t.c * 100, closePos: t.h > t.l ? (t.c - t.l) / (t.h - t.l) : 0.5, locked: t.h === t.l, ret20: (t.c / C[n - 21] - 1) * 100, high60: Math.max(...bars.slice(-60).map(b => b.h)),
      ins, inst5: sum(ins.map(x => x.f + x.t + x.dl)), trust5: sum(ins.map(x => x.t)), buyDays: ins.filter(x => x.f + x.t + x.dl > 0).length,
      fund: { pe: vv[0] ?? null, yld: vv[1] ?? null, pb: vv[2] ?? null, revYoY: rv ? rv.yoy : null, revMoM: rv ? rv.mom : null, revMonth: rv ? rv.month : null } });
  }
  // 規則依 2025-01～2026-10 回測選出（隔天開盤進場、扣交易成本，四個半年期間都贏過同期全市場平均）
  // 共同條件：日均成交值 10 億以上、近 5 日至少 3～4 天法人合計買超
  const big = rows.filter(r => r.ma60 && r.ma60p && r.turnover >= 1e9 && !r.locked);
  const trend = r => r.c > r.ma20 && r.ma20 > r.ma60 && r.ma20 > r.ma20p && r.ma60 > r.ma60p;
  const instR = r => r.inst5 / r.avgV20 * 100;
  const instTxt = r => `近 5 日有 ${r.buyDays} 天法人買超，合計 ${Math.round(r.inst5).toLocaleString('en-US')} 張`;
  // 短線（約 1 週）：多頭排列、股價在 60 日高點附近、法人連續買
  const day = big.filter(r => trend(r) && r.c >= r.high60 * 0.95 && r.buyDays >= 3)
    .map(r => Object.assign({}, r, { score: instR(r),
      why: ['均線多頭排列（月線、季線都向上）', `距 60 日高點 ${((r.c / r.high60 - 1) * 100).toFixed(1)}%`, instTxt(r), `日均成交值 ${(r.turnover / 1e8).toFixed(0)} 億`] }));
  // 波段（約 1 個月）：多頭排列中拉回月線附近（離月線 0～8%），法人仍連續買
  const swing = big.filter(r => trend(r) && r.c >= r.ma20 && r.c <= r.ma20 * 1.08 && r.buyDays >= 4)
    .map(r => Object.assign({}, r, { score: Math.log10(r.turnover) * 10 + Math.min(instR(r), 30),
      why: ['均線多頭排列', `拉回到月線附近（離月線 ${fmt((r.c / r.ma20 - 1) * 100)}%）`, instTxt(r), `日均成交值 ${(r.turnover / 1e8).toFixed(0)} 億`] }));
  // 長線（約 3 個月）：站上向上的季線、本益比 12～40、法人連續買
  const longT = big.filter(r => r.c > r.ma60 && r.ma60 > r.ma60p && r.fund.pe >= 12 && r.fund.pe <= 40 && r.buyDays >= 3)
    .map(r => Object.assign({}, r, { score: Math.log10(r.turnover) * 10 + Math.min(instR(r), 30),
      why: ['站上季線，且季線向上', `本益比 ${r.fund.pe}`, instTxt(r), r.fund.revYoY != null ? `${r.fund.revMonth || '最新'} 營收年增 ${fmt(r.fund.revYoY)}%` : `日均成交值 ${(r.turnover / 1e8).toFixed(0)} 億`] }));

  const top = list => list.sort((a, b) => b.score - a.score).slice(0, 10).map(r => {
    let a = null; try { a = Engine.analyze({ code: r.code, name: r.name, bars: r.bars, inst: r.ins.length ? r.ins : undefined, fund: r.fund }); } catch (e) {}
    return { code: r.code, name: r.name, market: r.market, close: r.c, chg: +r.chg.toFixed(2), why: r.why, index: a ? a.index : null, trend: a ? a.trendLabel : null,
      sup: a && a.st.sup[0] ? a.st.sup[0].level : null, res: a && a.st.res[0] ? a.st.res[0].level : (a && a.st.limitRef) || null };
  });
  return { date: D.replace(/-/g, '/'), universe: rows.length, counts: { day: day.length, swing: swing.length, long: longT.length },
    day: top(day), swing: top(swing), long: top(longT), longNote: null,
    instDate: instDays.filter(d => instByDay[d] && Object.keys(instByDay[d]).length).pop() || null };
}
module.exports = { screenAt };
