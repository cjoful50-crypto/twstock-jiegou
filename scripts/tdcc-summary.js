// 集保摘要：每檔的千張大戶週變化、4 週變化、連續增減週數、4 週變化在全市場的排名、平均每人持股張數
// 輸出 data/tdcc/summary.json：{ date, s: { code: [千張大戶%, 1週變化, 4週變化, 連續週數(+增/-減), 4週變化排名百分位, 平均每人張數, 4週前平均張數] } }
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'tdcc');
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const day = s => +new Date(s + 'T00:00:00Z') / 864e5;
const r2 = x => x == null ? null : +x.toFixed(2);
const idx = rd(path.join(OUT, 'index.json')) || {}; const latest = idx.latest;
const S = {};
for (const f of fs.readdirSync(OUT).filter(f => /^\d{4}\.json$/.test(f))) {
  const j = rd(path.join(OUT, f)); if (!j || !j.rows.length) continue; const R = j.rows, L = R.at(-1); if (latest && L[0] !== latest) continue;
  const prev = R.length > 1 && day(L[0]) - day(R.at(-2)[0]) <= 10 ? R.at(-2) : null;
  const p4 = [...R].reverse().find(r => day(L[0]) - day(r[0]) >= 25 && day(L[0]) - day(r[0]) <= 35) || null;
  // 連續週數：每週都要有資料（相隔 10 天內）且同方向
  let streak = 0; for (let k = R.length - 1; k > 0; k--) { if (day(R[k][0]) - day(R[k - 1][0]) > 10) break; const d = R[k][1] - R[k - 1][1]; const sg = d > 0.005 ? 1 : d < -0.005 ? -1 : 0; if (!sg || (streak && Math.sign(streak) !== sg)) break; streak += sg; }
  const avg = r => r && r[7] && r[4] ? r[7] / r[4] : null;
  S[f.slice(0, 4)] = [L[1], prev ? r2(L[1] - prev[1]) : null, p4 ? r2(L[1] - p4[1]) : null, streak, null, r2(avg(L)), r2(avg(p4))];
}
const withC4 = Object.entries(S).filter(([, v]) => v[2] != null).sort((a, b) => a[1][2] - b[1][2]);
withC4.forEach(([c], i) => { S[c][4] = Math.round(i / Math.max(1, withC4.length - 1) * 100); });
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ date: latest, n4: withC4.length, s: S }));
console.log(`::notice::集保摘要 ${latest}：${Object.keys(S).length} 檔，可排名 ${withC4.length} 檔`);
