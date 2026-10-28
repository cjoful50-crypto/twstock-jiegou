/* 盤後結構室 分析引擎：純函式，輸入日K與籌碼摘要，輸出所有頁面要顯示的結果 */
const Engine = (() => {
  const tickOf = p => p < 10 ? .01 : p < 50 ? .05 : p < 100 ? .1 : p < 500 ? .5 : p < 1000 ? 1 : 5;
  const rt = (p, mode) => { const t = tickOf(p); const f = mode === 'd' ? Math.floor : mode === 'u' ? Math.ceil : Math.round; return +(f(p / t + 1e-9) * t).toFixed(2); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = a => a.reduce((s, x) => s + x, 0);
  const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : sum(a.slice(i - n + 1, i + 1)) / n);
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map(x => e = e == null ? x : x * k + e * (1 - k)); };
  const pct = (a, b) => (a / b - 1) * 100;

  // RSI 採 14 日簡單平均（Cutler 法），與多數台股看盤網站一致
  function rsi(c, n = 14) {
    return c.map((_, i) => {
      if (i < n) return null; let g = 0, l = 0;
      for (let j = i - n + 1; j <= i; j++) { const d = c[j] - c[j - 1]; if (d > 0) g += d; else l -= d; }
      return l === 0 ? 100 : 100 - 100 / (1 + g / l);
    });
  }
  function kd(h, l, c, n = 9) {
    let K = 50, D = 50; const ks = [], ds = [];
    for (let i = 0; i < c.length; i++) {
      const lo = Math.min(...l.slice(Math.max(0, i - n + 1), i + 1)), hi = Math.max(...h.slice(Math.max(0, i - n + 1), i + 1));
      const rsv = hi === lo ? 50 : (c[i] - lo) / (hi - lo) * 100;
      K = K * 2 / 3 + rsv / 3; D = D * 2 / 3 + K / 3; ks.push(K); ds.push(D);
    }
    return { k: ks, d: ds };
  }
  function atr(h, l, c, n = 14) {
    const tr = c.map((_, i) => i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    let a = sum(tr.slice(0, n)) / n; for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n; return a;
  }

  /* 籌碼與法人摘要：有逐日資料就自己算，沒有就用手填摘要 */
  function summarizeFlows(s) {
    const out = { inst: null, chip: null };
    if (s.inst && s.inst.length) {
      const last5 = s.inst.slice(-5), t = s.inst.at(-1);
      let streak = 0; const sg = Math.sign(t.f);
      for (let i = s.inst.length - 1; i >= 0 && sg !== 0 && Math.sign(s.inst[i].f) === sg; i--) streak += sg;
      out.inst = { f5: sum(last5.map(x => x.f)), t5: sum(last5.map(x => x.t)), d5: sum(last5.map(x => x.dl)), fToday: t.f, tToday: t.t, dToday: t.dl, streak, date: t.d };
    } else if (s.instSum && ['f5', 't5', 'd5'].some(k => s.instSum[k] != null)) {
      out.inst = Object.assign({ f5: 0, t5: 0, d5: 0, fToday: null, tToday: null, dToday: null, streak: 0 }, s.instSum);
    }
    const ch = {};
    if (s.margin && s.margin.length >= 2) {
      const a = s.margin[Math.max(0, s.margin.length - 6)], b = s.margin.at(-1);
      ch.marginChg = pct(b.mb, a.mb); ch.shortChg = a.sb ? pct(b.sb, a.sb) : 0; ch.marginBal = b.mb; ch.shortBal = b.sb; ch.ratio = b.mb ? b.sb / b.mb * 100 : null;
    } else if (s.chipSum && s.chipSum.marginChg != null) ch.marginChg = s.chipSum.marginChg;
    if (s.sbl && s.sbl.length >= 2) {
      const a = s.sbl[Math.max(0, s.sbl.length - 6)], b = s.sbl.at(-1);
      ch.sblChg = pct(b.bal, a.bal); ch.sblBal = b.bal; ch.sblSell5 = sum(s.sbl.slice(-5).map(x => x.sell)); ch.sblRet5 = sum(s.sbl.slice(-5).map(x => x.ret));
    } else if (s.chipSum && s.chipSum.sblChg != null) ch.sblChg = s.chipSum.sblChg;
    if (Object.keys(ch).length) out.chip = ch;
    return out;
  }

  /* 結構價位偵測 */
  function structures(B, ind, flows) {
    const n = B.length, c = B.at(-1).c, cands = [];
    const add = (p, label, cat) => { if (p > c * 0.75 && p < c * 1.3 && Math.abs(p - c) / c >= 0.01) cands.push({ p, label, cat }); };
    const from = Math.max(1, n - 120);
    // 波段高低點：左 3 根、右至少 1 根（最多 3 根）確認
    const ph = [], pl = [];
    for (let i = from; i < n - 1; i++) {
      const L = B.slice(Math.max(0, i - 3), i), R = B.slice(i + 1, Math.min(n, i + 4));
      if (L.every(b => b.h <= B[i].h) && R.every(b => b.h < B[i].h)) ph.push(i);
      if (L.every(b => b.l >= B[i].l) && R.every(b => b.l > B[i].l)) pl.push(i);
    }
    const lastPeakAbove = [...ph].reverse().find(i => B[i].h > c);
    ph.forEach(i => add(B[i].h, i === lastPeakAbove ? '前波高點' : '波段高點', '價格'));
    pl.forEach(i => add(B[i].l, '波段低點', '價格'));
    // 均線
    [['MA5', ind.ma5], ['MA10', ind.ma10], ['MA20', ind.ma20], ['MA60', ind.ma60]].forEach(([k, a]) => { const v = a.at(-1); if (v != null) add(v, v > c ? k + ' 反壓' : k, '均線'); });
    // 未回補缺口
    for (let i = Math.max(1, n - 60); i < n; i++) {
      if (B[i].l > B[i - 1].h) { // 跳空上漲，上緣 = 當日低
        let top = B[i].l; const bot = B[i - 1].h;
        for (let j = i + 1; j < n; j++) top = Math.min(top, B[j].l);
        if (top > bot && top < c) add(top, '缺口上緣', '價格');
      } else if (B[i].h < B[i - 1].l) { // 跳空下跌，下緣 = 當日高
        let bot = B[i].h; const top = B[i - 1].l;
        for (let j = i + 1; j < n; j++) bot = Math.max(bot, B[j].h);
        if (bot < top && bot > c) add(bot, '缺口下緣', '價格');
      }
    }
    // 爆量 K：成交量 ≥ 前 20 日均量 2 倍
    for (let i = Math.max(20, n - 60); i < n; i++) {
      const av = sum(B.slice(i - 20, i).map(b => b.v)) / 20;
      if (B[i].v >= av * 2) { add(B[i].h, '爆量 K 高點', '量能'); add(B[i].c, '爆量 K 收盤', '量能'); add(B[i].l, '爆量 K 低點', '量能'); }
    }
    // 成交量分布：近 60 日，24 格，取量最大的 3 格
    const W = B.slice(-60), lo = Math.min(...W.map(b => b.l)), hi = Math.max(...W.map(b => b.h)), bins = 24, bw = (hi - lo) / bins || 1, vp = Array(bins).fill(0);
    W.forEach(b => { const a = Math.floor((b.l - lo) / bw), z = Math.min(bins - 1, Math.floor((b.h - lo) / bw)); for (let k = a; k <= z; k++) vp[k] += b.v / (z - a + 1); });
    vp.map((v, k) => [v, k]).sort((x, y) => y[0] - x[0]).slice(0, 3).forEach(([, k]) => { const mid = lo + bw * (k + .5); add(mid, mid > c ? '大量成交套牢區' : '大量成交支撐區', '量能'); });
    // 趨勢線：最近兩個墊高的低點 / 最近兩個降低的高點，延伸到今天
    const tl = (idx, key, up) => { if (idx.length < 2) return; const [i1, i2] = idx.slice(-2); const y1 = B[i1][key], y2 = B[i2][key]; if (up ? y2 <= y1 : y2 >= y1) return; const v = y2 + (y2 - y1) / (i2 - i1) * (n - 1 - i2); add(v, up ? '上升趨勢線' : '下降趨勢線', '價格'); };
    tl(pl.filter(i => i >= n - 60), 'l', true); tl(ph.filter(i => i >= n - 60), 'h', false);

    // 群聚合併
    const tol = Math.max(c * 0.009, ind.atr * 0.3);
    const groups = [];
    const grp = list => { const gs = []; list.sort((a, b) => a.p - b.p); for (const x of list) { const g = gs.at(-1); if (g && x.p - g.at(-1).p <= tol && x.p - g[0].p <= tol * 2.5) g.push(x); else gs.push([x]); } return gs; };
    groups.push(...grp(cands.filter(x => x.p < c)), ...grp(cands.filter(x => x.p > c)));
    let bands = groups.map(g => {
      const lo = Math.min(...g.map(x => x.p)), hi = Math.max(...g.map(x => x.p));
      const side = hi < c ? 'S' : 'R';
      const labels = [...new Set(g.map(x => x.label))], cats = [...new Set(g.map(x => x.cat))];
      const level = side === 'S' ? rt(hi) : rt(lo);
      return { side, lo: rt(lo), hi: rt(hi), level, labels, cats, dist: pct(level, c) };
    }).filter(b => b.side === 'S' ? b.level < c : b.level > c);
    // 籌碼訊號掛到最近的壓力 / 支撐
    const R = bands.filter(b => b.side === 'R').sort((a, b) => a.level - b.level), S = bands.filter(b => b.side === 'S').sort((a, b) => b.level - a.level);
    const ch = flows.chip, ins = flows.inst;
    if (R[0] && ch) { if (ch.sblChg != null && ch.sblChg > 3) { R[0].labels.push('借券賣出壓力'); R[0].cats.push('籌碼'); } if (ch.marginChg != null && ch.marginChg > 3 && ind.chg20 < 0) { R[0].labels.push('融資套牢壓力'); R[0].cats.push('籌碼'); } }
    if (S[0] && ins && ins.f5 + ins.t5 > 0) { S[0].labels.push('法人承接'); S[0].cats.push('籌碼'); }
    bands.forEach(b => { b.cats = [...new Set(b.cats)]; const k = b.cats.length, s = b.labels.length; b.strength = (k >= 4 || s >= 5) ? '極強' : (k >= 3 || s >= 4) ? '強' : (k >= 2 || s >= 2) ? '中' : '弱'; b.rank = { 弱: 1, 中: 2, 強: 3, 極強: 4 }[b.strength]; });

    // 支撐：0–10% 近端，10–20% 中期，超過 20% 不列
    const sup = S.filter(b => -b.dist <= 20).slice(0, 2).map(b => Object.assign(b, { tier: -b.dist <= 10 ? '近端' : '中期' }));
    // 壓力：第一道最近；第二道取下一個獨立結構；超過 +10% 標中期
    let res = R.slice(0, 2).map(b => Object.assign(b, { tier: b.dist <= 10 ? '近端' : '中期' }));
    let limitRef = null;
    const allHigh = Math.max(...B.map(b => b.h));
    if (!res.length && c >= allHigh * 0.995) limitRef = rt(B.at(-1).c * 1.1, 'd');
    return { sup, res, limitRef, bands, tol };
  }

  function analyze(stock) {
    const B = stock.bars, n = B.length;
    if (n < 30) throw new Error('至少需要 30 個交易日的日K資料才能計算（目前 ' + n + ' 筆）');
    const C = B.map(b => b.c), H = B.map(b => b.h), L = B.map(b => b.l), V = B.map(b => b.v);
    const ma5 = sma(C, 5), ma10 = sma(C, 10), ma20 = sma(C, 20), ma60 = sma(C, 60);
    const r = rsi(C), k = kd(H, L, C), dif = ema(C, 12).map((x, i) => x - ema(C, 26)[i]), dea = ema(dif, 9), hist = dif.map((x, i) => x - dea[i]);
    const t = B.at(-1), p = B.at(-2), c = t.c;
    const avgV20 = sum(V.slice(-20)) / 20, volRatio = t.v / avgV20;
    const ind = {
      ma5, ma10, ma20, ma60, rsi: r.at(-1), k: k.k.at(-1), d: k.d.at(-1), dif: dif.at(-1), dea: dea.at(-1), hist: hist.at(-1), histPrev: hist.at(-2),
      atr: atr(H, L, C), avgV20, volRatio, chg: c - p.c, chgPct: pct(c, p.c), chg20: n > 20 ? pct(c, C[n - 21]) : 0,
      low20: Math.min(...L.slice(-20)), high20: Math.max(...H.slice(-20)), ma20Slope: ma20.at(-1) - ma20.at(-6)
    };
    const flows = summarizeFlows(stock);
    const st = structures(B, ind, flows);

    /* 五面向評分，每一項都留下加減分理由 */
    const mk = () => ({ items: [], add(label, pts) { this.items.push({ label, pts: Math.round(pts) }); } });
    const m5 = ma5.at(-1), m20 = ma20.at(-1), m60 = ma60.at(-1);
    // 趨勢
    const T = mk();
    T.add(c > m5 ? '收盤站上 MA5' : '收盤跌破 MA5', c > m5 ? 5 : -5);
    T.add(c > m20 ? '收盤站上 MA20' : '收盤低於 MA20', c > m20 ? 16 : -16);
    if (m60 != null) T.add(c > m60 ? '收盤站上 MA60（季線）' : '收盤低於 MA60（季線）', c > m60 ? 8 : -8);
    T.add(ind.ma20Slope > 0 ? 'MA20 上彎' : 'MA20 下彎', ind.ma20Slope > 0 ? 6 : -6);
    if (m60 != null && m5 > m20 && m20 > m60) T.add('均線多頭排列', 8); else if (m60 != null && m5 < m20 && m20 < m60) T.add('均線空頭排列', -8);
    T.add(ind.hist > 0 ? 'MACD 柱狀體翻正' : (ind.hist > ind.histPrev ? 'MACD 柱狀體為負但收斂' : 'MACD 柱狀體擴大為負'), ind.hist > 0 ? 5 : ind.hist > ind.histPrev ? 0 : -5);
    T.add('近 20 日漲跌 ' + ind.chg20.toFixed(1) + '%', clamp(ind.chg20 * 0.5, -8, 3));
    if (ind.rsi < 25) T.add('RSI 低於 25，短線超賣', 4);
    // 量價
    const VP = mk(); const up = t.c >= p.c;
    if (up && volRatio > 1.2) VP.add('價漲量增', 12); else if (up && volRatio < 0.8) VP.add('價漲量縮', -4); else if (!up && volRatio > 1.2) VP.add('價跌量增', -12); else if (!up && volRatio < 0.8) VP.add('價跌量縮', 4); else VP.add('量能持平', 0);
    let obv = 0; const obvA = B.map((b, i) => obv += i === 0 ? 0 : Math.sign(b.c - B[i - 1].c) * b.v);
    const obvSlope = obvA.at(-1) - obvA.at(-11);
    VP.add(obvSlope > 0 ? '近 10 日 OBV 上升' : '近 10 日 OBV 下降', obvSlope > 0 ? 10 : -10);
    const w = B.slice(-20); let uv = 0, tv = 0; w.forEach((b, i) => { const prev = i ? w[i - 1].c : B[n - 21]?.c ?? b.o; tv += b.v; if (b.c >= prev) uv += b.v; });
    VP.add('近 20 日上漲日成交量占 ' + Math.round(uv / tv * 100) + '%', (uv / tv - 0.5) * 40);
    const v5 = sum(V.slice(-5)) / 5; VP.add(v5 > avgV20 ? '近 5 日量能高於月均量' : '近 5 日量能低於月均量', v5 > avgV20 ? (up ? 4 : -4) : 0);
    // 法人
    const I = mk(), fi = flows.inst; let instOk = !!fi;
    if (fi) {
      const tot5 = fi.f5 + fi.t5 + fi.d5, ratio = tot5 / avgV20;
      I.add('三大法人近 5 日合計 ' + fmtInt(tot5) + ' 張（約 ' + (ratio * 100).toFixed(0) + '% 日均量）', clamp(ratio * 60, -30, 30));
      if (fi.t5) I.add(fi.t5 > 0 ? '投信近 5 日買超' : '投信近 5 日賣超', fi.t5 > 0 ? 6 : -6);
      if (fi.streak) I.add('外資連續' + (fi.streak > 0 ? '買超 ' : '賣超 ') + Math.abs(fi.streak) + ' 日', clamp(fi.streak * 2, -8, 8));
      if (fi.fToday != null) I.add(fi.fToday > 0 ? '最新一日外資買超' : '最新一日外資賣超', fi.fToday > 0 ? 5 : -5);
    }
    // 籌碼
    const CH = mk(), cs = flows.chip; let chipOk = !!cs;
    if (cs) {
      if (cs.marginChg != null) CH.add('融資餘額 5 日 ' + sgn(cs.marginChg) + '%' + (cs.marginChg > 1 && ind.chg20 < 0 ? '（股價下跌期間融資增加）' : ''), clamp(-cs.marginChg * (ind.chg20 < 0 ? 3 : 1.5), -15, 15));
      if (cs.sblChg != null) CH.add('借券賣出餘額 5 日 ' + sgn(cs.sblChg) + '%', clamp(-cs.sblChg * 1.5, -18, 18));
      if (cs.ratio != null) CH.add('券資比 ' + cs.ratio.toFixed(1) + '%', cs.ratio > 15 ? 4 : 0);
    }
    // 基本面
    const F = mk(), fd = stock.fund || {}; let fundOk = ['pe', 'yld', 'revYoY'].some(k => fd[k] != null);
    if (fd.revYoY != null) F.add('月營收年增 ' + sgn(fd.revYoY) + '%', clamp(fd.revYoY * 0.6, -15, 25));
    if (fd.revMoM != null) F.add('月營收月增 ' + sgn(fd.revMoM) + '%', clamp(fd.revMoM * 0.5, -5, 5));
    if (fd.pe != null) F.add('本益比 ' + fd.pe, fd.pe <= 0 ? -8 : fd.pe < 12 ? 10 : fd.pe < 20 ? 5 : fd.pe < 30 ? 0 : -8);
    if (fd.yld != null) F.add('殖利率 ' + fd.yld + '%', fd.yld >= 5 ? 8 : fd.yld >= 3 ? 4 : fd.yld < 1.5 ? -2 : 0);

    const score = (o, base) => clamp(Math.round(base + sum(o.items.map(x => x.pts))), 0, 100);
    const dims = [
      { key: 'trend', name: '趨勢面', w: .25, ok: true, s: score(T, 50), items: T.items },
      { key: 'vp', name: '量價', w: .20, ok: true, s: clamp(Math.round(50 + sum(VP.items.map(x => x.pts)) * 0.35), 0, 100), items: VP.items },
      { key: 'inst', name: '法人', w: .20, ok: instOk, s: instOk ? score(I, 50) : null, items: I.items },
      { key: 'chip', name: '籌碼', w: .15, ok: chipOk, s: chipOk ? clamp(Math.round(50 + sum(CH.items.map(x => x.pts)) * 0.6), 0, 100) : null, items: CH.items },
      { key: 'fund', name: '基本面', w: .20, ok: fundOk, s: fundOk ? score(F, 40) : null, items: F.items }
    ];
    const used = dims.filter(d => d.ok), wsum = sum(used.map(d => d.w));
    const raw = sum(used.map(d => d.s * d.w)) / wsum;
    // 風險折減
    const pen = [];
    const trendS = dims[0].s;
    let trendLabel = trendS >= 70 ? '多頭' : trendS >= 55 ? '偏多' : trendS >= 42 ? '整理' : trendS >= 30 ? '偏空' : '風險';
    if (trendS >= 55 && ((c / m20 - 1) * 100 > 15 || ind.rsi > 80)) trendLabel = '過熱';
    const R1 = st.res[0];
    if (R1 && R1.dist < 3 && R1.rank >= 3) pen.push({ label: '距第一壓力不到 3%，且壓力強度「' + R1.strength + '」', pts: R1.rank === 4 ? -8 : -5 });
    if (trendLabel === '風險') pen.push({ label: '走勢屬「風險」：均線與動能同步轉弱', pts: -8 });
    const bias = (c / m20 - 1) * 100;
    if (bias > 12) pen.push({ label: '股價離月線 +' + bias.toFixed(0) + '%，短線乖離過大', pts: -Math.min(20, Math.round((bias - 12) * 0.8)) });
    if (ind.rsi > 80) pen.push({ label: 'RSI 高於 80，短線過熱', pts: -6 });
    if (volRatio > 3 && !up) pen.push({ label: '爆量收黑', pts: -6 });
    const index = clamp(Math.round(raw + sum(pen.map(x => x.pts))), 0, 100);
    const legacy = raw >= 60 ? '偏多' : raw >= 38 ? '中性' : '偏空';

    // 支撐密集區：至少兩道近端支撐、相距不超過 1.5 倍 ATR、合計 3 類以上訊號，且走勢不在「風險」
    let zone = null;
    const [s1, s2] = st.sup;
    if (s1 && s2 && s1.tier === '近端' && s2.tier === '近端' && (s1.lo - s2.level) <= ind.atr * 1.5 && new Set([...s1.cats, ...s2.cats]).size >= 3 && trendLabel !== '風險')
      zone = { lo: s2.lo, hi: s1.level };
    else if (s1 && s1.rank >= 4 && s1.tier === '近端' && trendLabel !== '風險') zone = { lo: s1.lo, hi: s1.level };
    let zoneWhy = '';
    if (!zone) zoneWhy = !s1 ? '現價下方 20% 內沒有有效的支撐結構。' : trendLabel === '風險' ? '雖有支撐，但目前走勢屬「風險」，均線與動能同步轉弱時支撐較容易失效，因此不列出支撐密集區。' : '支撐尚未集中在同一價格帶，因此不列出支撐密集區。';

    // 位置量表：近 20 日低點到近 20 日高點（或第一壓力，取高者）
    const top = Math.max(ind.high20, R1 ? R1.level : 0), posPct = clamp((c - ind.low20) / (top - ind.low20) * 100, 0, 100);
    const posZone = posPct < 35 ? '低檔區' : posPct < 70 ? '中段區' : '偏熱區';

    return { stock, ind, flows, st, dims, raw, pen, index, legacy, trendLabel, zone, zoneWhy, posPct, posZone, top };
  }
  function fmtInt(x) { return Math.round(x).toLocaleString('en-US'); }
  function sgn(x) { return (x > 0 ? '+' : '') + x.toFixed(2); }

  /* 解析貼上的日K：支援證交所個股日成交資訊 CSV、Yahoo 匯出、或 日期,開,高,低,收,量 */
  function parseBars(text) {
    const rows = [];
    const splitCsv = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if ((ch === ',' || ch === '\t') && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const num = s => { const v = parseFloat(String(s).replace(/[,\s]/g, '')); return isNaN(v) ? null : v; };
    const toDate = s => {
      let m = s.match(/^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (!m) { m = s.match(/^(\d{4})(\d{2})(\d{2})$/); }
      if (!m) return null; let y = +m[1]; if (y < 1911) y += 1911; return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    };
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue; const f = splitCsv(line); const d = toDate(f[0]); if (!d) continue;
      const ns = f.slice(1).map(num);
      let o, h, l, c, v;
      if (ns.length >= 8) { v = ns[0] / 1000; o = ns[2]; h = ns[3]; l = ns[4]; c = ns[5]; }        // 證交所：股數,金額,開,高,低,收,漲跌,筆數
      else if (ns.length === 6) { o = ns[0]; h = ns[1]; l = ns[2]; c = ns[3]; v = ns[5]; }          // Yahoo：開,高,低,收,調整收,量
      else if (ns.length >= 5) { o = ns[0]; h = ns[1]; l = ns[2]; c = ns[3]; v = ns[4]; }
      else continue;
      if ([o, h, l, c, v].some(x => x == null) || c <= 0) continue;
      rows.push({ d, o, h, l, c, v });
    }
    rows.sort((a, b) => a.d < b.d ? -1 : 1);
    const med = rows.map(r => r.v).sort((a, b) => a - b)[Math.floor(rows.length / 2)] || 0;
    if (med > 5e6) rows.forEach(r => r.v = r.v / 1000); // 以股為單位就換成張
    const seen = new Set(); return rows.filter(r => !seen.has(r.d) && seen.add(r.d));
  }

  return { analyze, parseBars, rt, tickOf };
})();
if (typeof module !== 'undefined') module.exports = Engine;
