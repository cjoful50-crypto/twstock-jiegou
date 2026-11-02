// 集保股權分散歷史回補：每次最多查 BUDGET 筆，依成交值由大到小、由近到遠補齊過去一年
// 每天由 GitHub Actions 執行一次，分散查詢量，避免造成集保網站負擔
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'tdcc'), CACHE = path.join(__dirname, '..', 'data', 'cache', 'daily');
const BUDGET = +(process.env.BUDGET || 3000), MAXMIN = +(process.env.MAXMIN || 50);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const U = 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const isoOf = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
let tok = null, ck = '';
async function req(opts) { for (let a = 0; a < 4; a++) { try { const r = await fetch(U, Object.assign({ signal: AbortSignal.timeout(30000) }, opts)); const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) ck = sc.map(c => c.split(';')[0]).join('; '); const t = await r.text(); const m = t.match(/name="SYNCHRONIZER_TOKEN" value="([^"]+)"/); if (m) tok = m[1]; return t; } catch (e) { await sleep(3000 * (a + 1)); } } return ''; }
const num = s => parseFloat(String(s).replace(/,/g, '')) || 0;
(async () => {
  const t0 = Date.now();
  const first = await req({ headers: UA }); const dates = [...first.matchAll(/<option value="(\d{8})"/g)].map(m => m[1]);
  if (!dates.length || !tok) throw new Error('集保查詢頁無法開啟');
  // 依近 20 日成交值排序（沒有行情的股票排最後）
  const files = fs.readdirSync(CACHE).sort().slice(-30).map(n => rd(path.join(CACHE, n))).filter(x => x && !x.holiday).slice(-20);
  const tv = {}; for (const d of files) for (const [c, b] of Object.entries(d)) if (b[3] && b[4]) tv[c] = (tv[c] || 0) + b[3] * b[4];
  const codes = fs.readdirSync(OUT).filter(f => /^[1-9]\d{3}\.json$/.test(f)).map(f => f.slice(0, 4)).sort((a, b) => (tv[b] || 0) - (tv[a] || 0));
  let used = 0, done = 0, fail = 0, stocks = 0;
  outer: for (const code of codes) {
    const f = path.join(OUT, code + '.json'); const s = rd(f) || { code, rows: [] };
    const have = new Map(s.rows.map(r => [r[0], r]));
    const need = dates.filter(d => { const r = have.get(isoOf(d)); return !r || r[7] == null; }); // 沒資料，或缺總張數
    if (!need.length) continue;
    let changed = false;
    for (const d of need) {
      if (used >= BUDGET || Date.now() - t0 > MAXMIN * 60e3) { if (changed) { s.rows.sort((a, b) => a[0].localeCompare(b[0])); fs.writeFileSync(f, JSON.stringify(s)); } break outer; }
      used++;
      const body = new URLSearchParams({ SYNCHRONIZER_TOKEN: tok, SYNCHRONIZER_URI: '/portal/zh/smWeb/qryStock', method: 'submit', firDate: dates[0], scaDate: d, sqlMethod: 'StockNo', stockNo: code, stockName: '' });
      const h = await req({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck, Referer: U }, UA), body });
      const rows = [...h.matchAll(/<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>/g)];
      if (rows.length < 10) { fail++; if (!tok) await req({ headers: UA }); await sleep(1500); continue; }
      const p = {}, n = {}, sh = {}; for (const m of rows) { p[+m[1]] = num(m[4]); n[+m[1]] = num(m[2]); sh[+m[1]] = num(m[3]); }
      const sp = (a, b) => { let x = 0; for (let k = a; k <= b; k++) x += p[k] || 0; return +x.toFixed(2); }, sn = (a, b) => { let x = 0; for (let k = a; k <= b; k++) x += n[k] || 0; return x; };
      let tot = sh[17]; if (!tot) { tot = 0; for (let k = 1; k <= 15; k++) tot += sh[k] || 0; }
      const iso = isoOf(d); s.rows = s.rows.filter(r => r[0] !== iso);
      s.rows.push([iso, sp(15, 15), sp(12, 15), sp(1, 9), n[17] || sn(1, 15), sn(12, 15), sn(1, 9), Math.round(tot / 1000)]); done++; changed = true;
      await sleep(300);
    }
    if (changed) { s.rows.sort((a, b) => a[0].localeCompare(b[0])); fs.writeFileSync(f, JSON.stringify(s)); stocks++; }
  }
  const idx = rd(path.join(OUT, 'index.json')) || { dates: [] };
  const all = new Set(idx.dates); for (const f of fs.readdirSync(OUT).filter(f => /^\d{4}\.json$/.test(f))) for (const r of (rd(path.join(OUT, f)) || { rows: [] }).rows) all.add(r[0]);
  idx.dates = [...all].sort(); fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  // 剩餘進度
  let left = 0; for (const code of codes) { const s = rd(path.join(OUT, code + '.json')); const have = new Map((s ? s.rows : []).map(r => [r[0], r])); left += dates.filter(d => { const r = have.get(isoOf(d)); return !r || r[7] == null; }).length; }
  console.log(`::notice::回補 ${done} 筆（${stocks} 檔），失敗 ${fail} 筆，尚餘約 ${left} 筆`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
