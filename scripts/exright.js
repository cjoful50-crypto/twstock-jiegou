// 除權息、減資、面額變更事件：用來把歷史股價「還原」，避免均線、支撐壓力、報酬被價格斷層扭曲
// 輸出 data/exright.json：{ updated, ev: { code: [[生效日, 調整係數], ...] } }，調整係數 = 參考價 ÷ 前一日收盤
// 生效日之前的價格乘上係數即為還原價（現金股利、配股、減資、分割都適用）
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'exright.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => { const v = parseFloat(String(s).replace(/[,\s]/g, '')); return isNaN(v) ? null : v; };
const roc = s => { const m = String(s).match(/(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return `${+m[1] + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; const n = String(s).match(/^(\d{3})(\d{2})(\d{2})$/); return n ? `${+n[1] + 1911}-${n[2]}-${n[3]}` : null; };
async function getJson(u) { for (let a = 0; a < 3; a++) { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(40000) }); const t = await r.text(); return JSON.parse(t); } catch (e) { await sleep(4000 * (a + 1)); } } return null; }
const rowsOf = j => { if (!j) return []; if (Array.isArray(j.data)) return j.data; const t = (j.tables || [])[0]; return (t && t.data) || []; };
(async () => {
  const FROM = process.env.FROM || '2024-12-01', today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const prev = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { ev: {} }; } })();
  const start = process.env.FULL ? FROM : (prev.updated ? new Date(+new Date(prev.updated) - 40 * 864e5).toISOString().slice(0, 10) : FROM);
  const ev = prev.ev || {}; let added = 0;
  const add = (code, d, f) => { if (!/^[1-9]\d{3}$/.test(code) || !d || !(f > 0) || Math.abs(f - 1) < 1e-4) return; const L = ev[code] || (ev[code] = []); if (L.some(x => x[0] === d)) return; L.push([d, +f.toFixed(6)]); L.sort((a, b) => a[0].localeCompare(b[0])); added++; };
  // 每半年一段查詢
  const spans = []; for (let d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= today; d.setUTCMonth(d.getUTCMonth() + 6)) { const e = new Date(d); e.setUTCMonth(e.getUTCMonth() + 6); e.setUTCDate(e.getUTCDate() - 1); spans.push([d.toISOString().slice(0, 10), e.toISOString().slice(0, 10) > today ? today : e.toISOString().slice(0, 10)]); }
  const ymd = s => s.replace(/-/g, ''), sl = s => s.replace(/-/g, '/');
  for (const [a, b] of spans) {
    // 上市：除權息、面額變更
    for (const r of rowsOf(await getJson(`https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${ymd(a)}&endDate=${ymd(b)}&response=json`))) { const p = num(r[3]), ref = num(r[4]); if (p && ref) add(String(r[1]).trim(), roc(r[0]), ref / p); }
    await sleep(2000);
    for (const r of rowsOf(await getJson(`https://www.twse.com.tw/rwd/zh/change/TWTB8U?startDate=${ymd(a)}&endDate=${ymd(b)}&response=json`))) { const p = num(r[3]), ref = num(r[4]); if (p && ref) add(String(r[1]).trim(), roc(r[0]), ref / p); }
    await sleep(2000);
    // 上市：減資（參考價 =（停止前收盤 − 每股退還股款）÷ 換股率，停止前收盤稍後由行情補上，這裡先記換股資料）
    for (const r of rowsOf(await getJson(`https://www.twse.com.tw/rwd/zh/reducation/TWTAVU?startDate=${ymd(a)}&endDate=${ymd(b)}&response=json`))) { const ratio = num(r[4]), refund = num(r[6]) || 0; const d = roc(r[3]); if (ratio > 0 && d) { const L = ev['_cr'] || (ev['_cr'] = []); if (!L.some(x => x[0] === String(r[1]).trim() && x[1] === d)) L.push([String(r[1]).trim(), d, roc(r[0]), ratio, refund]); } }
    await sleep(2000);
    // 上櫃：除權息、減資
    for (const r of rowsOf(await getJson(`https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=${encodeURIComponent(sl(a))}&endDate=${encodeURIComponent(sl(b))}&response=json`))) { const p = num(r[3]), ref = num(r[4]); if (p && ref) add(String(r[1]).trim(), roc(r[0]), ref / p); }
    await sleep(2000);
    for (const r of rowsOf(await getJson(`https://www.tpex.org.tw/www/zh-tw/bulletin/revivt?startDate=${sl(a)}&endDate=${sl(b)}&response=json`))) { const p = num(r[3]), ref = num(r[4]); if (p && ref) add(String(r[1]).trim(), roc(r[0]), ref / p); }
    await sleep(2000);
  }
  // 上市減資：用行情快取找停止買賣前最後收盤，算出係數
  const C = path.join(__dirname, '..', 'data', 'cache', 'daily'); const dayFiles = fs.existsSync(C) ? fs.readdirSync(C).sort() : [];
  for (const [code, resume, stop, ratio, refund] of (ev['_cr'] || [])) {
    if ((ev[code] || []).some(x => x[0] === resume)) continue;
    let pc = null; for (let k = dayFiles.length - 1; k >= 0; k--) { const d = dayFiles[k].slice(0, 10); if (d >= (stop || resume)) continue; const q = JSON.parse(fs.readFileSync(path.join(C, dayFiles[k]), 'utf8')); if (q[code] && q[code][3]) { pc = q[code][3]; break; } }
    if (pc) add(code, resume, ((pc - refund) / ratio) / pc);
  }
  fs.writeFileSync(OUT, JSON.stringify({ updated: today, ev }));
  console.log(`::notice::除權息等事件：新增 ${added} 筆，共 ${Object.keys(ev).filter(k => k !== '_cr').length} 檔`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
