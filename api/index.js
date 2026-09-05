// ============================================================
// TEMP IMPORT ROUTE —— Twikoo -> Waline 数据迁移专用（一次性）
// 使用后立即回退到正式版 b581097af76a1f0d7799150ba8a428b20832bb17
// ============================================================
const IMPORT_TOKEN = '877ca50565e63a5a58d296b5540f2712f97dd9de';
const ADMIN_EMAIL = '2803673194@qq.com';

function qid(c) {
  return '"' + String(c).replace(/"/g, '""') + '"';
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function fmtTs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function decodeUrl(u) {
  try {
    return decodeURI(u);
  } catch (e) {
    return u;
  }
}

function dbConfig(e) {
  const ssl = e.POSTGRES_SSL === 'true' || e.POSTGRES_SSL === undefined
    ? { rejectUnauthorized: false }
    : undefined;
  if (e.POSTGRES_URL) {
    return { connectionString: e.POSTGRES_URL, ssl };
  }
  return {
    host: e.POSTGRES_HOST,
    port: Number(e.POSTGRES_PORT || 5432),
    user: e.POSTGRES_USER,
    password: e.POSTGRES_PASSWORD,
    database: e.POSTGRES_DATABASE,
    ssl,
  };
}

function pick(existing, candidates) {
  for (const c of candidates) if (existing.includes(c)) return c;
  return null;
}

async function importRoute(req, res) {
  const u = new URL(req.url || '/', 'http://internal');
  const token = u.searchParams.get('token') || req.headers['x-wb-token'] || '';
  if (token !== IMPORT_TOKEN) {
    return send(res, 403, { ok: false, err: 'forbidden' });
  }

  const op = u.searchParams.get('op') || 'schema';
  const urlMode = u.searchParams.get('urlMode') || 'decode';
  const force = u.searchParams.get('force') === '1';
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    return send(res, 500, { ok: false, err: 'pg require fail: ' + e.message });
  }

  const client = new pg.Client(dbConfig(process.env));
  try {
    await client.connect();
  } catch (e) {
    return send(res, 500, { ok: false, err: 'connect fail: ' + e.message });
  }

  try {
    // ---------- schema ----------
    if (op === 'schema') {
      const tables = ['wl_comment', 'wl_users', 'wl_counter'];
      const cols = {};
      for (const t of tables) {
        const r = await client.query(
          `SELECT column_name, data_type, column_default FROM information_schema.columns
           WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
        cols[t] = r.rows;
      }
      const urls = await client.query('SELECT DISTINCT url FROM wl_comment ORDER BY url LIMIT 200');
      const users = await client.query('SELECT id, email, display_name, type FROM wl_users ORDER BY id');
      const seqs = await client.query(
        `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'`);
      const cmtCount = await client.query('SELECT COUNT(*)::int AS n FROM wl_comment');
      return send(res, 200, {
        ok: true,
        envKeys: Object.keys(process.env).filter((k) => k.toUpperCase().includes('POSTGRES') || k === 'DATABASE_URL' || k === 'MARKDOWN_TEX'),
        columns: cols,
        sequences: seqs.rows.map((r) => r.sequence_name),
        distinctUrls: urls.rows.map((r) => r.url),
        users: users.rows,
        commentCount: cmtCount.rows[0].n,
      });
    }

    // ---------- clean probe ----------
    if (op === 'cleanprobe') {
      const d = await client.query(`DELETE FROM wl_comment WHERE url LIKE '/__wb_probe__/%'`);
      return send(res, 200, { ok: true, deleted: d.rowCount });
    }

    // ---------- repair: 删除 force 误插(45..55 孤儿重复)，并补回缺失的 ac732652 ----------
    if (op === 'repair') {
      const del = await client.query(`DELETE FROM wl_comment WHERE id > 44`);
      const p = await client.query(
        `SELECT id FROM wl_comment WHERE url='/friends' AND nick='匿名' AND comment LIKE '%Wuの小站%' ORDER BY id LIMIT 1`);
      let patched = 0;
      let err = '';
      if (p.rows.length > 0) {
        const P = p.rows[0].id;
        const ex = await client.query(`SELECT id FROM wl_comment WHERE pid=$1 AND rid=$1 AND nick='YuJing'`, [P]);
        if (ex.rows.length === 0) {
          const maxR = await client.query(`SELECT COALESCE(MAX(id),0) AS m FROM wl_comment`);
          const nid = Number(maxR.rows[0].m) + 1;
          await client.query(
            `INSERT INTO wl_comment (${qid('id')},${qid('user_id')},${qid('comment')},${qid('insertedat')},${qid('ip')},${qid('link')},${qid('mail')},${qid('nick')},${qid('pid')},${qid('rid')},${qid('status')},${qid('like')},${qid('ua')},${qid('url')},${qid('createdat')},${qid('updatedat')})
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              nid, 1, '<p>已添加|´・ω・)ノ</p>\n', fmtTs(1788519274064), '36.57.106.158',
              'https://www.yujingblog.top/', '2803673194@qq.com', 'YuJing', P, P,
              'approved', 0,
              'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
              '/friends', fmtTs(1788519274064), fmtTs(1788519274064),
            ]);
          patched = 1;
        } else {
          err = 'ac732652 parent-target already exists';
        }
      } else {
        err = 'parent 1901d608 not found';
      }
      await client.query(`SELECT setval(pg_get_serial_sequence('wl_comment','id'), COALESCE((SELECT MAX(id) FROM wl_comment),1))`).catch(() => {});
      const c = await client.query(`SELECT COUNT(*)::int AS n FROM wl_comment`);
      return send(res, 200, { ok: true, deletedOrphans: del.rowCount, patched, err, finalCount: c.rows[0].n });
    }

    // ---------- run import ----------
    if (op === 'run') {
      const body = await readBody(req);
      const rows = body.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return send(res, 400, { ok: false, err: 'body.data empty' });
      }

      const colsC = (await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='wl_comment'`)).rows.map((r) => r.column_name);
      const colsU = (await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='wl_users'`)).rows.map((r) => r.column_name);

      // existing users by email (lower)
      const existing = await client.query('SELECT id, email, type FROM wl_users');
      const userByEmail = new Map();
      for (const row of existing.rows) {
        const k = String(row.email || '').trim().toLowerCase();
        if (k && !userByEmail.has(k)) userByEmail.set(k, row);
      }

      let adminUser = null;
      for (const v of userByEmail.values()) {
        if (String(v.email).trim().toLowerCase() === ADMIN_EMAIL) { adminUser = v; break; }
      }

      // comment columns available
      const cUser = pick(colsC, ['user_id']);
      const cComment = pick(colsC, ['comment']);
      const cIp = pick(colsC, ['ip']);
      const cLink = pick(colsC, ['link']);
      const cMail = pick(colsC, ['mail']);
      const cNick = pick(colsC, ['nick']);
      const cPid = pick(colsC, ['pid']);
      const cRid = pick(colsC, ['rid']);
      const cSticky = pick(colsC, ['sticky']);
      const cStatus = pick(colsC, ['status']);
      const cLike = pick(colsC, ['like']);
      const cUa = pick(colsC, ['ua']);
      const cUrl = pick(colsC, ['url']);
      const cCreatedAt = pick(colsC, ['createdAt', 'createdat', 'created_at']);
      const cUpdatedAt = pick(colsC, ['updatedAt', 'updatedat', 'updated_at']);
      const cInsertedAt = pick(colsC, ['insertedAt', 'insertedat', 'inserted_at']);
      const cId = pick(colsC, ['id']);

      // --- build user plan (by mail, lowercase); anon -> null user_id
      const mailGroups = new Map();
      for (const r of rows) {
        const m = String(r.mail || '').trim();
        const key = m.toLowerCase();
        if (!m) continue;
        if (!mailGroups.has(key)) {
          mailGroups.set(key, {
            mail: m,
            nick: r.nick,
            link: r.link,
            isAdminMail: key === ADMIN_EMAIL,
          });
        }
      }

      const userCreateCols = [];
      const ucDisplay = pick(colsU, ['display_name']);
      const ucEmail = pick(colsU, ['email']);
      const ucPassword = pick(colsU, ['password']);
      const ucType = pick(colsU, ['type']);
      const ucUrl = pick(colsU, ['url']);
      if (ucDisplay) userCreateCols.push(ucDisplay);
      if (ucEmail) userCreateCols.push(ucEmail);
      if (ucPassword) userCreateCols.push(ucPassword);
      if (ucType) userCreateCols.push(ucType);
      if (ucUrl) userCreateCols.push(ucUrl);

      const mailToUserId = new Map();
      let createdUsers = 0;
      let reusedUsers = 0;

      for (const [key, g] of mailGroups) {
        if (key === ADMIN_EMAIL && adminUser) {
          mailToUserId.set(key, adminUser.id);
          reusedUsers++;
          continue;
        }
        const existed = userByEmail.get(key);
        if (existed) {
          mailToUserId.set(key, existed.id);
          reusedUsers++;
          continue;
        }
        // create
        const vals = [];
        if (ucDisplay) vals.push(g.nick || '');
        if (ucEmail) vals.push(g.mail);
        if (ucPassword) vals.push('');
        if (ucType) vals.push(g.isAdminMail ? 'administrator' : '');
        if (ucUrl) vals.push(g.link || null);
        const ph = userCreateCols.map((_, i) => '$' + (i + 1)).join(',');
        const ins = await client.query(
          `INSERT INTO wl_users (${userCreateCols.map(qid).join(',')}) VALUES (${ph}) RETURNING id`,
          vals);
        mailToUserId.set(key, ins.rows[0].id);
        createdUsers++;
      }

      // --- id plan & duplicate detect
      const maxR = await client.query('SELECT COALESCE(MAX(id),0) AS m FROM wl_comment');
      let seq = Number(maxR.rows[0].m);
      const idMap = new Map();

      const insertCols = [];
      if (cId) insertCols.push(cId);
      if (cUser) insertCols.push(cUser);
      for (const c of [cComment, cIp, cLink, cMail, cNick, cPid, cRid, cSticky, cStatus, cLike, cUa, cUrl]) if (c) insertCols.push(c);
      if (cCreatedAt) insertCols.push(cCreatedAt);
      if (cUpdatedAt) insertCols.push(cUpdatedAt);
      if (cInsertedAt) insertCols.push(cInsertedAt);

      let inserted = 0;
      let skippedDup = 0;
      let skippedNoComment = 0;

      for (const r of rows) {
        // duplicate guard (like waline): url + nick + comment
        const urlVal = urlMode === 'raw' ? r.url : decodeUrl(String(r.url || ''));
        const dup = await client.query(
          `SELECT id, pid, rid FROM wl_comment WHERE url=$1 AND nick=$2 AND comment=$3`,
          [urlVal, r.nick || '', r.comment || '']);
        if (dup.rows.length > 0) {
          // 历史数据存在"同内容回复不同人"的真重复；仅当父/根引用完全一致才视为重试
          const fpid = r.pid ? (idMap.get(r.pid) || null) : null;
          const frid = r.rid ? (idMap.get(r.rid) || null) : null;
          const exactDup = dup.rows.some((x) => x.pid === fpid && x.rid === frid);
          if (exactDup || !force) { skippedDup++; continue; }
        }
        if (!r.comment) { skippedNoComment++; continue; }

        const newId = ++seq;
        idMap.set(r._id, newId);
        const m = String(r.mail || '').trim();
        const uid = m ? (mailToUserId.get(m.toLowerCase()) ?? null) : null;

        const vals = [];
        const placeholders = [];
        let i = 0;
        const push = (v) => { i++; placeholders.push('$' + i); vals.push(v); };
        for (const c of insertCols) {
          if (c === cId) push(newId);
          else if (cUser && c === cUser) push(uid);
          else if (c === cComment) push(r.comment);
          else if (c === cIp) push(r.ip || '');
          else if (c === cLink) push(r.link || null);
          else if (c === cMail) push(r.mail || null);
          else if (c === cNick) push(r.nick || '');
          else if (c === cPid) push(r.pid ? (idMap.get(r.pid) ?? null) : null);
          else if (c === cRid) push(r.rid ? (idMap.get(r.rid) ?? null) : null);
          else if (c === cSticky) push(r.top ? 1 : null);
          else if (c === cStatus) push('approved');
          else if (c === cLike) push(Array.isArray(r.ups) ? r.ups.length : 0);
          else if (c === cUa) push(r.ua || '');
          else if (c === cUrl) push(urlVal);
          else if (c === cCreatedAt) push(fmtTs(r.created || Date.now()));
          else if (c === cUpdatedAt) push(fmtTs(r.updated || r.created || Date.now()));
          else if (c === cInsertedAt) push(fmtTs(r.created || Date.now()));
        }

        if (vals.length !== insertCols.length) {
          throw new Error('column mapping mismatch');
        }
        await client.query(
          `INSERT INTO wl_comment (${insertCols.map(qid).join(',')}) VALUES (${placeholders.join(',')})`,
          vals);
        inserted++;
      }

      // sync sequences
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('wl_comment','id'), COALESCE((SELECT MAX(id) FROM wl_comment),1))`);
      } catch (e) { /* ignore */ }
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('wl_users','id'), COALESCE((SELECT MAX(id) FROM wl_users),1))`);
      } catch (e) { /* ignore */ }

      // clean probe leftovers (from earlier debugging)
      const delProbe = await client.query(`DELETE FROM wl_comment WHERE url LIKE '/__wb_probe__/%'`);

      const finalCount = await client.query('SELECT COUNT(*)::int AS n FROM wl_comment');
      return send(res, 200, {
        ok: true,
        totalRows: rows.length,
        inserted,
        skippedDup,
        skippedNoComment,
        createdUsers,
        reusedUsers,
        adminUserEmail: ADMIN_EMAIL,
        adminUserId: adminUser ? adminUser.id : null,
        urlMode,
        probeDeleted: delProbe.rowCount,
        finalCommentCount: finalCount.rows[0].n,
        sampleUrls: (await client.query(
          `SELECT id, url, nick, LEFT(comment,30) AS cmt, createdat FROM wl_comment ORDER BY id DESC LIMIT 8`
        )).rows,
      });
    }

    return send(res, 400, { ok: false, err: 'unknown op' });
  } catch (e) {
    return send(res, 500, { ok: false, err: String(e && e.stack || e) });
  } finally {
    try { await client.end(); } catch (e) { /* ignore */ }
  }
}

// ============================================================
// 原正式逻辑（懒初始化入口）
// ============================================================
const Application = require('@waline/vercel');

// @waline/vercel 导出的是工厂函数，调用后才返回请求处理器。
// 与官方模板的差异：官方在模块顶层直接调用 Application(...)，
// 在 Vercel 上会因冷启动初始化阶段耗时过长导致 FUNCTION_INVOCATION_FAILED；
// 改为首个请求到达时初始化（并缓存），可正常工作。
let handlerPromise = null;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = Promise.resolve(
      Application({
        plugins: [],
        async postSave(comment) {
          // 如需在评论保存后做额外处理(通知/审核),可在此扩展
        },
      })
    );
  }
  return handlerPromise;
}

module.exports = async function (req, res) {
  try {
    const pathname = String(req.url || '').split('?')[0];
    if (pathname.startsWith('/__wb_import__')) {
      return await importRoute(req, res);
    }
  } catch (e) {
    send(res, 500, { ok: false, err: String(e && e.stack || e) });
    return;
  }
  const handler = await getHandler();
  return handler(req, res);
};
