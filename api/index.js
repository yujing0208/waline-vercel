// Waline 服务端入口
// 文档: https://waline.js.org/guide/deploy/vercel.html
import pkg from '@waline/vercel';

// Waline 导出的是 default 或 server
const handler = pkg.default || pkg.server;

if (!handler) {
  console.error('Waline exports:', Object.keys(pkg));
  throw new Error('Waline server export not found');
}

export default handler;