// ===== TEMP DIAGNOSTIC BUILD v2 (revert after debugging) =====
const fs = require('fs');
const path = require('path');

const BOOT = [];
let handler = null;
let bootError = null;
let loaded = false;

process.on('uncaughtException', (e) => {
  BOOT.push('!! uncaughtException: ' + ((e && e.stack) || String(e)));
});
process.on('unhandledRejection', (e) => {
  BOOT.push('!! unhandledRejection: ' + ((e && e.stack) || String(e)));
});

const WATCH = [
  '@waline/vercel', 'jsdom', 'parse5', 'cssstyle',
  'html-encoding-sniffer', 'entities', 'better-sqlite3', 'whatwg-encoding',
];

function versions() {
  const out = [];
  for (const p of WATCH) {
    try {
      const f = path.join(process.cwd(), 'node_modules', p, 'package.json');
      out.push('  ' + p + ' = ' + JSON.parse(fs.readFileSync(f, 'utf8')).version);
    } catch (e) {
      out.push('  ' + p + ' = <读不到: ' + (e.code || e.message) + '>');
    }
  }
  return out.join('\n');
}

function lazyInit() {
  if (loaded) return;
  loaded = true;
  try {
    const Application = require('@waline/vercel');
    BOOT.push('require OK, typeof = ' + typeof Application);
    handler = Application({ plugins: [], async postSave(comment) { return comment; } });
    BOOT.push('Application() OK, typeof handler = ' + typeof handler);
  } catch (e) {
    bootError = e;
    BOOT.push('BOOT FAILED: ' + ((e && e.stack) || String(e)));
  }
}

module.exports = async function (req, res) {
  const send = (code, text) => {
    try {
      res.statusCode = code;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(text);
    } catch (_) {}
  };

  const head = 'node = ' + process.version + '\ncwd = ' + process.cwd() + '\ninstalled:/n';

  // 存活探针：不加载 waline，只报告环境
  if (req.url && req.url.indexOf('__alive=1') !== -1) {
    return send(200, '=== ALIVE ===\n' + head + versions() + '\nboot log:/n' + BOOT.join('\n') + '\n');
  }

  lazyInit();
  if (bootError) {
    return send(500, '=== BOOT ERROR ===\n' + head + versions() + '\n' + BOOT.join('\n') + '\n');
  }

  try {
    const r = handler(req, res);
    if (r && typeof r.then === 'function') await r;
  } catch (e) {
    return send(500, '=== RUNTIME ERROR ===\n' + head + versions() + '\n' +
      BOOT.join('\n') + '\n--- error ---\n' + ((e && e.stack) || String(e)) + '\n');
  }
};
