// 會員：註冊、登入、讀寫個人資料（我的選股、庫存）
// 資料存在 Vercel Blob 私人儲存空間（需要環境變數 BLOB_READ_WRITE_TOKEN，於 Vercel 建立 Blob 並連結專案時自動加入）
//   GET  /api/member?status=1                  → { enabled }
//   POST /api/member { action, user, pass }     → action 為 register 或 login，回傳 { token, user }
//   GET  /api/member  （Authorization: Bearer） → { watch, holdings, updated_at } 或 null
//   PUT  /api/member  （Authorization: Bearer） → 存入 { watch, holdings, updated_at }
// 密碼以 scrypt 加鹽雜湊保存；登入憑證以 HMAC 簽章，有效 180 天。
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const SECRET = process.env.MEMBER_SECRET || TOKEN || '';
const enabled = () => !!TOKEN;
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
  const r = await get(path, { access: 'private', useCache: false }); if (!r) return null;
  const chunks = []; for await (const c of r.stream) chunks.push(Buffer.from(c)); return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const writeJson = (path, obj) => put(path, JSON.stringify(obj), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 64).toString('hex');
function body(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((ok, fail) => { let d = ''; req.on('data', c => { d += c; if (d.length > 300000) { fail(new Error('資料太大')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { fail(new Error('格式錯誤')); } }); });
}
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET' && req.query && req.query.status) return send(res, 200, { enabled: enabled() });
    if (!enabled()) return send(res, 503, { error: '會員功能尚未啟用。' });

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
    const dpath = `members/${t.u}/data.json`;
    if (req.method === 'GET') return send(res, 200, { user: t.n, data: await readJson(dpath) });
    if (req.method === 'PUT') {
      const b = await body(req);
      const clean = { watch: Array.isArray(b.watch) ? b.watch.slice(0, 500) : [], holdings: Array.isArray(b.holdings) ? b.holdings.slice(0, 500) : [], updated_at: String(b.updated_at || new Date().toISOString()) };
      await writeJson(dpath, clean); return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: '不支援的方法。' });
  } catch (e) { return send(res, 500, { error: '伺服器暫時無法處理，請稍後再試。', detail: String(e && e.message || e) }); }
};
