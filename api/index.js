// Waline 服务端入口
// 文档: https://waline.js.org/guide/deploy/vercel.html
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { server } = require('@waline/vercel');

if (!server) {
  throw new Error('Waline server export not found');
}

export default server;