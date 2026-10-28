// 研究用：把行情、三大法人、本益比、月營收補到指定日期（存進 data/cache，網站不讀）
const fs = require('fs'), path = require('path');
const M = require('./market.js');
const CACHE = path.join(__dirname, '..', 'data', 'cache');
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const FROM = process.env.FROM || '2025-01-02', TO = process.env.TO || '2026-10-28';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
// 月營收（公開資訊觀測站彙總表），每月 10 日前公布，回測時從次月 11 日起才使用
async function revMonth(y, m) {
  const out = {};
  for (const mk of ['sii', 'otc']) {
    const url = `https://mops.twse.com.tw/nas/t21/${mk}/t21sc03_${y - 1911}_${m}_0.csv`;
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) { console.log('營收失敗', url, r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer()); let t = buf.toString('utf8'); if (!t.includes('公司代號')) t = new TextDecoder('big5').decode(buf);
      const lines = t.split(/\r?\n/).filter(Boolean); const head = lines[0].split(',').map(s => s.replace(/"/g, ''));
      const iC = head.findIndex(h => h.includes('公司代號')), iY = head.findIndex(h => h.includes('去年同月增減')), iM = head.findIndex(h => h.includes('上月比較增減'));
      for (const ln of lines.slice(1)) { const c = ln.match(/("([^"]*)"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/"/g, '')); const code = (c[iC] || '').trim(); if (/^\d{4}$/.test(code)) out[code] = { yoy: parseFloat(c[iY]), mom: parseFloat(c[iM]), month: `${y}/${String(m).padStart(2, '0')}` }; }
    } catch (e) { console.log('營收失敗', url, String(e)); }
    await M.sleep(3000);
  }
  return out;
}
(async () => {
  const wd = []; for (const d = new Date(FROM + 'T00:00:00Z'); d <= new Date(TO + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w && w < 6) wd.push(d.toISOString().slice(0, 10)); }
  const names = rd(path.join(CACHE, 'names.json')) || {}, taiex = rd(path.join(CACHE, 'taiex.json')) || {};
  let n = 0;
  for (const d of wd) {
    const fD = path.join(CACHE, 'daily', d + '.json'), fI = path.join(CACHE, 'inst', d + '.json'), fV = path.join(CACHE, 'val', d + '.json');
    let c = rd(fD);
    const need = [!c ? M.daily(d) : null, null, null];
    if (!c) { const r = await need[0];
      if (r.n > 500) { c = {}; for (const [code, q] of Object.entries(r.quotes)) { c[code] = q.slice(0, 5); if (!names[code]) names[code] = [q[5], q[6] === 'tse' ? '上市' : '上櫃']; } if (r.taiex) taiex[d] = r.taiex; wr(fD, c); }
      else if (r.noData) { c = { holiday: true }; wr(fD, c); } else { console.log('行情缺', d); continue; } }
    if (c.holiday) continue;
    const [ii, vv] = await Promise.all([rd(fI) ? null : M.inst(d), rd(fV) ? null : M.val(d)]);
    if (ii && Object.keys(ii).length) wr(fI, ii); if (vv && Object.keys(vv).length) wr(fV, vv);
    if (++n % 20 === 0) { console.log('進度', d, n); wr(path.join(CACHE, 'names.json'), names); wr(path.join(CACHE, 'taiex.json'), taiex); }
  }
  wr(path.join(CACHE, 'names.json'), names); wr(path.join(CACHE, 'taiex.json'), taiex);
  // 月營收：FROM 前一個月起到最新
  const [fy, fm] = FROM.split('-').map(Number);
  for (let y = fm === 1 ? fy - 1 : fy, m = fm === 1 ? 12 : fm - 1; ; ) {
    const tag = `${y}-${String(m).padStart(2, '0')}`, f = path.join(CACHE, 'rev', tag + '.json');
    const avail = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 11)).toISOString().slice(0, 10);
    if (avail > TO) break;
    if (!rd(f)) { const data = await revMonth(y, m); console.log('營收', tag, Object.keys(data).length); if (Object.keys(data).length > 500) wr(f, { month: `${y}/${String(m).padStart(2, '0')}`, from: avail, data }); }
    if (++m > 12) { m = 1; y++; }
  }
  console.log(`::notice::歷史資料完成 ${FROM}~${TO}，交易日 ${n}`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
