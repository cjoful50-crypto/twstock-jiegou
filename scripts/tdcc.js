// 集保戶股權分散表（每週）：整理每檔股票的大戶與散戶持股比例，存成每檔一個檔案，逐週累積
// 來源：臺灣集中保管結算所開放資料 https://opendata.tdcc.com.tw/getOD.ashx?id=1-5
// 持股分級：1=1~999股 … 9=40,001~50,000股、12=400,001~600,000、15=1,000,001股以上、17=合計
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'tdcc');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
(async () => {
  let text = null;
  for (let a = 0; a < 3 && !text; a++) {
    try { const r = await fetch('https://opendata.tdcc.com.tw/getOD.ashx?id=1-5', { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.ok) text = await r.text(); else console.log('HTTP', r.status); }
    catch (e) { console.log('失敗', String(e)); await new Promise(z => setTimeout(z, 5000)); }
  }
  if (!text) throw new Error('集保資料下載失敗');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const by = {}; let date = null;
  for (const ln of lines.slice(1)) {
    const c = ln.split(',').map(s => s.replace(/"/g, '').trim()); if (c.length < 6) continue;
    const [d, code, lv, people, shares, pct] = c; if (!/^[1-9]\d{3}$/.test(code)) continue;
    date = d; const o = by[code] || (by[code] = { p: {}, n: {}, s: {} }); o.p[+lv] = parseFloat(pct) || 0; o.n[+lv] = +people || 0; o.s[+lv] = +shares || 0;
  }
  if (!date || Object.keys(by).length < 500) throw new Error('資料筆數不足：' + Object.keys(by).length);
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  let n = 0;
  const sumP = (o, a, b) => { let s = 0; for (let k = a; k <= b; k++) s += o.p[k] || 0; return +s.toFixed(2); };
  const sumN = (o, a, b) => { let s = 0; for (let k = a; k <= b; k++) s += o.n[k] || 0; return s; };
  for (const [code, o] of Object.entries(by)) {
    // 每週一列：[日期, 千張大戶%, 400張以上%, 50張以下散戶%, 總股東人數, 400張以上人數, 50張以下人數, 集保總張數]
    let tot = o.s[17]; if (!tot) { tot = 0; for (let k = 1; k <= 15; k++) tot += o.s[k] || 0; }
    const row = [iso, sumP(o, 15, 15), sumP(o, 12, 15), sumP(o, 1, 9), o.n[17] || sumN(o, 1, 15), sumN(o, 12, 15), sumN(o, 1, 9), Math.round(tot / 1000)];
    const f = path.join(OUT, code + '.json'); const s = rd(f) || { code, rows: [] };
    s.rows = s.rows.filter(r => r[0] !== iso).concat([row]).sort((a, b) => a[0].localeCompare(b[0])).slice(-104);
    fs.writeFileSync(f, JSON.stringify(s)); n++;
  }
  const idx = rd(path.join(OUT, 'index.json')) || { dates: [] };
  idx.dates = [...new Set(idx.dates.concat(iso))].sort(); idx.latest = iso;
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  console.log(`::notice::集保資料 ${iso}：${n} 檔`);
})().catch(e => { console.log('::error::' + String(e && e.stack || e).replace(/\n/g, ' | ')); process.exit(1); });
