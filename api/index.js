const Application = require('@waline/vercel');

// 官方推荐入口: @waline/vercel 导出工厂函数,必须调用后才返回请求处理器
// https://waline.js.org/guide/deploy/vercel.html
module.exports = Application({
  plugins: [],
  async postSave(comment) {
    // 如需在评论保存后做额外处理(通知/审核),可在此扩展
  },
});
