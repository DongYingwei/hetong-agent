import { config } from '../config/index.js';

/**
 * 查询智能体代理服务（T10：不再用网关裸 generateText，改代理到 CoreMind）。
 *
 * 坑区分：查询智能逻辑（Text-to-SQL / RAG / 路由）全在 CoreMind（jinguan-qa），
 * Koa 网关只做无状态转发 + 鉴权。会话状态由 CoreMind session 维护。
 *
 * 契约：POST {COREMIND_URL} { message, history } → { content, tableData?, sql?, citations? }。
 * COREMIND_URL 未配置时返回失败（由路由转成 {code:503}），不回退到裸 LLM。
 */
export async function chat(message, history = [], harness) {
  const url = config.coremind.url;
  if (!url) {
    return { success: false, error: 'CoreMind 服务未配置（COREMIND_URL 缺失），无法处理查询', code: 503 };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.coremind.timeoutMs);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, harness }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { success: false, error: `CoreMind 返回 ${resp.status}: ${text}`.trim(), code: 502 };
    }

    const data = await resp.json();
    // 透传 CoreMind 富格式结果（content 必有；tableData/sql/citations 视答案类型可选）。
    return {
      success: true,
      content: data.content ?? '',
      tableData: data.tableData,
      sql: data.sql,
      citations: data.citations,
      source: data.source,
      businessPerformance: data.businessPerformance,
    };
  } catch (error) {
    const aborted = error.name === 'AbortError';
    return {
      success: false,
      error: aborted ? 'CoreMind 响应超时' : `CoreMind 调用失败: ${error.message}`,
      code: aborted ? 504 : 502,
    };
  }
}
