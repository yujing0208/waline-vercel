// Waline 服务端入口
// 文档: https://waline.js.org/guide/deploy/vercel.html
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const waline = require('@waline/vercel');

// 导出处理函数
export default waline.server || waline.default || waline;