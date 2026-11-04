// 會員：註冊、登入、讀寫個人資料（我的選股、庫存）
// 資料存在 Vercel Blob 私人儲存空間（需要環境變數 BLOB_READ_WRITE_TOKEN，於 Vercel 建立 Blob 並連結專案時自動加入）
//   GET  /api/member?status=1                  → { enabled }
//   POST /api/member { action, user, pass }     → action 為 register 或 login，回傳 { token, user }
//   GET  /api/member  （Authorization: Bearer） → { watch, holdings, updated_at } 或 null
//   PUT  /api/member  （Authorization: Bearer） → 存入 { watch, holdings, updated_at }
// 密碼以 scrypt 加鹽雜湊保存；登入憑證以 HMAC 簽章，有效 180 天。
const crypto = require('crypto');
const { put, get, list } = require('@vercel/blob');

// 兩種連線方式：BLOB_READ_WRITE_TOKEN，或較新的 BLOB_STORE_ID＋Vercel OIDC（每次請求帶在標頭）
const RW = process.env.BLOB_READ_WRITE_TOKEN, STORE = process.env.BLOB_STORE_ID;
let AUTH = {};
const enabled = () => !!(RW || STORE);
// 簽章用密鑰：優先用環境變數，否則第一次使用時產生一組，存在私人儲存空間
let SECRET = process.env.MEMBER_SECRET || RW || '';
async function ensureSecret() {
  if (SECRET) return;
  const s = await readJson('members/_secret.json');
  if (s && s.k) { SECRET = s.k; return; }
  const k = crypto.randomBytes(32).toString('hex'); await writeJson('members/_secret.json', { k }); SECRET = k;
}
const b64u = b => Buffer.from(b).toString('base64url');
const uidOf = name => crypto.createHash('sha256').update('jiegou:' + name.toLowerCase()).digest('hex').slice(0, 32);
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = (uid, name) => { const p = b64u(JSON.stringify({ u: uid, n: name, e: Date.now() + 180 * 864e5 })); return p + '.' + sign(p); };
function readToken(req) {
  const h = String(req.headers.authorization || ''); const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [p, s] = t.split('.'); if (!p || !s) return null;
  const good = sign(p); if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch (e) { return null; }
}
async function readJson(path) {
  const r = await get(path, Object.assign({ access: 'private', useCache: false }, AUTH)); if (!r) return null;
  const chunks = []; for await (const c of r.stream) chunks.push(Buffer.from(c)); return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const writeJson = (path, obj) => put(path, JSON.stringify(obj), Object.assign({ access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }, AUTH));
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 64).toString('hex');
function body(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((ok, fail) => { let d = ''; req.on('data', c => { d += c; if (d.length > 300000) { fail(new Error('資料太大')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { fail(new Error('格式錯誤')); } }); });
}
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };

// 後台資料：會員統計（只取檔案清單，不讀個人內容）＋ Vercel Web Analytics（需要環境變數 VERCEL_TOKEN）
const PROJECT = 'prj_ttQj3GM82Ik1FGW1pctlNv3qCNF6', TEAM = 'team_7jHZyBuJGkDLat8xpzsejtqZ';
async function adminData() {
  const out = { members: null, traffic: null };
  try { const blobs = []; let cursor; do { const r = await list(Object.assign({ prefix: 'members/', limit: 1000, cursor }, AUTH)); blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : null; } while (cursor);
    const users = blobs.filter(b => b.pathname.endsWith('/user.json')), data = blobs.filter(b => b.pathname.endsWith('/data.json'));
    const day = 864e5, now = Date.now(), at = b => new Date(b.uploadedAt).getTime();
    out.members = { total: users.length, synced: data.length, active7: data.filter(b => now - at(b) < 7 * day).length, active30: data.filter(b => now - at(b) < 30 * day).length,
      lastSync: data.length ? new Date(Math.max(...data.map(at))).toISOString() : null };
    // 會員列表：只列帳號名稱、註冊時間、最近同步時間，不讀取選股與庫存內容
    const syncOf = new Map(data.map(b => [b.pathname.split('/')[1], b.uploadedAt]));
    const rows = await Promise.all(users.slice(0, 300).map(async b => { const uid = b.pathname.split('/')[1]; let u = null; try { u = await readJson(b.pathname); } catch (e) {}
      return { name: u && u.name || '（無法讀取）', created: u && u.created || null, lastSync: syncOf.get(uid) ? new Date(syncOf.get(uid)).toISOString() : null }; }));
    out.members.list = rows.sort((x, y) => String(y.created || '').localeCompare(String(x.created || '')));
  } catch (e) { out.members = { error: String(e.message || e) }; }
  const tok = process.env.VERCEL_TOKEN;
  if (!tok) { out.traffic = { missing: true }; return out; }
  const q = async (path, params) => { const u = new URL('https://api.vercel.com/v1/query/web-analytics/visits/' + path); Object.entries(Object.assign({ projectId: PROJECT, teamId: TEAM }, params)).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status); return j.data; };
  const tpe = d => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10), today = new Date(), ago = n => tpe(new Date(today.getTime() - n * 864e5));
  try {
    const [d1, d7, d30, daily, pages, dev, ref] = await Promise.all([
      q('count', { since: ago(0), until: ago(0) + 'T23:59:59' }), q('count', { since: ago(6), until: ago(0) + 'T23:59:59' }), q('count', { since: ago(29), until: ago(0) + 'T23:59:59' }),
      q('aggregate', { since: ago(29), until: ago(0) + 'T23:59:59', by: 'day' }), q('aggregate', { since: ago(6), until: ago(0) + 'T23:59:59', by: 'requestPath', limit: 20 }),
      q('aggregate', { since: ago(29), until: ago(0) + 'T23:59:59', by: 'deviceType' }), q('aggregate', { since: ago(29), until: ago(0) + 'T23:59:59', by: 'referrerHostname', limit: 10 })]);
    out.traffic = { today: d1, week: d7, month: d30, daily, pages, dev, ref };
  } catch (e) { out.traffic = { error: String(e.message || e) }; }
  return out;
}

