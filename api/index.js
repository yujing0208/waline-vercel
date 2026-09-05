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
  const handler = await getHandler();
  return handler(req, res);
};
