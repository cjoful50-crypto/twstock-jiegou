// 篩選規則（與網站上「名單怎麼選出來的」說明一致）。只用評估當天以前的資料，避免偷看未來
const Engine = require('../engine.js');
const sum = a => a.reduce((s, x) => s + x, 0), avg = a => sum(a) / a.length;
const fmt = x => (x > 0 ? '+' : '') + x.toFixed(1);

/* days: [{d, q:{code:[o,h,l,c,v]}}]（依日期排序），i: 評估日索引
   instByDay: {d: {code:[f,t,dl]}}，valByDay: {d: {code:[pe,yld,pb]}}，rev: {code:{yoy,mom,month}} 或 null（當時還沒有可用營收）
   names: {code:[name, market]} */
function screenAt(days, i, instByDay, valByDay, rev, names) {
  const win = days.slice(Math.max(0, i - 61), i + 1), D = days[i].d;
  const instDays = days.slice(Math.max(0, i - 4), i + 1).map(x => x.d);
  const val = valByDay[D] || {};
  const rows = [];
  for (const code of Object.keys(days[i].q)) {
    const bars = []; for (const x of win) { const b = x.q[code]; if (b && b[3]) bars.push({ d: x.d, o: b[0] || b[3], h: b[1] || b[3], l: b[2] || b[3], c: b[3], v: b[4] || 0 }); }
    const n = bars.length; if (n < 40 || bars.at(-1).d !== D) continue;
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
      ma5: ma(5), ma10: ma(10), ma20: ma(20), ma60: ma(60), ma20p: maPrev(20, 5), ma5p3: maPrev(5, 3), ma20p3: maPrev(20, 3), hi20, avgV20, volRatio: t.v / avgV20, turnover: avgV20 * t.c * 1000, rsi,
      atrPct: avg(tr) / t.c * 100, closePos: t.h > t.l ? (t.c - t.l) / (t.h - t.l) : 0.5, locked: t.h === t.l, ret20: (t.c / C[n - 21] - 1) * 100, high60: Math.max(...bars.map(b => b.h)),
      ins, inst5: sum(ins.map(x => x.f + x.t + x.dl)), trust5: sum(ins.map(x => x.t)),
      fund: { pe: vv[0] ?? null, yld: vv[1] ?? null, pb: vv[2] ?? null, revYoY: rv ? rv.yoy : null, revMoM: rv ? rv.mom : null, revMonth: rv ? rv.month : null } });
  }
  // 隔日當沖觀察（量價突破）：收盤創 20 日新高、量能放大、收在當日高檔，還沒漲過頭
  const day = rows.filter(r => r.ma60 && r.c >= r.hi20 * 0.995 && r.volRatio >= 1.8 && r.closePos >= 0.7 && r.chg >= 1.5 && r.chg <= 7 && r.ret20 <= 25 && r.c > r.ma60 && r.turnover >= 3e8)
    .map(r => Object.assign(r, { score: Math.min(r.volRatio, 5) * 8 + r.closePos * 10 + Math.min(Math.max(r.inst5, 0) / r.avgV20 * 100, 30),
      why: ['收盤創 20 日新高', `量比 ${r.volRatio.toFixed(1)} 倍`, `收在當日高檔（${Math.round(r.closePos * 100)}%）`, `日均成交值 ${(r.turnover / 1e8).toFixed(0)} 億`] }));
  // 短期觀察（剛轉強）：5 日線在近 3 天內剛站上月線，月線走平或向上，漲幅還不大，法人在買
  const swing = rows.filter(r => r.ma60 && r.ma5p3 != null && r.ma5 > r.ma20 && r.ma5p3 <= r.ma20p3 && r.c > r.ma20 && r.ma20 >= r.ma20p && r.ret20 >= -5 && r.ret20 <= 12 && r.rsi >= 50 && r.rsi <= 68 && r.volRatio >= 1.2 && r.inst5 > 0)
    .map(r => Object.assign(r, { score: Math.min(r.inst5 / r.avgV20 * 100, 50) + Math.min(r.volRatio, 3) * 5 + (r.trust5 > 0 ? 10 : 0),
      why: ['5 日線剛站上月線', `近 20 日 ${fmt(r.ret20)}%`, `法人近 5 日買超 ${Math.round(r.inst5).toLocaleString('en-US')} 張`, r.trust5 > 0 ? '投信同步買超' : `量比 ${r.volRatio.toFixed(1)} 倍`] }));
  const longT = rev ? rows.filter(r => r.ma60 && r.fund.revYoY != null && r.fund.revYoY >= 15 && r.fund.pe > 0 && r.fund.pe <= 25 && r.fund.yld >= 1.5 && r.c > r.ma60 && r.ma20 > r.ma60 && r.avgV20 >= 500)
    .map(r => Object.assign(r, { score: Math.min(r.fund.revYoY, 100) * 0.4 + (25 - r.fund.pe) + r.fund.yld * 3 + (r.inst5 > 0 ? 5 : 0),
      why: [`${r.fund.revMonth || '最新'} 營收年增 ${fmt(r.fund.revYoY)}%`, `本益比 ${r.fund.pe}`, `殖利率 ${r.fund.yld}%`, '站上季線且月線在季線之上'] })) : [];

  const used = new Set();
  const top = list => list.sort((a, b) => b.score - a.score).filter(r => !used.has(r.code) && used.add(r.code)).slice(0, 3).map(r => {
    let a = null; try { a = Engine.analyze({ code: r.code, name: r.name, bars: r.bars, inst: r.ins.length ? r.ins : undefined, fund: r.fund }); } catch (e) {}
    return { code: r.code, name: r.name, market: r.market, close: r.c, chg: +r.chg.toFixed(2), why: r.why, index: a ? a.index : null, trend: a ? a.trendLabel : null,
      sup: a && a.st.sup[0] ? a.st.sup[0].level : null, res: a && a.st.res[0] ? a.st.res[0].level : (a && a.st.limitRef) || null };
  });
  return { date: D.replace(/-/g, '/'), universe: rows.length, counts: { day: day.length, swing: swing.length, long: longT.length },
    day: top(day), swing: top(swing), long: rev ? top(longT) : [], longNote: rev ? null : '這一天還沒有可用的月營收資料（歷史回補只能用當時已公布的營收），長期名單不計算。',
    instDate: instDays.filter(d => instByDay[d] && Object.keys(instByDay[d]).length).pop() || null };
}
module.exports = { screenAt };
