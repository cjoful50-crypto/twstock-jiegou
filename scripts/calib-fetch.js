// 校正用：用網站同一套 api/stock.js 抓指定股票，存到 data/calib/（不部署）
const fs = require('fs'), path = require('path');
const handler = require('../api/stock.js');
const codes = (process.env.CODES || '').split(/[,\s]+/).filter(Boolean);
const call = code => new Promise(resolve => {
  const res = { _s: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this._s = s; return this; }, end(body) { resolve({ status: this._s, body }); } };
  handler({ query: { code } }, res);
});
(async () => {
  const dir = path.join(__dirname, '..', 'data', 'calib'); fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const c of codes) {
    const r = await call(c);
    if (r.status === 200) { fs.writeFileSync(path.join(dir, c + '.json'), r.body); ok++; } else console.log('失敗', c, r.body.slice(0, 120));
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log(`::notice::校正資料 ${ok}/${codes.length}`);
})();