module.exports = async (req, res) => {
  try {
    const oidc = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
    AUTH = !RW && STORE && oidc ? { oidcToken: oidc, storeId: STORE } : {};
    if (req.method === 'GET' && req.query && req.query.status) return send(res, 200, { enabled: enabled(), via: RW ? 'token' : STORE ? (oidc ? 'oidc' : 'store-no-oidc') : 'none' });
    if (!enabled()) return send(res, 503, { error: '會員功能尚未啟用。' });
    await ensureSecret();

    if (req.method === 'POST') {
      const b = await body(req); const name = String(b.user || '').trim(), pass = String(b.pass || '');
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) return send(res, 400, { error: '帳號請用 3～24 個英文字母、數字或 _ . -。' });
      if (pass.length < 6 || pass.length > 100) return send(res, 400, { error: '密碼至少 6 個字元。' });
      const uid = uidOf(name), path = `members/${uid}/user.json`, u = await readJson(path);
      if (b.action === 'register') {
        if (u) return send(res, 409, { error: '這個帳號已有人使用，請換一個。' });
        const salt = crypto.randomBytes(16).toString('hex');
        await writeJson(path, { name, salt, hash: hashPass(pass, salt), created: new Date().toISOString(), fails: 0 });
        return send(res, 200, { token: makeToken(uid, name), user: name });
      }
      if (b.action === 'login') {
        if (!u) return send(res, 401, { error: '帳號或密碼錯誤。' });
        if (u.lockUntil && u.lockUntil > Date.now()) return send(res, 429, { error: '密碼錯誤次數過多，請 15 分鐘後再試。' });
        const ok = crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
        if (!ok) { u.fails = (u.fails || 0) + 1; if (u.fails >= 8) { u.lockUntil = Date.now() + 15 * 60e3; u.fails = 0; } await writeJson(path, u); return send(res, 401, { error: '帳號或密碼錯誤。' }); }
        if (u.fails || u.lockUntil) { u.fails = 0; delete u.lockUntil; await writeJson(path, u); }
        return send(res, 200, { token: makeToken(uid, u.name), user: u.name });
      }
      return send(res, 400, { error: '不支援的操作。' });
    }

    const t = readToken(req); if (!t) return send(res, 401, { error: '登入已過期，請重新登入。' });
    // 後台：只限管理員帳號（ADMIN_USERS 以逗號分隔，預設 diane）
    if (req.method === 'GET' && req.query && req.query.admin) {
      const admins = String(process.env.ADMIN_USERS || 'diane').toLowerCase().split(',').map(x => x.trim());
      if (!admins.includes(String(t.n).toLowerCase())) return send(res, 403, { error: '此帳號沒有後台權限。' });
      return send(res, 200, await adminData());
    }
    const dpath = `members/${t.u}/data.json`;
    if (req.method === 'GET') return send(res, 200, { user: t.n, data: await readJson(dpath) });
    if (req.method === 'PUT') {
      const b = await body(req);
      const clean = { watch: Array.isArray(b.watch) ? b.watch.slice(0, 500) : [], holdings: Array.isArray(b.holdings) ? b.holdings.slice(0, 500) : [], prefs: b.prefs ? { cols: Array.isArray(b.prefs.cols) ? b.prefs.cols.filter(x => typeof x === 'string').slice(0, 20) : [], ...(Array.isArray(b.prefs.mopts) ? { mopts: b.prefs.mopts.filter(x => typeof x === 'string').slice(0, 20) } : {}) } : {}, updated_at: String(b.updated_at || new Date().toISOString()) };
      await writeJson(dpath, clean); return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: '不支援的方法。' });
  } catch (e) { return send(res, 500, { error: '伺服器暫時無法處理，請稍後再試。', detail: String(e && e.message || e) }); }
};
