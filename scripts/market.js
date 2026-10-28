// 全市場日報抓取（給 GitHub Actions 每日排程用）：上市＝證交所，上櫃＝櫃買中心
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'zh-TW,zh;q=0.9' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => { if (s == null) return null; const v = parseFloat(String(s).replace(/[,\s+]/g, '')); return isNaN(v) ? null : v; };

// 每個主機各自排隊，證交所間隔 1.2 秒、櫃買 0.8 秒，避免被暫時封鎖
const lanes = {};
async function get(url, gap) {
  const host = new URL(url).host; const lane = lanes[host] || (lanes[host] = { last: 0, chain: Promise.resolve() });
  const run = lane.chain.then(async () => {
    const wait = lane.last + gap - Date.now(); if (wait > 0) await sleep(wait);
    lane.last = Date.now();
    for (let a = 0; a < 3; a++) {
      try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); const t = await r.text(); if (!r.ok) throw new Error('HTTP ' + r.status); return JSON.parse(t); }
      catch (e) { if (a === 2) { console.log('失敗', url, String(e)); return null; } await sleep(4000 * (a + 1)); lane.last = Date.now(); }
    }
  });
  lane.chain = run.catch(() => {});
  return run;
}
const twse = u => get('https://www.twse.com.tw/rwd/zh' + u, 1200);
const tpex = u => get('https://www.tpex.org.tw/www/zh-tw' + u, 800);
const ymd = d => d.replace(/-/g, ''), sl = d => d.replace(/-/g, '/');
const okCode = c => /^[1-9]\d{3}$/.test(c);

/* 單日收盤：{ quotes: {code:[o,h,l,c,v張,name,market]}, taiex } */
async function daily(d) {
  const quotes = {}; let taiex = null;
  const j = await twse(`/afterTrading/MI_INDEX?date=${ymd(d)}&type=ALLBUT0999&response=json`);
  if (j && j.stat === 'OK') {
    for (const t of j.tables || []) {
      const f = t.fields || [];
      if (f.includes('證券代號') && f.includes('收盤價')) {
        const ix = k => f.indexOf(k), iC = ix('證券代號'), iN = ix('證券名稱'), iV = ix('成交股數'), iO = ix('開盤價'), iH = ix('最高價'), iL = ix('最低價'), iP = ix('收盤價');
        for (const r of t.data || []) { const c = String(r[iC]).trim(); if (!okCode(c)) continue; const p = num(r[iP]); if (!p) continue; quotes[c] = [num(r[iO]), num(r[iH]), num(r[iL]), p, Math.round((num(r[iV]) || 0) / 1000), String(r[iN]).trim(), 'tse']; }
      } else if (f.includes('指數') && f.includes('收盤指數')) {
        const r = (t.data || []).find(x => String(x[0]).includes('發行量加權股價指數')); if (r) taiex = num(r[1]);
      }
    }
  }
  const k = await tpex(`/afterTrading/otc?date=${sl(d)}&type=EW&response=json`);
  const t = k && (k.tables || [])[0];
  const roc = `${+d.slice(0, 4) - 1911}/${d.slice(5, 7)}/${d.slice(8, 10)}`;
  if (t && (t.data || []).length && (!t.date || String(t.date).trim() === roc)) {
    for (const r of t.data) { const c = String(r[0]).trim(); if (!okCode(c)) continue; const p = num(r[2]); if (!p) continue; quotes[c] = [num(r[4]), num(r[5]), num(r[6]), p, Math.round((num(r[7]) || 0) / 1000), String(r[1]).trim(), 'otc']; }
  }
  return { quotes, taiex, n: Object.keys(quotes).length, noData: !!(j && j.stat && j.stat !== 'OK') };
}
/* 單日三大法人：{code:[外資,投信,自營]}（張） */
async function inst(d) {
  const out = {};
  const j = await twse(`/fund/T86?date=${ymd(d)}&selectType=ALLBUT0999&response=json`);
  for (const r of (j && j.data) || []) { const c = String(r[0]).trim(); if (okCode(c)) out[c] = [Math.round(num(r[4]) / 1000), Math.round(num(r[10]) / 1000), Math.round(num(r[11]) / 1000)]; }
  const k = await tpex(`/insti/dailyTrade?type=Daily&sect=EW&date=${sl(d)}&response=json`);
  for (const r of ((k && (k.tables || [])[0]) || {}).data || []) { const c = String(r[0]).trim(); if (okCode(c)) out[c] = [Math.round(num(r[4]) / 1000), Math.round(num(r[13]) / 1000), Math.round(num(r[22]) / 1000)]; }
  return out;
}
/* 單日本益比、殖利率、股價淨值比：{code:[pe,yld,pb]} */
async function val(d) {
  const out = {};
  const j = await twse(`/afterTrading/BWIBBU_d?date=${ymd(d)}&selectType=ALL&response=json`);
  for (const r of (j && j.data) || []) { const c = String(r[0]).trim(); if (okCode(c)) out[c] = [num(r[5]), num(r[3]), num(r[6])]; }
  const k = await tpex(`/afterTrading/peQryDate?date=${sl(d)}&response=json`);
  for (const r of ((k && (k.tables || [])[0]) || {}).data || []) { const c = String(r[0]).trim(); if (okCode(c)) out[c] = [num(r[2]), num(r[5]), num(r[6])]; }
  return out;
}
/* 最新月營收：{code:{yoy,mom,month}} 與資料年月 */
async function revenue() {
  const out = {};
  for (const url of ['https://openapi.twse.com.tw/v1/opendata/t187ap05_L', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O']) {
    const j = await get(url, 800);
    for (const x of Array.isArray(j) ? j : []) {
      const k = p => Object.keys(x).find(z => z.includes(p)); const ym = String(x[k('資料年月')] || '');
      out[String(x['公司代號']).trim()] = { yoy: num(x[k('去年同月增減')]), mom: num(x[k('上月比較增減')]), month: ym.length >= 4 ? `${+ym.slice(0, -2) + 1911}/${ym.slice(-2)}` : null };
    }
  }
  return out;
}
module.exports = { daily, inst, val, revenue, sleep };
