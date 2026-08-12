/**
 * sql_query —— 只读结构化查询工具。
 *
 * 职责：接收 Agent 生成的“查询意图”，对合同库执行 SELECT，返回行数据。
 * 返回值会被 CoreMind 包成 text 回灌到模型上下文（见 public-tool.ts），
 * Agent 读到后整理成 Markdown 表格。
 *
 * ⚠️ 安全（你必须实现，CoreMind 不解析 SQL）：
 *   1. 只允许 SELECT —— 见 assertReadOnly()。
 *   2. 数据库连接务必用【只读账号】，这是最后一道兜底。
 *   3. 参数化查询，不要把用户文本直接拼进 SQL。
 *
 * 设计选择：本工具接收【结构化过滤条件】而非裸 SQL 字符串，
 * 这样注入面更小、也更好评测。若你更信任模型直接写 SQL，可把
 * parameters 改成 { sql: string } 并在 assertReadOnly 里严格校验。
 */

// contract_ids 设为可选；当 Agent 走“先向量后 SQL”联动时才传入。
// 若你希望联动路径下强制串行，可在向量场景用一个单独工具或把它设 required。
interface SqlQueryParams {
  /** 统计动作：数量 / 求和 / 列表 */
  aggregate: "count" | "sum_amount" | "list";
  /** 结构化过滤条件（都对应已物化的离散列） */
  filters?: {
    sign_year?: number;
    sign_quarter?: number[]; // 例：[1,2] 表示前两季度
    sign_half?: 1 | 2;
    industry?: string; // 电力 / 通信 ...
    contract_type?: string; // 运维 / 建设 / 采购 / 服务 ...
    tag_ai?: 0 | 1;
    tag_5g?: 0 | 1;
  };
  /** 联动路径：由 vector_search 返回的合同 id 列表，用于二次统计 */
  contract_ids?: number[];
}

interface ContractRow {
  contract_no: string;
  contract_name: string;
  amount: number;
}

interface SqlResult {
  aggregate: SqlQueryParams["aggregate"];
  count?: number;
  total_amount?: number;
  rows?: ContractRow[];
}

/** 只读把关：任何非 SELECT 语义一律拒绝。若改成裸 SQL 入参，这里做真正的语句解析。 */
function assertReadOnly(_params: SqlQueryParams): void {
  // 当前采用结构化入参，天然不含写操作，无需解析。
  // 若切换到 { sql } 入参，请在此处：
  //   const forbidden = /\b(insert|update|delete|drop|alter|truncate|create|grant)\b/i;
  //   if (forbidden.test(sql)) throw new Error("仅允许 SELECT 查询");
}

export default {
  name: "sql_query",
  description:
    "对合同结构化库执行只读统计查询。支持按年份/季度/半年/行业/合同类型/AI标签/5G标签过滤，" +
    "可做数量统计、金额求和或列出编号名称。也可传入 contract_ids 对指定合同集合二次统计。",
  parameters: {
    type: "object",
    properties: {
      aggregate: {
        type: "string",
        enum: ["count", "sum_amount", "list"],
        description: "count=数量, sum_amount=金额求和, list=列出编号与名称",
      },
      filters: {
        type: "object",
        properties: {
          sign_year: { type: "number" },
          sign_quarter: { type: "array", items: { type: "number" } },
          sign_half: { type: "number", enum: [1, 2] },
          industry: { type: "string" },
          contract_type: { type: "string" },
          tag_ai: { type: "number", enum: [0, 1] },
          tag_5g: { type: "number", enum: [0, 1] },
        },
        additionalProperties: false,
      },
      contract_ids: { type: "array", items: { type: "number" } },
    },
    required: ["aggregate"],
    additionalProperties: false,
  },
  execute: async (_toolCallId: string, params: SqlQueryParams) => {
    assertReadOnly(params);

    // ───────────────────────────────────────────────────────
    // TODO(你实现)：把 params 翻译成【参数化】SELECT 并对只读库执行。
    // 建议用一个 query builder 逐字段 append WHERE，杜绝字符串拼接。
    //
    // 示例形态（伪代码，替换成你的 DB 客户端）：
    //   const { where, values } = buildWhere(params.filters, params.contract_ids);
    //   if (params.aggregate === "count")      → SELECT COUNT(*)                    ...
    //   if (params.aggregate === "sum_amount") → SELECT COUNT(*), SUM(amount)       ...
    //   if (params.aggregate === "list")       → SELECT contract_no, contract_name  ...
    // ───────────────────────────────────────────────────────
    const result: SqlResult = {
      aggregate: params.aggregate,
      // count: ...,
      // total_amount: ...,
      // rows: [...],
    };

    // 返回 JSON 文本 → 回灌上下文供 Agent 汇总
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
};
