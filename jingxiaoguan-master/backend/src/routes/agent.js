import Router from '@koa/router';
import { chat } from '../services/agentService.js';

const router = new Router({ prefix: '/api/agent' });

// 健康检查
router.get('/health', async (ctx) => {
  ctx.success({ status: 'ok' }, 'Contract Assistant Agent is ready');
});

// 对话接口 - 调用真实智能体
router.post('/chat', async (ctx) => {
  const { message, history = [] } = ctx.request.body;

  if (!message) {
    return ctx.fail('消息内容不能为空', 400);
  }

  console.log(`📝 收到智能体消息: ${message}`);

  const result = await chat(message, history);
  if (result.success) {
    ctx.success({ content: result.content });
  } else {
    ctx.fail(result.error || '智能体处理失败', 500);
  }
});

export default router;