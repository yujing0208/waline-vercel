// ===== TEMP DIAGNOSTIC BUILD (revert after debugging) =====
const fs = require('fs');
const path = require('path');

const lines = [];
const log = (s) => lines.push(String(s));

function readPkgVersion() {
  try { return require('@waline/vercel/package.json').version; } catch (e) {}
  try {
    let dir = path.dirname(require.resolve('@waline/vercel'));
    for (let i = 0; i < 5; i++) {
      const c = path.join(dir, 'package.json');
      if (fs.existsSync(c)) return JSON.parse(fs.readFileSync(c, 'utf8')).version;
      dir = path.dirname(dir);
    }
  } catch (e) {}
  return 'unreadable';
}

function envReport() {
  const keys = Object.keys(process.env)
    .filter((k) => /^(PG_|POSTGRES|MONGO|MYSQL|SQLITE|LEANCLOUD|DATABASE)/i.test(k))
    .sort();
  const out = [];
  for (const k of keys) {
    let v = String(process.env[k]);
    if (/PASSWORD|SECRET|TOKEN/i.test(k)) {
      v = '***(hidden)';
    } else if (/URL|URI|DSN/i.test(k) && v.indexOf('@') !== -1) {
      v = '@' + v.split('@').slice(-1)[0]; // 只保留 host/db/query，去掉凭据
    }
    out.push('  ' + k + ' = ' + v);
  }
  return out.length ? out.join('\n') : '  (none)';
}

let Application = null;
let handler = null;
let bootError = null;
let stage = 'init';

try {
  stage = "require('@waline/vercel')";
  Application = require('@waline/vercel');
  log('require OK, typeof export = ' + typeof Application);

  stage = 'read version';
  log('@waline/vercel version = ' + readPkgVersion());

  stage = 'Application(config)';
  handler = Application({
    plugins: [],
    async postSave(comment) { return comment; },
  });
  log('Application() OK, typeof handler = ' + typeof handler);
} catch (e) {
  bootError = e;
  log('BOOT FAILED at stage: ' + stage);
  log('error name: ' + (e && e.name));
  log('error message: ' + (e && e.message));
  log('stack:/n' + ((e && e.stack) || String(e)));
}

log('node = ' + process.version);
log('cwd = ' + process.cwd());
log('env (db related):\n' + envReport());

const BOOT_LOG = lines.join('\n');

module.exports = async function (req, res) {
  const send = (code, text) => {
    try {
      res.statusCode = code;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(text);
    } catch (_) {}
  };

  // 诊断探针：任意路径加 ?__diag=1 即可查看启动信息
  if (req.url && req.url.indexOf('__diag=1') !== -1) {
    return send(200, '=== WALINE DIAGNOSTIC (boot) ===\n' + BOOT_LOG + '\n');
  }

  if (bootError) {
    return send(500, '=== WALINE BOOT DIAGNOSTIC ===\n' + BOOT_LOG + '\n');
  }

  try {
    const r = handler(req, res);
    if (r && typeof r.then === 'function') await r;
  } catch (e) {
    return send(
      500,
      '=== WALINE RUNTIME DIAGNOSTIC ===\n' +
        BOOT_LOG +
        '\n\n--- runtime error ---\n' +
        ((e && e.stack) || String(e)) +
        '\n'
    );
  }
};
