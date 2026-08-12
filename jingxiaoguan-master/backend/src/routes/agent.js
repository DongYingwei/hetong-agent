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
    // 透传 CoreMind 富格式（前端 MessageItem 扩展字段，T11 用；无值不影响老前端）
    ctx.success({
      content: result.content,
      tableData: result.tableData,
      sql: result.sql,
      citations: result.citations,
    });
  } else {
    ctx.fail(result.error || '智能体处理失败', result.code || 500);
  }
});

export default router;