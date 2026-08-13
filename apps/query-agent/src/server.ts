/**
 * server —— 坑13：给 CoreMind 包一个薄 HTTP wrapper，暴露 /chat 供网关代理。
 *
 * 背景：CoreMind 只有 CLI（coremind chat/run）与库 API（CoreMindRuntime / runAgentTurn），
 * 没有任何内建 HTTP 端点（见 handoff 坑13）。网关 agentService.js 代理到的 COREMIND_URL
 * 就指向本服务。契约（与网关对齐）：
 *   POST /chat  { message, history? } → { content, tableData?, sql?, citations? }
 *   GET  /health → { status }
 *
 * 会话模型：无状态。每请求把前端传来的 history 重建为 CoreMindMessage[]，直接
 * runAgentTurn（与 ChatSession.chat 走同一预算/权限/Trace/session 执行内核），
 * 不在服务端维护跨请求会话、也不把不同前端会话混在一个 ChatSession 里。
 *
 * 运行：本文件是 TS，且工具文件内部用 .js 后缀 import（Node 原生 TS 不会重写 .js→.ts），
 * 必须用 tsx 起（进程级拦截动态 import 并处理 .ts / .js→.ts）：
 *   node --env-file=.env --import tsx src/server.ts
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CoreMindRuntime,
  loadConfigFile,
  parseAndValidate,
  type CoreMindConfig,
  type CoreMindEvent,
} from "coremind-ai";
import { toCoreMindMessages, toRichFormat } from "./richFormat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置文件默认取仓库下 apps/query-agent/coremind.yaml；可用 COREMIND_CONFIG 覆盖。
const CONFIG_PATH = process.env.COREMIND_CONFIG || path.resolve(__dirname, "../coremind.yaml");
const PORT = parseInt(process.env.COREMIND_PORT || process.env.PORT || "8101", 10);
const MAX_BODY_BYTES = 1024 * 1024; // 1MB，历史对话 + 消息远用不满

// 惰性持有的运行时（启动失败时保持 null，/health 报告降级，/chat 给明确错误）。
let runtime: CoreMindRuntime | null = null;
let agentName = "main";
let bootError: string | null = null;

/**
 * systemPrompt 里「今天是 YYYY-MM-DD」是写死的字面量（coremind.yaml 注释已声明要替换）。
 * CoreMind 不做 {{}} 插值，故在此按 yaml 提示的「选项 B：改写 systemPrompt」注入真实当天日期。
 */
function injectToday(config: CoreMindConfig): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const agentCfg of Object.values(config.agents)) {
    if (typeof agentCfg.systemPrompt === "string") {
      agentCfg.systemPrompt = agentCfg.systemPrompt.replace(
        /今天是\s*\d{4}-\d{2}-\d{2}/,
        `今天是 ${today}`,
      );
    }
  }
}

async function bootstrap(): Promise<void> {
  try {
    const data = await loadConfigFile(CONFIG_PATH);
    const { config } = parseAndValidate(data);
    injectToday(config);
    const configDir = path.dirname(path.resolve(CONFIG_PATH));
    runtime = await CoreMindRuntime.create({ config, configDir });
    agentName = config.defaultAgent ?? Object.keys(config.agents)[0] ?? "main";
    console.log(`[query-agent] CoreMind 就绪（agent=${agentName}，config=${CONFIG_PATH}）`);
  } catch (error) {
    bootError = error instanceof Error ? error.message : String(error);
    console.error(`[query-agent] CoreMind 启动失败：${bootError}`);
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("请求体过大");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** POST /chat：执行一轮查询，映射为富格式返回。 */
async function handleChat(body: unknown): Promise<{ status: number; json: unknown }> {
  const { message, history } = (body ?? {}) as { message?: unknown; history?: unknown };

  if (typeof message !== "string" || message.trim() === "") {
    return { status: 400, json: { error: "message 不能为空" } };
  }
  if (!runtime) {
    return {
      status: 503,
      json: { content: `查询智能体未就绪：${bootError ?? "初始化未完成"}` },
    };
  }

  const events: CoreMindEvent[] = [];
  try {
    const run = await runtime.runAgentTurn(
      agentName,
      message,
      toCoreMindMessages(history),
      (event) => events.push(event),
    );
    return { status: 200, json: toRichFormat({ text: run.transcript, events, run }) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[query-agent] /chat 执行失败：${msg}`);
    // 模型/工具层错误以 content 形式回给前端，让用户看到真实失败原因而非裸 5xx。
    return { status: 200, json: { content: `查询失败：${msg}` } };
  }
}

function sendJson(res: http.ServerResponse, status: number, json: unknown): void {
  const payload = JSON.stringify(json);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      status: runtime ? "ok" : "degraded",
      ...(bootError ? { error: bootError } : {}),
    });
  }

  if (req.method === "POST" && url.pathname === "/chat") {
    try {
      const body = await readJsonBody(req);
      const { status, json } = await handleChat(body);
      return sendJson(res, status, json);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return sendJson(res, 400, { error: `请求解析失败：${msg}` });
    }
  }

  return sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[query-agent] HTTP wrapper 监听 http://127.0.0.1:${PORT}`);
  void bootstrap();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
