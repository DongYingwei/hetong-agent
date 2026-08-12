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
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    ctx.state.user = decoded; // 挂载当前登录用户信息
    await next();
  } catch (err) {
    console.error('JWT 校验失败原因:', err.message);
    return ctx.fail('登录凭证已过期，请重新登录: ' + err.message, 401);
  }
}
