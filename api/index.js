// ===== TEMP DIAGNOSTIC + INITDB BUILD (revert after use) =====
const fs = require('fs');
const path = require('path');

const BOOT = [];
let handler = null, bootError = null, loaded = false;

process.on('uncaughtException', (e) => BOOT.push('!! uncaughtException: ' + ((e && e.stack) || String(e))));
process.on('unhandledRejection', (e) => BOOT.push('!! unhandledRejection: ' + ((e && e.stack) || String(e))));

const INIT_TOKEN = '6b0e3266eed9fd286996cfe140716b8cbbaf1ca6';
const SQL = `
CREATE SEQUENCE IF NOT EXISTS wl_comment_seq;

CREATE TABLE IF NOT EXISTS wl_comment (
  id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_comment_seq'),
  user_id int DEFAULT NULL,
  comment text,
  insertedAt timestamp(0) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip varchar(100) DEFAULT '',
  link varchar(255) DEFAULT NULL,
  mail varchar(255) DEFAULT NULL,
  nick varchar(255) DEFAULT NULL,
  pid int DEFAULT NULL,
  rid int DEFAULT NULL,
  sticky numeric DEFAULT NULL,
  status varchar(50) NOT NULL DEFAULT '',
  "like" int DEFAULT NULL,
  ua text,
  url varchar(255) DEFAULT NULL,
  createdAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ;


CREATE SEQUENCE IF NOT EXISTS wl_counter_seq;

CREATE TABLE IF NOT EXISTS wl_counter (
  id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_counter_seq'),
  time int DEFAULT NULL,
  reaction0 int DEFAULT NULL,
  reaction1 int DEFAULT NULL,
  reaction2 int DEFAULT NULL,
  reaction3 int DEFAULT NULL,
  reaction4 int DEFAULT NULL,
  reaction5 int DEFAULT NULL,
  reaction6 int DEFAULT NULL,
  reaction7 int DEFAULT NULL,
  reaction8 int DEFAULT NULL,
  url varchar(255) NOT NULL DEFAULT '',
  createdAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ;


CREATE SEQUENCE IF NOT EXISTS wl_users_seq;

CREATE TABLE IF NOT EXISTS wl_users (
  id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_users_seq'),
  display_name varchar(255) NOT NULL DEFAULT '',
  email varchar(255) NOT NULL DEFAULT '',
  password varchar(255) NOT NULL DEFAULT '',
  type varchar(50) NOT NULL DEFAULT '',
  label varchar(255) DEFAULT NULL,
  url varchar(255) DEFAULT NULL,
  avatar varchar(255) DEFAULT NULL,
  github varchar(255) DEFAULT NULL,
  twitter varchar(255) DEFAULT NULL,
  facebook varchar(255) DEFAULT NULL,
  google varchar(255) DEFAULT NULL,
  weibo varchar(255) DEFAULT NULL,
  qq varchar(255) DEFAULT NULL,
  oidc varchar(255) DEFAULT NULL,
  huawei varchar(255) DEFAULT NULL,
  "2fa" varchar(32) DEFAULT NULL,
  createdAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ;
`;

async function initDb() {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER || process.env.PG_USER,
    password: process.env.POSTGRES_PASSWORD || process.env.PG_PASSWORD,
    database: process.env.POSTGRES_DATABASE || process.env.PG_DB,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25000,
  });
  const log = [];
  await client.connect();
  log.push('connected to ' + process.env.POSTGRES_HOST);
  const stmts = SQL.split(';').map((s) => s.trim()).filter(Boolean);
  log.push('statements: ' + stmts.length);
  for (const st of stmts) {
    const head = st.split('\n')[0].slice(0, 70);
    try { await client.query(st); log.push('OK   | ' + head); }
    catch (e) { log.push('FAIL | ' + head + ' -> ' + e.message); }
  }
  const t = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by 1"
  );
  await client.end();
  log.push('TABLES NOW: ' + t.rows.map((r) => r.table_name).join(', '));
  return log.join('\n');
}

const WATCH = ['@waline/vercel', 'jsdom', 'parse5', 'cssstyle', 'html-encoding-sniffer', 'entities', 'pg'];
function versions() {
  const out = [];
  for (const p of WATCH) {
    try {
      const f = path.join(process.cwd(), 'node_modules', p, 'package.json');
      out.push('  ' + p + ' = ' + JSON.parse(fs.readFileSync(f, 'utf8')).version);
    } catch (e) { out.push('  ' + p + ' = <读不到>'); }
  }
  return out.join('\n');
}

function lazyInit() {
  if (loaded) return;
  loaded = true;
  try {
    const Application = require('@waline/vercel');
    BOOT.push('require OK');
    handler = Application({ plugins: [], async postSave(comment) { return comment; } });
    BOOT.push('Application() OK, typeof handler = ' + typeof handler);
  } catch (e) {
    bootError = e;
    BOOT.push('BOOT FAILED: ' + ((e && e.stack) || String(e)));
  }
}

module.exports = async function (req, res) {
  const send = (code, text) => {
    try { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(text); }
    catch (_) {}
  };
  const url = req.url || '';
  const head = 'node = ' + process.version + '\ninstalled://n' + versions() + '\n';

  if (url.indexOf('__alive=1') !== -1) {
    return send(200, '=== ALIVE ===\n' + head + 'boot log://n' + BOOT.join('\n') + '\n');
  }

  // 一次性建表端点（需密钥；用完立即回退本文件）
  if (url.indexOf('__initdb=1') !== -1) {
    if (url.indexOf('token=' + INIT_TOKEN) === -1) {
      return send(403, 'forbidden');
    }
    try {
      const out = await initDb();
      return send(200, '=== INITDB DONE ===\n' + out + '\n');
    } catch (e) {
      return send(500, '=== INITDB FAILED ===\n' + ((e && e.stack) || String(e)) + '\n');
    }
  }

  lazyInit();
  if (bootError) {
    return send(500, '=== BOOT ERROR ===\n' + head + BOOT.join('\n') + '\n');
  }
  try {
    const r = handler(req, res);
    if (r && typeof r.then === 'function') await r;
  } catch (e) {
    return send(500, '=== RUNTIME ERROR ===\n' + head + ((e && e.stack) || String(e)) + '\n');
  }
};
