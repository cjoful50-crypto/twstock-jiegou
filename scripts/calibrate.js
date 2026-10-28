// 本機校正：調整評分參數，讓強度分數接近參考分數；分成訓練組與驗證組，避免只貼合樣本
const fs = require('fs'), path = require('path');
const Engine = require('../engine.js');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'calib-targets.json'), 'utf8'));
const dir = path.join(__dirname, '..', 'data', 'calib');
const S = {}; for (const c of Object.keys(T)) { const f = path.join(dir, c + '.json'); if (fs.existsSync(f)) S[c] = JSON.parse(fs.readFileSync(f, 'utf8')); }
const codes = Object.keys(S).sort();
// 固定方式分組：每 3 檔取 1 檔當驗證組
const FOLD = +(process.env.FOLD ?? 2);
const test = codes.filter((_, i) => i % 3 === FOLD), train = codes.filter((_, i) => i % 3 !== FOLD);
const key = { t: 0, v: 1, i: 2, c: 3, f: 4 };
function evalSet(P, set, dimW = 0.35) {
  let e = 0, n = 0, de = 0, dn = 0;
  for (const c of set) {
    const a = Engine.analyze(S[c], P), [ti, , td] = T[c];
    e += Math.abs(a.index - ti); n++;
    for (const [k, v] of Object.entries(td)) { const o = a.dims[key[k]].s; if (o != null) { de += Math.abs(o - v); dn++; } }
  }
  return { mae: e / n, dim: dn ? de / dn : 0, loss: e / n + dimW * (dn ? de / dn : 0) };
}
const D = Engine.DEFAULTS;
// 可調參數與範圍
const SPACE = {
  t_m5: [0, 12], t_m20: [6, 30], t_m60: [0, 16], t_slope: [0, 12], t_align: [0, 16], t_hist: [0, 10], t_chgK: [0, 1], t_chgHi: [0, 10],
  v_scale: [0.1, 0.8], i_k: [20, 120], i_cap: [15, 45], i_trust: [0, 12], i_streak: [0, 4], i_today: [0, 10],
  c_scale: [0.2, 1], f_base: [30, 55], f_yoyK: [0.2, 1], f_yoyHi: [10, 35],
  w_t: [0.1, 0.45], w_v: [0.05, 0.3], w_i: [0.1, 0.35], w_c: [0.05, 0.25], w_f: [0.1, 0.35],
  p_risk: [-16, 0], p_bt: [5, 25], p_bk: [0, 1.6], p_bmax: [5, 30], p_rsi: [-12, 0], p_r1s: [-14, 0], p_r1: [-10, 0]
};
let best = Object.assign({}, D), bestL = evalSet(best, train).loss;
const rnd = (() => { let x = 20261029; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const keys = process.env.KEYS ? process.env.KEYS.split(',') : Object.keys(SPACE);
const LAMBDA = +(process.env.LAMBDA || 0);
const reg = P => keys.reduce((a, k) => a + Math.abs(P[k] - D[k]) / (SPACE[k][1] - SPACE[k][0]), 0) * LAMBDA;
// 座標下降＋隨機擾動
for (let round = 0; round < 40; round++) {
  let improved = false;
  for (const k of keys) {
    const [lo, hi] = SPACE[k];
    for (const frac of [-0.25, -0.1, 0.1, 0.25]) {
      const cand = Object.assign({}, best); cand[k] = Math.min(hi, Math.max(lo, best[k] + frac * (hi - lo)));
      const L = evalSet(cand, train).loss + reg(cand); if (L < bestL - 1e-6) { best = cand; bestL = L; improved = true; }
    }
  }
  if (!improved) { // 隨機跳一下，避免卡在局部
    const cand = Object.assign({}, best); for (const k of keys) if (rnd() < 0.3) { const [lo, hi] = SPACE[k]; cand[k] = Math.min(hi, Math.max(lo, best[k] + (rnd() - 0.5) * 0.3 * (hi - lo))); }
    const L = evalSet(cand, train).loss + reg(cand); if (L < bestL) { best = cand; bestL = L; } else if (round > 30) break;
  }
}
const r = x => Math.round(x * 100) / 100;
const before = { train: evalSet(D, train), test: evalSet(D, test), all: evalSet(D, codes) }, after = { train: evalSet(best, train), test: evalSet(best, test), all: evalSet(best, codes) };
console.log('樣本', codes.length, '訓練', train.length, '驗證', test.length);
for (const g of ['train', 'test', 'all']) console.log(g, '前 MAE', r(before[g].mae), '面向', r(before[g].dim), '→ 後 MAE', r(after[g].mae), '面向', r(after[g].dim));
const changed = {}; for (const k of keys) if (Math.abs(best[k] - D[k]) > 1e-9) changed[k] = r(best[k]);
console.log('PARAMS', JSON.stringify(changed));
console.log(codes.map(c => `${c}:${Engine.analyze(S[c], best).index}/${T[c][0]}`).join(' '));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(best));
