// 一次性回補：成交最熱絡的股票，補過去幾週的集保股權分散（之後每週由開放資料自動累積）
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'tdcc'), CACHE = path.join(__dirname, '..', 'data', 'cache', 'daily');
const N = +(process.env.N || 600), OFFS = (process.env.OFFS || '1,2,3,4,8,12').split(',').map(Number);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const U = 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
let tok = null, ck = '';
const grabTok = html => { const m = html.match(/name="SYNCHRONIZER_TOKEN" value="([^"]+)"/); if (m) tok = m[1]; };
async function req(opts) { for (let a = 0; a < 4; a++) { try { const r = await fetch(U, Object.assign({ signal: AbortSignal.timeout(30000) }, opts)); const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) ck = sc.map(c => c.split(';')[0]).join('; '); const t = await r.text(); grabTok(t); return t; } catch (e) { await sleep(3000 * (a + 1)); } } return ''; }
const num = s => parseFloat(String(s).replace(/,/g, '')) || 0;
(async () => {
  const first = await req({ headers: UA }); const dates = [...first.matchAll(/<option value="(\d{8})"/g)].map(m => m[1]);
  const want = OFFS.map(o => dates[o]).filter(Boolean);
  // 近 20 個交易日平均成交值最大的 N 檔
  const files = fs.readdirSync(CACHE).sort().slice(-30).map(n => rd(path.join(CACHE, n))).filter(x => x && !x.holiday).slice(-20);
  const tv = {}; for (const d of files) for (const [c, b] of Object.entries(d)) if (b[3] && b[4]) tv[c] = (tv[c] || 0) + b[3] * b[4];
  const codes = Object.entries(tv).sort((a, b) => b[1] - a[1]).slice(0, N).map(x => x[0]);
  console.log('週別', want.join(','), '股票', codes.length);
  let done = 0, fail = 0;
  for (const code of codes) {
    const f = path.join(OUT, code + '.json'); const s = rd(f) || { code, rows: [] }; const have = new Set(s.rows.map(r => r[0]));
    for (const d of want) {
      const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; if (have.has(iso)) continue;
      const body = new URLSearchParams({ SYNCHRONIZER_TOKEN: tok, SYNCHRONIZER_URI: '/portal/zh/smWeb/qryStock', method: 'submit', firDate: dates[0], scaDate: d, sqlMethod: 'StockNo', stockNo: code, stockName: '' });
      const h = await req({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck, Referer: U }, UA), body });
      const rows = [...h.matchAll(/<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>/g)];
      if (rows.length < 10) { fail++; if (!tok) { await req({ headers: UA }); } await sleep(1500); continue; }
      const p = {}, n = {}; for (const m of rows) { p[+m[1]] = num(m[4]); n[+m[1]] = num(m[2]); }
      const sp = (a, b) => { let x = 0; for (let k = a; k <= b; k++) x += p[k] || 0; return +x.toFixed(2); }, sn = (a, b) => { let x = 0; for (let k = a; k <= b; k++) x += n[k] || 0; return x; };
      s.rows.push([iso, sp(15, 15), sp(12, 15), sp(1, 9), n[17] || sn(1, 15), sn(12, 15), sn(1, 9)]); done++;
      await sleep(350);
    }
    s.rows.sort((a, b) => a[0].localeCompare(b[0])); fs.writeFileSync(f, JSON.stringify(s));
  }
  const idx = rd(path.join(OUT, 'index.json')) || { dates: [] };
  idx.dates = [...new Set(idx.dates.concat(want.map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)))].sort(); fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  console.log(`::notice::回補完成：${done} 筆，失敗 ${fail} 筆`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
