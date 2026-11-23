// 檢查觀測站彙總表 HTML 結構（表頭寫法與表格 class）
(async () => {
  const body = new URLSearchParams({ encodeURIComponent: 1, step: 1, firstin: 1, off: 1, isQuery: 'Y', TYPEK: 'sii', year: '115', season: '02' });
  const r = await fetch('https://mopsov.twse.com.tw/mops/web/ajax_t163sb04', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const h = await r.text(); console.log('長度', h.length);
  for (const k of ['公司代號', '公司<br>代號', '代號', 'hasBorder', '<th', 'tblHead', '2330', '基本每股盈餘', '查詢無資料']) console.log(k, h.indexOf(k));
  const i = h.indexOf('<table', h.indexOf('2330') - 20000); console.log(h.slice(Math.max(0, h.indexOf('<table', 3000)), Math.max(0, h.indexOf('<table', 3000)) + 1500).replace(/\s+/g, ' '));
  const j = h.indexOf('2330'); console.log('--- 2330 附近', h.slice(j - 300, j + 600).replace(/\s+/g, ' '));
})();
