/* 個股分析頁：路徑 /analysis/代號 */
function ring(score) {
  const R = 62, C = 2 * Math.PI * R, off = C * (1 - score / 100);
  return `<svg viewBox="0 0 150 150" role="img" aria-label="強度分數 ${score} 分">
    <circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="12"/>
    <circle class="ring" cx="75" cy="75" r="${R}" fill="none" stroke="${scoreColor(score)}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 75 75)"/>
    <text x="75" y="62" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--f-body)">強度分數</text>
    <text x="75" y="98" text-anchor="middle" font-size="40" font-weight="600" fill="var(--ink)" font-family="var(--f-num)">${score}</text>
  </svg>`;
}

function ladder(a) {
  // 價位地圖：左邊是近 20 日區間（低檔／中段／偏熱），右邊是支撐壓力，與現價連成一條線
  const c = a.stock.bars.at(-1).c, S = a.st.sup, Rr = a.st.res, low = a.ind.low20, top = a.top;
  const pts = [c, ...S.flatMap(b => [b.lo, b.level]), ...Rr.flatMap(b => [b.level, b.hi])];
  if (a.st.limitRef) pts.push(a.st.limitRef);
  if (pts.length < 3) pts.push(low, top);
  let lo = Math.min(...pts), hi = Math.max(...pts); const pad = (hi - lo) * .18 || c * .03; lo -= pad; hi += pad;
  const W = 340, H = 420, t0 = 26, b0 = H - 26, y = p => t0 + (hi - p) / (hi - lo) * (b0 - t0), cy = p => Math.max(t0, Math.min(b0, y(p)));
  const BX = 14, BW = 16, AX = 132;
  let g = '';
  // 近 20 日區間色帶（超出刻度的部分截掉，用箭頭標示）
  const z1 = low + (top - low) * .35, z2 = low + (top - low) * .70;
  [[low, z1, 'var(--accent-soft)'], [z1, z2, 'var(--warn-soft)'], [z2, top, 'var(--up-soft)']].forEach(([p0, p1, col]) => { const ya = cy(p1), yb = cy(p0); if (yb - ya > 0.5) g += `<rect x="${BX}" y="${ya}" width="${BW}" height="${yb - ya}" fill="${col}"/>`; });
  g += `<rect x="${BX}" y="${cy(top)}" width="${BW}" height="${Math.max(1, cy(low) - cy(top))}" fill="none" stroke="var(--line)" rx="3"/>`;
  g += `<text x="${BX - 4}" y="${cy(top) - 8}" font-size="11" fill="var(--faint)" font-family="var(--f-num)">${y(top) < t0 ? '↑ ' : ''}${top === a.ind.high20 ? '20日高' : '區間頂'} ${pxd(top)}</text>`;
  g += `<text x="${BX - 4}" y="${cy(low) + 17}" font-size="11" fill="var(--faint)" font-family="var(--f-num)">${y(low) > b0 ? '↓ ' : ''}20日低 ${pxd(low)}</text>`;
  // 主軸
  g += `<line x1="${AX}" x2="${AX}" y1="${t0}" y2="${b0}" stroke="var(--line)" stroke-width="2"/>`;
  if (a.zone) g += `<rect x="${AX - 20}" y="${y(a.zone.hi)}" width="40" height="${Math.max(4, y(a.zone.lo) - y(a.zone.hi))}" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" stroke-dasharray="3 3"/>`;
  // 價位與標籤（避免文字重疊）
  const marks = [];
  Rr.forEach((b, i) => marks.push({ p: b.level, band: [b.level, b.hi], label: i ? '第二壓力' : '第一壓力', col: 'var(--res)', rank: b.rank }));
  if (a.st.limitRef) marks.push({ p: a.st.limitRef, label: '漲停參考', col: 'var(--res)' });
  S.forEach((b, i) => marks.push({ p: b.level, band: [b.lo, b.level], label: i ? '第二支撐' : '近端支撐', col: 'var(--sup)', rank: b.rank }));
  marks.push({ p: c, label: '現在', col: 'var(--ink)', now: true });
  marks.forEach(m => m.ly = y(m.p));
  marks.sort((p, q) => p.ly - q.ly);
  for (let i = 1; i < marks.length; i++) if (marks[i].ly - marks[i - 1].ly < 34) marks[i].ly = marks[i - 1].ly + 34;
  const over = marks.at(-1).ly - (H - 18); if (over > 0) marks.forEach(m => m.ly -= over);
  if (marks[0].ly < 18) { const d = 18 - marks[0].ly; marks.forEach(m => m.ly += d); }
  for (const m of marks) {
    const py = y(m.p), dist = (m.p / c - 1) * 100;
    if (m.band && m.band[0] !== m.band[1]) g += `<rect x="${AX - 9}" y="${y(m.band[1])}" width="18" height="${Math.max(3, y(m.band[0]) - y(m.band[1]))}" rx="3" fill="${m.col}" opacity=".22"/>`;
    if (m.now) {
      g += `<line x1="${BX}" x2="${AX}" y1="${py}" y2="${py}" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="${AX}" cy="${py}" r="7" fill="var(--ink)"/>`;
    } else g += `<line x1="${AX - 14}" x2="${AX + 14}" y1="${py}" y2="${py}" stroke="${m.col}" stroke-width="3" stroke-linecap="round"/>`;
    if (Math.abs(m.ly - py) > 2) g += `<path d="M${AX + 16} ${py} L${AX + 24} ${m.ly - 4}" stroke="var(--line)" fill="none"/>`;
    const dots = m.rank ? ' ' + '●'.repeat(m.rank) + '○'.repeat(4 - m.rank) : '';
    g += `<text x="${AX + 26}" y="${m.ly - 6}" font-size="12" font-weight="700" fill="${m.now ? 'var(--ink)' : m.col}" font-family="var(--f-body)">${m.label}<tspan fill="var(--faint)" font-size="10" font-family="var(--f-num)">${dots}</tspan></text>
      <text x="${AX + 26}" y="${m.ly + 10}" font-size="${m.now ? 17 : 15}" font-weight="700" fill="${m.now ? 'var(--ink)' : m.col}" font-family="var(--f-num)">${pxd(m.p)}${m.now ? '' : `<tspan font-size="11" font-weight="500" fill="var(--muted)"> ${dist > 0 ? '+' : ''}${dist.toFixed(1)}%</tspan>`}</text>`;
  }
  const legend = `<div class="map-legend"><span><i style="background:var(--up-soft)"></i>偏熱區</span><span><i style="background:var(--warn-soft)"></i>中段區</span><span><i style="background:var(--accent-soft)"></i>低檔區</span><span><i style="background:var(--res)"></i>壓力</span><span><i style="background:var(--sup)"></i>支撐</span><span class="num">●●●● 價位強度</span></div>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="價位地圖：現價 ${pxd(c)}">${g}</svg>${legend}`;
}
function spaceSummary(a) {
  const c = a.stock.bars.at(-1).c, R1 = a.st.res[0], S1 = a.st.sup[0];
  const up = R1 ? (R1.level / c - 1) * 100 : a.st.limitRef ? (a.st.limitRef / c - 1) * 100 : null, dn = S1 ? (1 - S1.level / c) * 100 : null;
  let msg;
  if (up == null && dn == null) msg = '上下方均沒有明確的結構價位。';
  else if (up == null) msg = '上方沒有壓力結構（股價可能處於新高），往下至近端支撐 −' + dn.toFixed(1) + '%。';
  else if (dn == null) msg = '下方 20% 內沒有支撐結構，停損位置不易判斷，宜審慎。';
  else { const r = up / dn; msg = r >= 2 ? '往上至壓力的空間超過往下至支撐的 2 倍，就位置而言相對有利。' : r >= 1 ? '上下空間相近。' : '往上的空間小於往下的空間，追價的風險報酬較差。'; }
  return `<div class="space"><div><span>往上到${R1 ? '第一壓力' : '漲停參考'}</span><b class="num up">${up == null ? '—' : '+' + up.toFixed(1) + '%'}</b></div><div><span>往下到近端支撐</span><b class="num down">${dn == null ? '—' : '−' + dn.toFixed(1) + '%'}</b></div><div><span>上下空間比</span><b class="num">${up != null && dn ? (up / dn).toFixed(1) : '—'}</b></div></div><p class="small" style="margin:6px 0 0">${msg}</p>`;
}

