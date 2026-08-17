import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * JWT Token 登录认证与权限鉴权中间件
 */
export async function authMiddleware(ctx, next) {
  // 免鉴权白名单接口
  const whiteList = ['/api/auth/login', '/api/dict/init', '/health', '/api/file/download'];
  
  if (whiteList.some((url) => ctx.path.startsWith(url))) {
    return await next();
  }

  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ctx.fail('未登录或凭证无效，请重新登录', 401);
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    console.error('JWT 校验失败原因:', err.message);
    return ctx.fail('登录凭证已过期，请重新登录: ' + err.message, 401);
  }

  // 只将 JWT 解析失败视为未登录。下游路由/数据库异常由 responseHandler
  // 返回业务错误，避免把正常用户强制登出。
  ctx.state.user = decoded;
  return await next();
}
