// Waline 服务端入口
// 文档: https://waline.js.org/guide/deploy/vercel.html
import { init } from '@waline/vercel';

export default async function handler(req, res) {
  // 初始化 Waline
  const waline = await init({
    // 数据库配置（使用 SQLite 默认配置）
    // 生产环境建议使用 MySQL/PostgreSQL
    env: process.env.WALINE_DB_TYPE || 'sqlite',
    
    // 管理员配置
    adminEmail: process.env.WALINE_ADMIN_EMAIL || 'admin@yujingblog.top',
    
    // 其他配置
    locales: {
      placeholder: '欢迎留言交流～',
    },
    
    // 表情包
    emoji: [
      '//unpkg.com/@waline/emojis@1.2.0/bilibili',
      '//unpkg.com/@waline/emojis@1.2.0/weibo',
    ],
    
    // 元数据
    meta: ['nick', 'mail', 'link'],
    requiredMeta: [],
    login: 'enable',
    wordLimit: [0, 2000],
    pageSize: 10,
    highlighter: false,
    imageUploader: false,
    texRenderer: false,
    search: false,
    reaction: false,
    lang: 'zh-CN',
  });

  return waline(req, res);
}