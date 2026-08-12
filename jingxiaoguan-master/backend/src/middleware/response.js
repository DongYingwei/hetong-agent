/**
 * 统一后端 JSON 响应拦截格式中间件
 * 符合 plan.md 要求: {"code": 200|400|500, "msg": "success|失败原因", "data": {} | []}
 */
export async function responseHandler(ctx, next) {
  // 注入便捷挂载响应助手
  ctx.success = (data = {}, msg = 'success') => {
    ctx.body = {
      code: 200,
      msg,
      data,
    };
  };

  ctx.fail = (msg = '请求失败', code = 400, data = null) => {
    ctx.body = {
      code,
      msg,
      data,
    };
  };

  try {
    await next();
  } catch (err) {
    console.error('❌ 服务器运行捕获错误:', err);
    ctx.status = 200; // 统一 HTTP 返回 200，在响应体中使用 500 表示业务异常
    ctx.body = {
      code: err.status || 500,
      msg: err.message || '服务器内部错误',
      data: null,
    };
  }
}
