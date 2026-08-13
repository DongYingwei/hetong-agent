import { describe, expect, it } from "vitest";
import { toCoreMindMessages, toRichFormat, type TurnLike } from "./richFormat.js";

/** 构造 sql_query 工具结果消息（pi-agent-core ToolResultMessage 形状的宽松视图）。 */
function sqlResultMsg(rows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    role: "toolResult",
    toolName: "sql_query",
    details: { rows, rowCount: rows.length },
    content: [{ type: "text", text: JSON.stringify({ rows, rowCount: rows.length }) }],
  };
}

function vectorFragmentsMsg(fragments: Record<string, unknown>[]): Record<string, unknown> {
  return {
    role: "toolResult",
    toolName: "vector_search",
    details: { query: "结算条款", mode: "fragments", fragments },
    content: [
      { type: "text", text: JSON.stringify({ query: "结算条款", mode: "fragments", fragments }) },
    ],
  };
}

function turn(overrides: Partial<TurnLike>): TurnLike {
  return {
    text: "共 2 份合同。",
    events: [],
    run: { messages: new Map() },
    ...overrides,
  };
}

describe("toRichFormat", () => {
  it("纯文本：无工具调用时只回 content，省略全部可选字段", () => {
    const result = toRichFormat(turn({ text: "你好，我只负责合同库查询。" }));
    expect(result).toEqual({ content: "你好，我只负责合同库查询。" });
    expect(result.tableData).toBeUndefined();
    expect(result.sql).toBeUndefined();
    expect(result.citations).toBeUndefined();
  });

  it("结构化查询：抽取 sql（最后一次 sql_query 的 args.sql）+ tableData（rows）", () => {
    const rows = [
      { contract_no: "HT-2026-0001", amount: 100000 },
      { contract_no: "HT-2026-0002", amount: 200000 },
    ];
    const result = toRichFormat(
      turn({
        text: "共 2 份。\n\n| 合同号 | 金额 |\n|---|---|\n| HT-2026-0001 | 100000 |\n",
        events: [
          { type: "tool_call", tool: "sql_query", args: { sql: "SELECT contract_no, amount FROM contracts" } },
        ],
        run: { messages: new Map([["main", [sqlResultMsg(rows)]]]) },
      }),
    );

    expect(result.sql).toBe("SELECT contract_no, amount FROM contracts");
    expect(result.tableData).toEqual(rows);
    expect(result.citations).toBeUndefined();
  });

  it("语义检索：抽取 citations（vector_search 的 fragments）", () => {
    const fragments = [
      { contract_no: "HT-2026-0007", field: "settlement_terms", content: "按季度结算。", score: 0.91 },
    ];
    const result = toRichFormat(
      turn({
        text: "据合同 HT-2026-0007《结算条款》：“按季度结算。”",
        run: { messages: new Map([["main", [vectorFragmentsMsg(fragments)]]]) },
      }),
    );

    expect(result.citations).toEqual(fragments);
    expect(result.tableData).toBeUndefined();
  });

  it("联动（向量→SQL）：sql + tableData 都抽取，取各自最后一次工具结果", () => {
    const rows = [{ id: 7, contract_no: "HT-2026-0007", amount: 500000 }];
    const messages = [
      { role: "toolResult", toolName: "vector_search", details: { mode: "ids", contract_ids: [7] } },
      sqlResultMsg(rows),
      // 后一次 sql_query 应覆盖前一次
      sqlResultMsg([{ id: 8, contract_no: "HT-2026-0008", amount: 300000 }]),
    ];
    const result = toRichFormat(
      turn({
        events: [
          { type: "tool_call", tool: "vector_search", args: { query: "结算", mode: "ids" } },
          { type: "tool_call", tool: "sql_query", args: { sql: "SELECT * FROM contracts WHERE id=7" } },
          { type: "tool_call", tool: "sql_query", args: { sql: "SELECT * FROM contracts WHERE id=8" } },
        ],
        run: { messages: new Map([["main", messages]]) },
      }),
    );

    expect(result.sql).toBe("SELECT * FROM contracts WHERE id=8"); // 最后一次
    expect(result.tableData).toEqual([{ id: 8, contract_no: "HT-2026-0008", amount: 300000 }]);
    // mode=ids 无 fragments，不出 citations
    expect(result.citations).toBeUndefined();
  });

  it("details 缺失时回退解析 content[0].text 的 JSON（rows 仍能取到）", () => {
    const rows = [{ contract_no: "HT-2026-0003", amount: 150000 }];
    const msg = {
      role: "toolResult",
      toolName: "sql_query",
      // 无 details
      content: [{ type: "text", text: JSON.stringify({ rows, rowCount: 1 }) }],
    };
    const result = toRichFormat(turn({ run: { messages: new Map([["main", [msg]]]) } }));
    expect(result.tableData).toEqual(rows);
  });

  it("空 rows / 空 fragments 不伪造空数组，字段省略", () => {
    const result = toRichFormat(
      turn({
        run: {
          messages: new Map([
            ["main", [sqlResultMsg([]), vectorFragmentsMsg([])]],
          ]),
        },
      }),
    );
    expect(result.tableData).toBeUndefined();
    expect(result.citations).toBeUndefined();
  });

  it("run.messages 同时支持 Map 与普通对象（按 values 拍平）", () => {
    const rows = [{ contract_no: "HT-2026-0009", amount: 1 }];
    const result = toRichFormat(
      turn({ run: { messages: { main: [sqlResultMsg(rows)] } } }),
    );
    expect(result.tableData).toEqual(rows);
  });
});

describe("toCoreMindMessages", () => {
  it("字符串 content 统一转数组 [{type:text,text}]（assistant 消息必须数组形式）", () => {
    const result = toCoreMindMessages([
      { role: "user", content: "2026年签订的合同有多少份" },
      { role: "assistant", content: "0 份。" },
    ]);
    expect(result).toEqual([
      { role: "user", content: [{ type: "text", text: "2026年签订的合同有多少份" }] },
      { role: "assistant", content: [{ type: "text", text: "0 份。" }] },
    ]);
  });

  it("已是数组的 content 原样透传", () => {
    const content = [{ type: "text", text: "已有数组" }];
    expect(toCoreMindMessages([{ role: "assistant", content }])).toEqual([
      { role: "assistant", content },
    ]);
  });

  it("非数组 history 返回空数组；缺 role 的项被过滤", () => {
    expect(toCoreMindMessages(undefined)).toEqual([]);
    expect(toCoreMindMessages("nope")).toEqual([]);
    expect(toCoreMindMessages([{ content: "没有 role" }, null, 42])).toEqual([]);
  });
});
