import Koa from 'koa';
import cors from '@koa/cors';
import { koaBody } from 'koa-body';
import serve from 'koa-static';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { responseHandler } from './middleware/response.js';
import { authMiddleware } from './middleware/auth.js';
import { cleanExpiredFiles } from './services/cleanupService.js';

import authRoutes from './routes/auth.js';
import dictRoutes from './routes/dict.js';
import userRoutes from './routes/user.js';
import contractRoutes from './routes/contract.js';
import keywordRoutes from './routes/keyword.js';
import sectionRoutes from './routes/section.js';
import fileRoutes from './routes/file.js';
import agentRoutes from './routes/agent.js';
import parseRoutes from './routes/parse.js';
import menuRoutes from './routes/menu.js';
import homepageRoutes from './routes/homepage.js';
import roleRoutes from './routes/role.js';
import departmentRoutes from './routes/department.js';
import orderRoutes from './routes/order.js';
import keywordRescanRoutes from './routes/keywordRescan.js';
import contractOrderLinkRoutes from './routes/contractOrderLink.js';
import { resumeKeywordRescanJobs } from './services/keywordRescanService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Koa();

// 1. 跨域与 JSON / 文件上传中间件
app.use(cors({ origin: '*' }));
app.use(
  koaBody({
    multipart: true,
    formidable: {
      // 同一字段名 files 可携带一个合同的多个 PDF/Word 附件；默认 false 会只保留其中一个。
      multiples: true,
      // 单合同附件最大 500MB；ZIP 合同包最大 1GB，具体格式/大小由解析路由二次校验。
      maxFileSize: 1024 * 1024 * 1024,
      maxTotalFileSize: 1024 * 1024 * 1024,
      keepExtensions: true,
    },
  })
);

// 2. 静态文件目录服务（支持 /uploads 路径下访问持久化合同/文件）
app.use(serve(path.join(__dirname, '../uploads')));

// 3. 挂载统一响应拦截与 JWT 认证拦截
app.use(responseHandler);
app.use(authMiddleware);

// 4. 路由挂载 (全部模块数据连接 MySQL 数据库)
app.use(authRoutes.routes()).use(authRoutes.allowedMethods());
app.use(dictRoutes.routes()).use(dictRoutes.allowedMethods());
app.use(userRoutes.routes()).use(userRoutes.allowedMethods());
app.use(contractRoutes.routes()).use(contractRoutes.allowedMethods());
app.use(keywordRoutes.routes()).use(keywordRoutes.allowedMethods());
app.use(sectionRoutes.routes()).use(sectionRoutes.allowedMethods());
app.use(fileRoutes.routes()).use(fileRoutes.allowedMethods());
app.use(agentRoutes.routes()).use(agentRoutes.allowedMethods());
app.use(parseRoutes.routes()).use(parseRoutes.allowedMethods());
app.use(menuRoutes.routes()).use(menuRoutes.allowedMethods());
app.use(homepageRoutes.routes()).use(homepageRoutes.allowedMethods());
app.use(roleRoutes.routes()).use(roleRoutes.allowedMethods());
app.use(departmentRoutes.routes()).use(departmentRoutes.allowedMethods());
app.use(orderRoutes.routes()).use(orderRoutes.allowedMethods());
app.use(keywordRescanRoutes.routes()).use(keywordRescanRoutes.allowedMethods());
app.use(contractOrderLinkRoutes.routes()).use(contractOrderLinkRoutes.allowedMethods());

// 5. 健康检查
app.use(async (ctx, next) => {
  // 宿主机直连用 /health；经 Nginx 的同源反代保留 /api 前缀。
  if (ctx.path === '/health' || ctx.path === '/api/health') {
    ctx.success({ status: 'ok', time: new Date() }, 'Contract Assistant Koa Server is running');
    return;
  }
  await next();
});

// 6. 定时轮询清理 3 个月保留期限过期的持久化文件 (每 12 小时自动检查一次)
setInterval(() => {
  cleanExpiredFiles();
}, 12 * 60 * 60 * 1000);

const PORT = config.server.port;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 经小管智能体 Koa 后端服务已成功启动：http://0.0.0.0:${PORT}`);
  console.log(`🔑 DEEPSEEK_API_KEY: ${config.deepseek.apiKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`🌐 DEEPSEEK_BASE_URL: ${config.deepseek.baseURL}`);
});

// 持久化任务在服务启动后继续执行；不依赖浏览器会话或进程内存。
void resumeKeywordRescanJobs();
