// Waline 服务端入口
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const waline = require('@waline/vercel');

export default waline.server || waline.default || waline;