function candles(a) {
  const B = a.stock.bars.slice(-90), n = B.length, ind = a.ind, off = a.stock.bars.length - n;
  const W = 760, H = 330, pl = 8, pr = 58, pt = 12, ph = 230, vt = 258, vh = 60;
  const lines = [...a.st.sup.map(b => ['sup', b.level]), ...a.st.res.map(b => ['res', b.level])];
  const ma20 = ind.ma20.slice(-n), ma60 = ind.ma60.slice(-n);
  const all = [...B.flatMap(b => [b.h, b.l]), ...lines.map(l => l[1])];
  const lo = Math.min(...all), hi = Math.max(...all), py = p => pt + (hi - p) / (hi - lo) * ph;
  const vmax = Math.max(...B.map(b => b.v)), cw = (W - pl - pr) / n, x = i => pl + cw * (i + .5);
  let g = '';
  for (let k = 0; k <= 4; k++) { const p = lo + (hi - lo) * k / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${py(p)}" y2="${py(p)}" stroke="var(--line)" stroke-width="1"/><text x="${W - pr + 6}" y="${py(p) + 4}" font-size="11" fill="var(--faint)" font-family="var(--f-num)">${p.toFixed(1)}</text>`; }
  B.forEach((b, i) => {
    const prev = i ? B[i - 1].c : a.stock.bars[off - 1]?.c ?? b.o, col = b.c > b.o || (b.c === b.o && b.c >= prev) ? 'var(--up)' : 'var(--down)';
    const y1 = py(Math.max(b.o, b.c)), y2 = py(Math.min(b.o, b.c));
    g += `<line x1="${x(i)}" x2="${x(i)}" y1="${py(b.h)}" y2="${py(b.l)}" stroke="${col}" stroke-width="1"/><rect x="${x(i) - cw * .35}" y="${y1}" width="${cw * .7}" height="${Math.max(1, y2 - y1)}" fill="${col}"/>`;
    g += `<rect x="${x(i) - cw * .35}" y="${vt + vh - b.v / vmax * vh}" width="${cw * .7}" height="${b.v / vmax * vh}" fill="${col}" opacity=".45"/>`;
  });
  const path = arr => arr.map((v, i) => v == null ? '' : `${arr.slice(0, i).some(z => z != null) ? 'L' : 'M'}${x(i).toFixed(1)},${py(v).toFixed(1)}`).join('');
  g += `<path d="${path(ma20)}" fill="none" stroke="var(--accent)" stroke-width="1.6"/><path d="${path(ma60)}" fill="none" stroke="var(--warn)" stroke-width="1.6"/>`;
  lines.forEach(([t, p]) => g += `<line x1="${pl}" x2="${W - pr}" y1="${py(p)}" y2="${py(p)}" stroke="var(--${t})" stroke-width="1.2" stroke-dasharray="5 4"/><rect x="${W - pr + 2}" y="${py(p) - 9}" width="54" height="18" rx="4" fill="var(--${t})"/><text x="${W - pr + 29}" y="${py(p) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--surface)" font-family="var(--f-num)">${p.toFixed(1)}</text>`);
  g += `<text x="${pl}" y="${vt - 4}" font-size="11" fill="var(--faint)" font-family="var(--f-body)">成交量（張）</text>`;
  g += `<text x="${pl + 4}" y="${pt + 12}" font-size="11" fill="var(--accent)" font-family="var(--f-body)">— MA20</text><text x="${pl + 64}" y="${pt + 12}" font-size="11" fill="var(--warn)" font-family="var(--f-body)">— MA60</text>`;
  g += `<text x="${pl}" y="${H - 2}" font-size="11" fill="var(--faint)" font-family="var(--f-num)">${B[0].d}</text><text x="${W - pr}" y="${H - 2}" text-anchor="end" font-size="11" fill="var(--faint)" font-family="var(--f-num)">${B.at(-1).d}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 90 日 K 線與結構價位">${g}</svg>`;
}

function levelCard(kind, title, bands, emptyMsg, a) {
  const c = a.stock.bars.at(-1).c;
  const rows = bands.length ? bands.map((b, i) => `<div class="row">
      <span class="tag">${kind === 'sup' ? (i ? '第二支撐' : '近端支撐') : title}｜${b.tier}</span>
      <span class="p num" style="color:var(--${kind})">${pxd(b.level)}</span>
      <span class="small muted num">${b.lo !== b.hi ? '價格帶 ' + pxd(b.lo) + '–' + pxd(b.hi) + '　' : ''}距現價 ${sg((b.level / c - 1) * 100, 1)}%</span>
      <span class="str s${b.rank}">價位強度：${b.strength}（${b.cats.length} 類 ${b.labels.length} 個訊號）</span>
      <div class="sigs">${b.labels.map(l => `<span>${esc(l)}</span>`).join('')}</div></div>`).join('') : `<div class="row"><span class="tag">${title}</span><span class="p num muted">尚未形成</span><span class="small muted">${emptyMsg}</span></div>`;
  return `<div class="lv ${kind}"><b>${kind === 'sup' ? '支撐觀察' : title}</b>${rows}</div>`;
}

let tab = 'tech';
function render(s) {
  let a;
  try { a = Engine.analyze(s); } catch (e) { $('#app').innerHTML = `<section class="card"><p class="err">${esc(e.message)}</p></section>`; return; }
  const t = s.bars.at(-1), c = t.c, ind = a.ind, fl = a.flows, R1 = a.st.res[0], R2 = a.st.res[1], S1 = a.st.sup[0];
  const d = s.dates || {};

  const dimsHtml = a.dims.map(x => `<div class="dim"><div class="lab">${x.name}</div><div class="val num" style="color:${scoreColor(x.s)}">${x.s ?? '資料不足'}</div><div class="bar"><i style="width:${x.s ?? 0}%;background:${scoreColor(x.s)}"></i></div></div>`).join('');

  const strong = a.dims.filter(x => x.ok && x.s >= 55).map(x => `${x.name}（${x.s}）`), weak = a.dims.filter(x => x.ok && x.s < 45).map(x => `${x.name}（${x.s}）`);
  const pts = [];
  pts.push(`距支撐 ${S1 ? pxd(S1.level) + '（' + sg((S1.level / c - 1) * 100, 1) + '%）' : '尚未形成'}、距壓力 ${R1 ? pxd(R1.level) + '（' + sg((R1.level / c - 1) * 100, 1) + '%）' : a.st.limitRef ? '上方無歷史結構，明日漲停參考 ' + pxd(a.st.limitRef) : '尚未形成'}`);
  pts.push(`量能為近 20 日均量的 ${fx(ind.volRatio)} 倍，RSI(14) ${fx(ind.rsi, 1)}，收盤${c >= ind.ma20.at(-1) ? '站上' : '低於'} 20 日均線 ${fx(ind.ma20.at(-1))}`);
  if (s.fund && s.fund.revYoY != null) pts.push(`${esc(s.fund.revMonth || '最新')} 月營收年增 ${sg(s.fund.revYoY)}%${s.fund.revMoM != null ? '、月增 ' + sg(s.fund.revMoM) + '%' : ''}${s.fund.pe != null ? '，本益比 ' + s.fund.pe : ''}${s.fund.yld != null ? '、殖利率 ' + s.fund.yld + '%' : ''}`);
  pts.push(`強度分數 ${a.index} 為綜合分數${strong.length ? '；' + strong.join('、') + ' 偏強' : ''}${weak.length ? '；' + weak.join('、') + ' 偏低' : ''}${a.pen.length ? '；另因' + a.pen.map(p => p.label.split('，')[0].split('：')[0]).join('、') + '扣分' : ''}`);
  if (R1) pts.push(`第一壓力價位強度「${R1.strength}」，由以下結構組成：${R1.labels.join('、')}`);

  const why = [];
  why.push([`收${t.c >= s.bars.at(-2).c ? '紅' : '黑'}`, `收盤 ${pxd(c)}，${sg(ind.chgPct)}%。`, cls(ind.chg)]);
  why.push([ind.volRatio >= 1.2 ? '成交量放大' : ind.volRatio <= 0.8 ? '成交量縮小' : '成交量持平', `成交量約為近 20 日均量的 ${fx(ind.volRatio)} 倍。`, '']);
  if (fl.inst && fl.inst.fToday != null) why.push([`外資${fl.inst.fToday >= 0 ? '買超' : '賣超'}`, `外資（含陸資）${fi(Math.abs(fl.inst.fToday))} 張；投信 ${sgi(fl.inst.tToday)} 張、自營商 ${sgi(fl.inst.dToday)} 張。`, cls(fl.inst.fToday)]);
  else if (fl.inst) why.push([`法人近 5 日${fl.inst.f5 + fl.inst.t5 + fl.inst.d5 >= 0 ? '買超' : '賣超'}`, `三大法人合計 ${sgi(fl.inst.f5 + fl.inst.t5 + fl.inst.d5)} 張。`, '']);
  else why.push(['法人資料不足', '沒有提供法人買賣超資料。', '']);

  $('#app').innerHTML = `
  <section class="card">
    <div class="hero">
      <div>
        <div class="id"><span class="code">${esc(s.code)}</span><span class="name">${esc(s.name || '')}</span><button class="watch-btn" type="button" id="watchBtn" aria-pressed="${Watch.has(s.code)}">${Watch.has(s.code) ? '★ 已加入我的選股' : '☆ 加入我的選股'}</button></div>
        ${s.live ? `<div class="live-badge"><span class="dot${s.live.open ? ' on' : ''}"></span>${s.live.open ? '盤中即時' : '今日收盤'} ${esc(s.live.time || '')}<span class="muted">・價格約延遲數秒；法人與籌碼為前一交易日資料</span></div>` : `<div class="small muted">資料更新至 ${esc(t.d.replace(/-/g, '/'))} 收盤</div>`}
        <div class="price"><span class="px num">${pxd(c)}</span><span class="ch num ${cls(ind.chg)}">${sg(ind.chg)}（${sg(ind.chgPct)}%）</span></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="small muted">走勢</span><span class="pill ${trendCls(a.trendLabel)}">${a.trendLabel}</span></div>
      </div>
      <div class="gauge">${ring(a.index)}<div style="display:grid;gap:6px;justify-items:center"><span class="pill ${legacyCls(a.legacy)}">綜合評等：${a.legacy}</span><span class="small muted num" style="text-align:center">五面向平均 ${fx(a.raw, 1)}${a.pen.length ? `<br>風險扣分 ${a.pen.reduce((x, y) => x + y.pts, 0)} → 強度分數 ${a.index}` : ''}</span></div></div>
    </div>
    <p class="note" style="margin:14px 0 0"><b>走勢</b>依均線與動能判斷；<b>綜合評等</b>為下列五個面向分數的平均；<b>強度分數</b>為綜合評等扣除風險因素（如接近強壓力、走勢轉弱、短線過熱）後的分數，範圍 0～100，分數越高代表目前整體條件越強，但不代表未來必然上漲。</p>
    <div class="dims">${dimsHtml}</div>
    <div class="dates num"><span>行情：${esc(d.price || t.d)}</span>${d.inst ? `<span>法人：${esc(d.inst)}</span>` : ''}${d.chip ? `<span>籌碼：${esc(d.chip)}</span>` : ''}${d.val ? `<span>基本面：${esc(d.val)}</span>` : ''}${d.rev ? `<span>營收：${esc(d.rev)}</span>` : ''}</div>
  </section>

  <section class="card">
    <h2>價位地圖</h2><p class="small muted" style="margin:4px 0 0">現價上下方的支撐與壓力、距離，以及股價在近 20 日區間的位置。</p>
    <div class="map" style="margin-top:12px">
      <div class="ladder">${ladder(a)}</div>
      <div style="min-width:0">
        <div class="pos">
          <div class="small" style="font-weight:700">上下空間</div>
          ${spaceSummary(a)}
          <div class="small" style="font-weight:700;margin-top:16px">現在的位置</div>
          <p class="small" style="margin:10px 0 0">目前位於區間約 <b class="num">${Math.round(a.posPct)}%</b>，屬「<b>${a.posZone}</b>」。區間從近 20 日最低 <span class="num">${pxd(ind.low20)}</span> 到${R1 && R1.level > ind.high20 ? '第一壓力' : '近 20 日最高'} <span class="num">${pxd(a.top)}</span>。</p>
          <div class="zones">
            <div class="${a.posZone === '低檔區' ? 'on' : ''}"><b>低檔區　0～35%</b><span>價格靠近近期低點與支撐。往下的空間相對小，但如果走勢正在轉弱，也可能繼續破底。</span></div>
            <div class="${a.posZone === '中段區' ? 'on' : ''}"><b>中段區　35～70%</b><span>價格在近期區間的中間，上下都有空間，方向還不明確。</span></div>
            <div class="${a.posZone === '偏熱區' ? 'on' : ''}"><b>偏熱區　70～100%</b><span>價格靠近近期高點或壓力，短線已經漲了一段，這時追價買進的風險比較高。</span></div>
          </div>
          <p class="note" style="margin:8px 0 0">位置僅描述股價所在區間，不代表買賣建議。</p>
          ${R1 ? `<p class="small" style="margin:14px 0 0">第一壓力 <b class="num" style="color:var(--res)">${pxd(R1.level)}</b> 的價位強度為<b>${R1.strength}</b>，由${R1.cats.map(x => x + '結構').join('、')}組成；價位強度越高，股價接近時越可能遇到賣壓。</p>` : ''}
          <div class="zone-box"><b>${a.zone ? `支撐密集區 <span class="num" style="color:var(--accent)">${pxd(a.zone.lo)}–${pxd(a.zone.hi)}</span>` : '支撐密集區：目前沒有'}</b><span>${a.zone ? '近端兩道支撐落在同一價格帶，且走勢未轉入「風險」；股價回到此區間時，下方有多種結構支撐。' : esc(a.zoneWhy)}</span><span class="note">支撐密集區：多種支撐（如均線、前波低點、大量成交區）集中在同一價格帶，形成較穩固的承接區。</span></div>

        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>重點整理</h2><p class="small muted" style="margin:4px 0 0">目前狀況摘要。</p>
    <ul class="points">${pts.map(p => `<li>${p}</li>`).join('')}</ul>
  </section>

  <section class="card">
    <h2>${esc(t.d.slice(5).replace('-', '/'))} 為什麼動？</h2><p class="small muted" style="margin:4px 0 0">最近一個交易日的漲跌、成交量與法人動向。</p>
    <div class="why">${why.map(([h, b, k]) => `<div><b class="${k}">${h}</b><span class="small muted">${b}</span></div>`).join('')}</div>
  </section>

  <section class="card">
    <h2>支撐與壓力</h2><p class="small muted" style="margin:4px 0 0"><b style="color:var(--sup)">支撐</b>是股價下跌時較可能止跌的價位，跌破代表轉弱；<b style="color:var(--res)">壓力</b>是股價上漲時較可能遇到賣壓的價位，站上代表轉強。價位強度越高，代表越多種結構集中在該價位。</p>
    <div class="levels">
      ${levelCard('sup', '支撐', a.st.sup, '現價下方 20% 內沒有支撐結構。', a)}
      ${levelCard('res', '第一壓力', R1 ? [R1] : [], a.st.limitRef ? '創新高且上方無歷史結構，明日漲停參考價 ' + pxd(a.st.limitRef) + '（非結構價位）。' : '上方沒有有效的壓力結構。', a)}
      ${levelCard('res', '第二壓力', R2 ? [R2] : [], '第一壓力之上沒有其他獨立的壓力結構。', a)}
    </div>
    <details class="rules"><summary>價位計算方式</summary>
      <p>候選價位全部來自真實歷史成交結構：近 120 日的波段高低點（左 3 根、右側至少 1 根確認）、MA5／10／20／60、近 60 日未回補缺口、爆量 K（成交量達前 20 日均量 2 倍）的高點／收盤／低點、近 60 日成交量分布最大的 3 個價格帶、由最近兩個墊高低點（或降低高點）延伸的趨勢線。離現價不到 1% 的價位不列入。</p>
      <p>相鄰價位落在同一波動容差內（取 0.9% 與 0.3 倍 ATR 的較大者，目前 ${fx(a.st.tol)} 元）就合併成價格帶，不硬拆兩道。價位強度看訊號分屬幾類（價格、均線、量能、籌碼）與訊號數：4 類或 5 個訊號以上為極強、3 類或 4 個為強、2 類或 2 個為中、其餘為弱。借券賣出餘額 5 日增加超過 3% 時，加註在第一壓力上。</p>
      <p>支撐：現價下方 0～10% 標近端、10～20% 標中期，超過 20% 不列。壓力：第二道取第一壓力帶之上下一個獨立結構，超過 +10% 改標中期。價位依台股升降單位取整。創新高且上方沒有歷史結構時，改以 10% 漲跌幅限制推算明日漲停參考價。這些是觀察位置，不是目標價，也不是買賣建議。</p>
    </details>
  </section>

  <section class="card">
    <h2>研究室</h2><p class="small muted" style="margin:4px 0 0">K 線圖、法人買賣、融資借券、本益比與營收，以及分數的計算明細。</p>
    <div class="tabs" role="tablist">
      ${[['tech', '技術面'], ['inst', '法人'], ['chip', '籌碼'], ['fund', '基本面'], ['score', '計分明細']].map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}
    </div>
    <div class="panel" id="panel"></div>
  </section>`;

  const panels = {
    tech: () => `<div class="chart scroll">${candles(a)}</div>
      <div class="kv">
        <div><span>MA5 / MA10</span><b class="num">${fx(ind.ma5.at(-1))} / ${fx(ind.ma10.at(-1))}</b></div>
        <div><span>MA20 / MA60</span><b class="num">${fx(ind.ma20.at(-1))} / ${fx(ind.ma60.at(-1))}</b></div>
        <div><span>RSI(14)</span><b class="num">${fx(ind.rsi, 1)}</b></div>
        <div><span>KD(9)</span><b class="num">${fx(ind.k, 1)} / ${fx(ind.d, 1)}</b></div>
        <div><span>MACD 柱狀體</span><b class="num ${cls(ind.hist)}">${sg(ind.hist)}</b></div>
        <div><span>ATR(14)</span><b class="num">${fx(ind.atr)}</b></div>
        <div><span>量比（今日／20 日均量）</span><b class="num">${fx(ind.volRatio)}</b></div>
        <div><span>近 20 日漲跌</span><b class="num ${cls(ind.chg20)}">${sg(ind.chg20, 1)}%</b></div>
      </div>`,
    inst: () => s.inst && s.inst.length ? `<div class="scroll"><table><thead><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr></thead><tbody>${s.inst.slice().reverse().map(r => `<tr><td class="num">${r.d}</td><td class="num ${cls(r.f)}">${sgi(r.f)}</td><td class="num ${cls(r.t)}">${sgi(r.t)}</td><td class="num ${cls(r.dl)}">${sgi(r.dl)}</td><td class="num ${cls(r.f + r.t + r.dl)}">${sgi(r.f + r.t + r.dl)}</td></tr>`).join('')}</tbody></table></div><p class="note">單位：張。外資不含外資自營商。</p>`
      : fl.inst ? `<div class="kv"><div><span>外資近 5 日</span><b class="num ${cls(fl.inst.f5)}">${sgi(fl.inst.f5)}</b></div><div><span>投信近 5 日</span><b class="num ${cls(fl.inst.t5)}">${sgi(fl.inst.t5)}</b></div><div><span>自營商近 5 日</span><b class="num ${cls(fl.inst.d5)}">${sgi(fl.inst.d5)}</b></div></div>` : `<p class="muted">目前沒有此股票的法人買賣資料。</p>`,
    chip: () => {
      const m = s.margin || [], b = s.sbl || [];
      if (!m.length && !b.length) return fl.chip ? `<div class="kv">${fl.chip.marginChg != null ? `<div><span>融資餘額 5 日變化</span><b class="num">${sg(fl.chip.marginChg)}%</b></div>` : ''}${fl.chip.sblChg != null ? `<div><span>借券賣出餘額 5 日變化</span><b class="num">${sg(fl.chip.sblChg)}%</b></div>` : ''}</div>` : `<p class="muted">目前沒有此股票的融資與借券資料。</p>`;
      const days = [...new Set([...m.map(x => x.d), ...b.map(x => x.d)])].sort().reverse();
      return `<div class="kv"><div><span>融資餘額 5 日變化</span><b class="num">${sg(fl.chip.marginChg)}%</b></div><div><span>借券賣出餘額 5 日變化</span><b class="num">${sg(fl.chip.sblChg)}%</b></div><div><span>券資比</span><b class="num">${fx(fl.chip.ratio, 1)}%</b></div><div><span>近 5 日借券賣出／還券</span><b class="num">${fi(fl.chip.sblSell5)} / ${fi(fl.chip.sblRet5)}</b></div></div>
      <div class="scroll" style="margin-top:12px"><table><thead><tr><th>日期</th><th>融資餘額</th><th>融券餘額</th><th>借券賣出餘額</th><th>借券賣出</th><th>還券</th></tr></thead><tbody>${days.map(dd => { const mm = m.find(x => x.d === dd) || {}, bb = b.find(x => x.d === dd) || {}; return `<tr><td class="num">${dd}</td><td class="num">${fi(mm.mb)}</td><td class="num">${fi(mm.sb)}</td><td class="num">${fi(bb.bal)}</td><td class="num">${fi(bb.sell)}</td><td class="num">${fi(bb.ret)}</td></tr>`; }).join('')}</tbody></table></div><p class="note">單位：張。借券賣出餘額下降代表空方回補，對股價壓力減輕。</p>`;
    },
    fund: () => { const f = s.fund || {}; return `<div class="kv"><div><span>本益比</span><b class="num">${fx(f.pe)}</b></div><div><span>殖利率</span><b class="num">${f.yld != null ? fx(f.yld) + '%' : '—'}</b></div><div><span>股價淨值比</span><b class="num">${fx(f.pb)}</b></div><div><span>${esc(f.revMonth || '最新')} 營收年增</span><b class="num ${cls(f.revYoY)}">${f.revYoY != null ? sg(f.revYoY) + '%' : '—'}</b></div><div><span>${esc(f.revMonth || '最新')} 營收月增</span><b class="num ${cls(f.revMoM)}">${f.revMoM != null ? sg(f.revMoM) + '%' : '—'}</b></div></div>`; },
    score: () => `<p class="small muted" style="margin-top:0">強度分數 = 五面向加權平均（趨勢 25%、量價 20%、法人 20%、籌碼 15%、基本面 20%；缺資料的面向不計，權重重新分配）＋ 風險折減。趨勢、量價、法人、籌碼從 50 分起算，基本面從 40 分起算；量價的加減分以 0.35 倍、籌碼以 0.6 倍計入（這兩項單日變化大，避免分數忽高忽低），各自限制在 0～100。</p>
      ${a.dims.map(x => `<div class="score-dim"><header><span>${x.name}（權重 ${x.w * 100}%）</span><span class="num" style="color:${scoreColor(x.s)}">${x.s ?? '資料不足'}</span></header><ul>${x.items.map(i => `<li><span>${esc(i.label)}</span><span class="num ${cls(i.pts)}">${sgi(i.pts)}</span></li>`).join('') || '<li><span>沒有資料</span></li>'}</ul></div>`).join('')}
      <div class="score-dim"><header><span>風險折減</span><span class="num">${a.pen.reduce((x, y) => x + y.pts, 0)}</span></header><ul>${a.pen.map(i => `<li><span>${esc(i.label)}</span><span class="num down">${i.pts}</span></li>`).join('') || '<li><span>無</span></li>'}</ul></div>
      <p class="small muted">加權原始分 ${fx(a.raw, 1)}，即綜合評等（60 以上偏多、38～60 中性、38 以下偏空）；扣掉風險折減後為強度分數 ${a.index}。走勢標籤看趨勢面分數：70 以上多頭、55 偏多、42 整理、30 偏空、30 以下風險；趨勢偏強但股價離月線超過 15% 或 RSI 高於 80 時，改標「過熱」。</p>`
  };
  const showTab = () => { $('#panel').innerHTML = panels[tab](); document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab)); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; showTab(); });
  showTab();
  const wb = $('#watchBtn');
  if (wb) wb.onclick = () => { const on = Watch.toggle(s.code, s.name); if (on) Watch.update(s.code, { index: a.index, trend: a.trendLabel, date: t.d }); wb.setAttribute('aria-pressed', on); wb.textContent = on ? '★ 已加入我的選股' : '☆ 加入我的選股'; };
  Watch.update(s.code, { index: a.index, trend: a.trendLabel, date: t.d, name: s.name });
}


