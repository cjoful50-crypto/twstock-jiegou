// 財報：從公開資訊觀測站「綜合損益彙總表」「資產負債彙總表」抓上市櫃各季資料，轉成單季，輸出 data/fin.json
//   node scripts/fin.js              更新最近 2 季與缺少的季別
//   BACK=15 node scripts/fin.js      回補最近 15 季
// 輸出格式：{ updated, q: ['2025Q3', ...], s: { 代號: [[季別, 營收, 毛利, 營業利益, 稅後淨利(母公司), EPS, 總資產, 總負債, 權益(母公司)], ...] } }，金額單位：千元
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, '..', 'data'), CACHE = path.join(DATA, 'cache', 'fin');
fs.mkdirSync(CACHE, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => { const t = String(s || '').replace(/[,\s]/g, ''); if (!t || t === '--' || t === '-') return null; const v = parseFloat(t); return isNaN(v) ? null : v; };
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

async function fetchTable(kind, typek, y, s) {
  const body = new URLSearchParams({ encodeURIComponent: 1, step: 1, firstin: 1, off: 1, isQuery: 'Y', TYPEK: typek, year: String(y - 1911), season: String(s).padStart(2, '0') });
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`https://mopsov.twse.com.tw/mops/web/ajax_t163sb0${kind}`, { method: 'POST', headers: UA, body, signal: AbortSignal.timeout(120000) });
      const h = await r.text(); if (r.ok && h.includes('hasBorder')) return h; /* 表頭寫成「公司<br>代號」，以表格 class 判斷 */ if (h.includes('查詢無資料') || h.includes('查無')) return ''; console.log('回應異常，重試', kind, typek, y, s, h.slice(0, 120).replace(/\s+/g, ' ')); }
    catch (e) { console.log('連線失敗，重試', kind, typek, y, s, String(e).slice(0, 120)); }
    await sleep(8000 * (t + 1));
  }
  return null;
}
// 解析彙總表：每個產業一張表，表頭欄位不同；依欄名取值
function parse(html) {
  const out = {};
  for (const tb of html.split(/<table[^>]*class=['"]?hasBorder/i).slice(1)) {
    const rows = tb.split(/<tr/i).slice(1); if (!rows.length) continue;
    const head = (rows[0].match(/<th[^>]*>[\s\S]*?<\/th>/gi) || []).map(strip); if (!head.includes('公司代號')) continue;
    for (const r of rows.slice(1)) { const td = (r.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(strip); if (td.length < 3) continue;
      const o = {}; head.forEach((h, i) => { o[h] = td[i]; }); if (/^\w{4,6}$/.test(o['公司代號'])) out[o['公司代號']] = o; }
  }
  return out;
}
const pick = (o, names) => { for (const n of names) { const k = Object.keys(o).find(x => x === n); if (k && num(o[k]) != null) return num(o[k]); } for (const n of names) { const k = Object.keys(o).find(x => x.includes(n)); if (k && num(o[k]) != null) return num(o[k]); } return null; };
function income(o) { return {
  rev: pick(o, ['營業收入', '淨收益', '收益', '收入']),
  gp: pick(o, ['營業毛利（毛損）淨額', '營業毛利（毛損）']),
  op: pick(o, ['營業利益（損失）']),
  ni: pick(o, ['淨利（淨損）歸屬於母公司業主', '淨利（損）歸屬於母公司業主', '本期淨利（淨損）', '本期稅後淨利（淨損）']),
  eps: pick(o, ['基本每股盈餘（元）', '基本每股盈餘']) }; }
function balance(o) { return {
  assets: pick(o, ['資產總計', '資產總額']), liab: pick(o, ['負債總計', '負債總額']),
  equity: pick(o, ['歸屬於母公司業主之權益合計', '權益總計', '權益總額']) }; }

// 季別清單：財報公布期限後才抓（Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31），往前推 n 季
function quarters(n) { const now = new Date(Date.now() + 8 * 3600e3), y = now.getUTCFullYear(), md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  let cy = y, cq = md >= 1115 ? 3 : md >= 815 ? 2 : md >= 516 ? 1 : 0; if (!cq) { cy = y - 1; cq = md >= 401 ? 4 : 3; }
  const out = []; for (let i = 0; i < n; i++) { out.unshift([cy, cq]); cq--; if (!cq) { cq = 4; cy--; } } return out; }

(async () => {
  const back = +(process.env.BACK || 2), Q = quarters(Math.max(back, 2));
  // 已快取的季別略過（最近 2 季每次重抓，因為有公司晚公布或更正）
  const recent = new Set(quarters(2).map(([y, q]) => `${y}Q${q}`));
  for (const [y, q] of Q) for (const mk of ['sii', 'otc']) {
    const f = path.join(CACHE, `${y}Q${q}-${mk}.json`); if (fs.existsSync(f) && !recent.has(`${y}Q${q}`)) continue;
    const ih = await fetchTable(4, mk, y, q); await sleep(4000); const bh = await fetchTable(5, mk, y, q); await sleep(4000);
    if (ih == null || bh == null) { console.log('::warning::抓取失敗', y, q, mk); continue; }
    const I = parse(ih), B = parse(bh), rows = {};
    for (const c of new Set([...Object.keys(I), ...Object.keys(B)])) rows[c] = Object.assign({}, I[c] ? income(I[c]) : {}, B[c] ? balance(B[c]) : {});
    if (Object.keys(rows).length) fs.writeFileSync(f, JSON.stringify(rows));
    console.log(`${y}Q${q} ${mk}：損益 ${Object.keys(I).length} 家、資產負債 ${Object.keys(B).length} 家`, process.env.LOG ? JSON.stringify(['2330', '2881', '1240', '6488'].map(c => [c, rows[c]])) : '');
  }
  // 合併所有快取季別，累計數轉單季（Q2=上半年−Q1、Q3=前三季−上半年、Q4=全年−前三季）
  const files = fs.readdirSync(CACHE).filter(f => /^\d{4}Q\d-(sii|otc)\.json$/.test(f)).sort();
  const cum = {}; for (const f of files) { const [, y, q] = f.match(/^(\d{4})Q(\d)/), d = JSON.parse(fs.readFileSync(path.join(CACHE, f)));
    for (const [c, v] of Object.entries(d)) ((cum[c] = cum[c] || {})[`${y}Q${q}`] = v); }
  const s = {}, all = new Set();
  for (const [c, byQ] of Object.entries(cum)) { const rows = [];
    for (const k of Object.keys(byQ).sort()) { const v = byQ[k], [y, q] = [+k.slice(0, 4), +k[5]], prev = q > 1 ? byQ[`${y}Q${q - 1}`] : null;
      const one = f => v[f] == null ? null : q === 1 ? v[f] : prev && prev[f] != null ? +(v[f] - prev[f]).toFixed(2) : null;
      rows.push([k, one('rev'), one('gp'), one('op'), one('ni'), one('eps'), v.assets ?? null, v.liab ?? null, v.equity ?? null]); all.add(k); }
    s[c] = rows.slice(-12); }
  const q = [...all].sort();
  fs.writeFileSync(path.join(DATA, 'fin.json'), JSON.stringify({ updated: new Date().toISOString(), q: q.slice(-12), s }));
  // 個股頁只載入單檔：data/fin/<代號>.json
  const DIR = path.join(DATA, 'fin'); fs.mkdirSync(DIR, { recursive: true });
  for (const [c, rows] of Object.entries(s)) fs.writeFileSync(path.join(DIR, c + '.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), rows }));
  console.log('fin.json：', Object.keys(s).length, '家，季別', q.slice(-12).join(' '));
})();
