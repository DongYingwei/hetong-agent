/**
 * richFormat —— 坑13：把 CoreMind 一轮结果转成网关契约的富格式。
 *
 * 契约（与 apps/gateway/src/services/agentService.js 对齐）：
 *   { message, history } → { content, tableData?, sql?, citations? }
 *
 * 抽取来源（确定性、不解析 Markdown）：
 *   · content    = 本轮 transcript（模型最终文本，忠实透传）
 *   · sql        = 最后一次 sql_query 工具调用的 args.sql（模型实际生成的 SELECT）
 *   · tableData  = 最后一次 sql_query 工具结果的 rows（结构化行，DB 列名）
 *   · citations  = 最后一次 vector_search 工具结果的 fragments（mode=fragments 时才有）
 *
 * 说明：rows / fragments 是工具执行时的结构化 details（sql_query → {rows,rowCount}，
 * vector_search → {fragments} 或 {contract_ids}）。CoreMind 的 tool_result 事件不带数据，
 * 但工具结果会落进 run.messages（pi-agent-core 的 ToolResultMessage.details），这里从 messages 抽取。
 * 12a/T11 会做「DB 列名 → 前端 TableRowItem」的映射与重类型；本模块只忠实搬运原始结构，不映射、不补值。
 */

import type { CoreMindMessage } from "coremind-ai";

/**
 * 前端 history（{role, content}）→ CoreMind 公共消息。
 * content 统一转成数组 [{type:"text",text}] 形式：pi-agent-core 的 assistant 消息 content
 * 要求数组（字符串形式会被静默丢弃，导致该轮空输出），user 消息两者皆可，故统一用数组最稳。
 */
export function toCoreMindMessages(history: unknown): CoreMindMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item): item is { role: string; content: unknown } => {
      return (
        !!item &&
        typeof item === "object" &&
        typeof (item as { role?: unknown }).role === "string"
      );
    })
    .map((item) => {
      const content =
        typeof item.content === "string"
          ? [{ type: "text", text: item.content }]
          : item.content;
      return { role: item.role, content } as CoreMindMessage;
    });
}

/** 一轮对话里我们只关心的最小结构（与 ChatTurnResult 相容，测试可喂合成数据）。 */
export interface Citation {
  contract_id?: number;
  contract_no?: string;
  field?: string;
  content?: string;
  score?: number;
  [key: string]: unknown;
}

export interface RichChatResponse {
  content: string;
  tableData?: Record<string, unknown>[];
  sql?: string;
  citations?: Citation[];
}

/** CoreMind 归一化事件里我们只看 tool_call（拿 args.sql / args.query / args.mode）。 */
interface ToolCallEvent {
  type: string;
  tool?: string;
  args?: unknown;
}

/** 工具结果消息（pi-agent-core ToolResultMessage 的宽松视图）。 */
interface ToolResultMessage {
  role?: string;
  toolName?: string;
  content?: unknown;
  details?: unknown;
}

/** toRichFormat 入参的最小结构（真实 ChatTurnResult 与测试 fixture 都满足）。 */
export interface TurnLike {
  text: string;
  events: ToolCallEvent[];
  run: {
    messages: Map<string, unknown[]> | Record<string, unknown[]>;
  };
}

/** 把 run.messages（Map 或普通对象）拍平成单一消息数组，供遍历。 */
function flattenMessages(messages: Map<string, unknown[]> | Record<string, unknown[]>): unknown[] {
  const values = messages instanceof Map ? [...messages.values()] : Object.values(messages);
  return values.flat();
}

/** 从工具结果消息里取结构化数据：优先 details，回退解析 content[0].text 的 JSON。 */
function toolResultData(msg: unknown): unknown {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as ToolResultMessage;
  if (m.details && typeof m.details === "object") return m.details;
  const content = m.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") {
          try {
            return JSON.parse(text);
          } catch {
            // 非 JSON 文本，忽略，继续看下一条
          }
        }
      }
    }
  }
  return undefined;
}

function isToolResult(msg: unknown, toolName: string): boolean {
  return (
    !!msg &&
    typeof msg === "object" &&
    (msg as ToolResultMessage).role === "toolResult" &&
    (msg as ToolResultMessage).toolName === toolName
  );
}

/** 从 events 里取最后一次 sql_query 调用的 SQL。 */
function extractSql(events: ToolCallEvent[]): string | undefined {
  let sql: string | undefined;
  for (const event of events) {
    if (event.type === "tool_call" && event.tool === "sql_query") {
      const args = event.args as { sql?: unknown } | undefined;
      if (args && typeof args.sql === "string" && args.sql.trim() !== "") {
        sql = args.sql;
      }
    }
  }
  return sql;
}

/** 从 messages 里取最后一次指定工具的结构化结果（可指定字段）。 */
function extractToolResultField(messages: unknown[], toolName: string, field: string): unknown[] | undefined {
  let found: unknown[] | undefined;
  for (const msg of messages) {
    if (!isToolResult(msg, toolName)) continue;
    const data = toolResultData(msg);
    if (!data || typeof data !== "object") continue;
    const value = (data as Record<string, unknown>)[field];
    if (Array.isArray(value)) found = value;
  }
  return found;
}

/**
 * 核心映射：ChatTurnResult → 网关富格式。
 * 抽不到的可选字段一律省略（undefined），不伪造空数组/空串。
 */
export function toRichFormat(turn: TurnLike): RichChatResponse {
  const messages = flattenMessages(turn.run.messages);

  const sql = extractSql(turn.events);
  const rows = extractToolResultField(messages, "sql_query", "rows");
  const fragments = extractToolResultField(messages, "vector_search", "fragments");

  const response: RichChatResponse = { content: turn.text ?? "" };
  if (rows && rows.length > 0) {
    response.tableData = rows as Record<string, unknown>[];
  }
  if (sql) response.sql = sql;
  if (fragments && fragments.length > 0) {
    response.citations = fragments as Citation[];
  }
  return response;
}