let base = null, timer = null;
const codeFromPath = () => decodeURIComponent((location.pathname.match(/\/analysis\/([^/?#]+)/) || [])[1] || new URLSearchParams(location.search).get('code') || '').toUpperCase();

function withLive(s, q) {
  if (!q || !q.price || !q.date) return s;
  const bars = s.bars.slice(), lastD = bars.at(-1).d;
  if (q.date < lastD || (q.date === lastD && !(q._session || {}).open)) return s;
  const bar = { d: q.date, o: q.open ?? q.price, h: Math.max(q.high ?? q.price, q.price), l: Math.min(q.low ?? q.price, q.price), c: q.price, v: Math.round(q.vol || 0) };
  if (q.date === lastD) bars[bars.length - 1] = bar; else bars.push(bar);
  const sess = q._session || {};
  return Object.assign({}, s, { bars, live: { open: !!sess.open, time: q.time ? q.time.slice(0, 5) : '' }, dates: Object.assign({}, s.dates, { price: q.date.replace(/-/g, '/') + (sess.open ? ' 盤中' : '') }) });
}
async function refreshQuote() {
  if (!base) return;
  try {
    const r = await fetch('/api/quote?codes=' + base.code); const j = await r.json();
    const q = (j.quotes || []).find(x => x.code === base.code && x.price);
    if (q) { q._session = j.session; const y = window.scrollY; render(withLive(base, q)); window.scrollTo(0, y); }
    clearTimeout(timer);
    if (j.session && j.session.open) timer = setTimeout(refreshQuote, 15000);
  } catch (e) { clearTimeout(timer); timer = setTimeout(refreshQuote, 30000); }
}
async function loadStock(code) {
  if (!code) { location.href = '/'; return; }
  document.title = code + ' 分析｜盤後結構室';
  $('#app').innerHTML = `<section class="card loading"><div class="dots"><span></span><span></span><span></span></div><b>正在整理 ${esc(code)}</b><span class="small muted">包含近 7 個月日 K、三大法人、融資融券、借券、本益比與月營收，約需 5～15 秒。</span></section>`;
  try {
    const r = await fetch('/api/stock?code=' + encodeURIComponent(code));
    const j = await r.json().catch(() => ({ error: '伺服器回應格式錯誤。' }));
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    base = j; Recent.add(j.code, j.name);
    document.title = `${j.code} ${j.name} 分析｜盤後結構室`;
    render(j); refreshQuote();
  } catch (e) {
    $('#app').innerHTML = `<section class="card"><p class="err">${esc(e.message)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" id="retry">再試一次</button><a class="btn ghost" href="/">回首頁</a></div></section>`;
    $('#retry').onclick = () => loadStock(code);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && base) refreshQuote(); });
loadStock(codeFromPath());
