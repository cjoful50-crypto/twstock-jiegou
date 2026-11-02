// 測試：集保歷史查詢頁能否取得過去週別資料
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
(async () => {
  const U = 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock';
  const r = await fetch(U, { headers: UA }); const html = await r.text(); const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
  const tok = (html.match(/name="SYNCHRONIZER_TOKEN" value="([^"]+)"/) || [])[1];
  const dates = [...html.matchAll(/<option value="(\d{8})"/g)].map(m => m[1]);
  console.log('::notice::status', r.status, 'token', !!tok, 'dates', dates.length, dates.slice(0, 3).join(','), dates.slice(-2).join(','), 'captcha', /captcha|驗證碼/i.test(html));
  const inputs = [...html.matchAll(/<input[^>]*>/g)].map(m => m[0]).filter(x => /name=/.test(x)).map(x => x.replace(/\s+/g, ' ')).join(' || ');
  console.log('::notice::inputs ' + inputs.slice(0, 900));
  const form = (html.match(/<form[^>]*>/g) || []).join(' ');
  console.log('::notice::forms ' + form.slice(0, 400));
  if (!tok || !dates.length) return;
  const body = new URLSearchParams({ SYNCHRONIZER_TOKEN: tok, SYNCHRONIZER_URI: '/portal/zh/smWeb/qryStock', method: 'submit', firDate: dates[0], scaDate: dates[5], sqlMethod: 'StockNo', stockNo: '2330', stockName: '' });
  const p = await fetch(U, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck, Referer: U }, UA), body });
  const h2 = await p.text(); const rows = [...h2.matchAll(/<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>/g)].map(m => m.slice(1).join('|'));
  console.log('::notice::post', p.status, 'rows', rows.length, rows.slice(-3).join(' ; '));
  if (!rows.length) console.log(h2.replace(/\s+/g, ' ').slice(0, 3000));
})().catch(e => console.log('::error::' + e));
