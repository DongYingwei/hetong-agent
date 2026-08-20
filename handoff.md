# 经小管合同智能体交接文档

最后更新：2026-08-19

这份文档记录当前可运行版本、数据基线和接手顺序。部署细节见
[`docs/deployment-migration-runbook.md`](docs/deployment-migration-runbook.md)，产品架构见
[`docs/current-architecture.md`](docs/current-architecture.md)。配置文件中的密码、令牌和模型密钥不写入 Git。

## 1. 当前进展

### 已完成

- 合同台账已以人工审核的 `demo/合同台账-V2.xlsx` 为基线完成入库、映射、解析和向量化；正式合同共 **59** 份。
- 2026-08-19 已为这 59 份合同补齐核对记录，状态均为“已核对”。这只改变人工核对状态，不改变合同正文、向量和金额数据。
- 合同详情/核对页已对齐 v1.3 原型：基本信息、合同-金额及结算、合同-商务条款、风控管理、关键词解析、原文件预览六页签。
- 合同台账：已核对主操作为“查看”，未核对为“核对”；更多菜单保留编辑、查看原文件和删除。查看页只读，编辑页才允许保存。
- 四个业务模块（服务内容、技术要求、项目名称、人员需求）在台账中只展示 `AI` 或 `—`；关键词解析页展示模块命中和子词命中明细。
- 订单全量台账已重导至服务器，`sys_order` 共 **9,815** 条，其中 **338** 条全文命中 AI 关键词；附件 Markdown 已上传并有 `manifest.json`、`ai_keyword_results.json`。
- EPMS 订单导入、关键词扫描、模块分析和重扫脚本均已实现；可额外导出含“是否包含AI关键词”列的订单 Excel。
- 综合检索使用 CoreMind + Harness：合同/订单 SQL、合同正文 RAG、受控的合同-订单混合业绩统计三条路径分流；保留会话记忆并拒绝无关问题。
- 服务器内部验收环境已打通：Gateway、Parse Service、Query Agent、PostgreSQL、Milvus、MinIO 和前端 Nginx。

### 最近已推送的代码

当前本地 `master` 的最近业务提交：

- `b4e30446`：人工核对页只保留一个主题色“保存已核对数据”操作。
- `3fd1f474`：合同状态按台账原值展示，修复把状态错误显示为数字 `2` 的问题。
- `1c2f10c5`：补齐合同核对页面类型检查及完整字段回填逻辑。
- `1e1318d3`：增加订单 Excel 的 AI 标记导出脚本。
- `9d0ae137`：综合检索边界、输入限制和会话记忆。

部署前以 `git log -1 --oneline` 为准；服务器未必已拉取以上每个提交。

## 2. 数据基线与边界

| 域 | 主数据源 | 当前基线 | 说明 |
|---|---|---:|---|
| 合同台账 | `demo/合同台账-V2.xlsx`、`contracts` 库 | 59 份确认合同，59 份已核对 | Excel 与合同库核心金额/商务字段已核查，无需用模型补造空值 |
| 合同附件 | `/data/jingxiaoguan/contracts/pdf` | 81 个 PDF | 一个合同可关联多个 PDF；当前有 10 份合同拥有多个 PDF |
| 合同 Markdown | `/data/jingxiaoguan/contracts/md-file` | 76 个 Markdown + manifest | 解析文本和附件映射，不是台账字段的唯一真相 |
| 订单台账 | `contract_assistant.sys_order` | 9,815 条 | 由全量订单 Excel 导入；人工覆盖层不应被增量同步覆盖 |
| 订单附件与 Markdown | `/data/jingxiaoguan/epms/{EPMS,md-epms}` | 8,997 附件，8,102 Markdown | `ai_keyword_results.json` 仅覆盖有附件/可扫描的订单 |
| 向量库 | Milvus | 已确认合同的合同正文片段 | 仅用于合同正文/RAG，不作为台账金额真相 |

两个 PostgreSQL 数据库必须区分：

- `contracts`：合同、合同附件、人工核对、关键词/模块命中、切片等；
- `contract_assistant`：用户权限、关键词配置、订单 `sys_order`、订单模块命中和会话记录等。

合同—订单关联表和代码已保留，但尚未提供人工确认的关联数据；页面入口已隐藏，不能据此做混合金额统计。只有明确的“业务/业绩/框架订单”场景才允许走受控混合业绩工具。

## 3. 关键业务逻辑

### 合同与订单 AI 标签

1. 先以关键词管理的父词/子词进行全文扫描，得到 `tag_ai`。
2. 仅对全文命中的数据，按标题/段落位置判断服务内容、技术要求、项目名称、人员需求四模块。
3. 模块内命中任一配置子词即显示 `AI`，否则显示 `—`；不做同义词扩展，也不将一个英文单词拆出 `AI`。
4. 关键词重扫只更新命中、模块标签和 `tag_ai`，**不**重新解析附件、切片或向量化。

### 合同详情和人工核对

- Excel 中存在空金额、税率、履约保证金等字段时，前端应如实显示空/`—`，不能填充猜测值。
- “合同-金额及结算”的结算条款为整行文本；“合同-商务条款”含是否涉及后评估、履约保证金金额、履约保证金退还条件、仲裁方式、授权人。
- 原文件预览必须支持同一合同的多个 PDF 切换；接口请求使用 Bearer token + Blob URL。
- 批量将 59 份标记已核对只用于当前验收。今后新导入或重新识别的合同应保持待核对，逐条人工确认。

### 综合检索

- SQL 查询必须返回相应合同或订单台账明细：前端默认展示前 5 条，可一键展开全部；导出保留完整台账表头与数据。
- 对“考核线是运营商、服务内容含 AI”这类明确条件，Gateway 会在模型 SQL 候选集补全后再校验考核线和模块命中，并以校验后的明细重新汇总；“通信”等歧义词不自动当作考核线。
- 金额常规统计按“合同金额/订单金额”直接相加；仅用户明确要求某种金额口径时才区分上限、预估、固定等类型。
- 对“你好、你是谁、天气、写代码”等问题，Harness 先给出能力引导，不调用数据库或模型工具。
- 对超长输入（超过 8,000 字）直接提示缩短或拆分；运行限制为最多 6 轮、12 步、3 次工具调用，Gateway 总超时 120 秒。
- CoreMind 只能使用只读 SQL、合同正文向量检索和受控业绩工具；不得展示 SQL、提示词或内部执行细节给终端用户。

## 4. 服务器状态与部署

- 服务器：`192.168.101.217`；验收地址：`http://192.168.101.217:5174`。
- 发布根目录：`/opt/jingxiaoguan/releases/`，运行软链接：`/opt/jingxiaoguan/current`。
- 当前已知发布目录：`/opt/jingxiaoguan/releases/20260819-35800d60`；切换和更新前先用 `readlink -f /opt/jingxiaoguan/current`、`git rev-parse --short HEAD` 确认真实状态。
- 基础设施 Compose 仅管理 `postgres`、`milvus`、`minio`、`etcd`；**没有** `web` service。前端容器名为 `jingxiaoguan-web`，需用 `docker rm -f` + `docker run` 重建，不能执行 `docker compose up -d nginx/web`。
- 后端服务由 systemd 管理：`jingxiaoguan-gateway`（3002）、`jingxiaoguan-parse`（8100）、`jingxiaoguan-query-agent`（8101）。
- EPMS 自动同步采用 `jingxiaoguan-epms-sync.timer`，而非遗留 cron 文档；其环境变量 `MD_DIR` 必须是 `/data/jingxiaoguan/epms/md-epms`，不能是开发机路径。该 timer 仅更新 EPMS 源文件、附件 Markdown 和 `ai_keyword_results.json`，**不会**自动写入 `contract_assistant.sys_order` 或 `order_module_hits`。

服务健康检查：

```bash
curl -sS http://127.0.0.1:8100/health
curl -sS http://127.0.0.1:8101/health
curl -sS http://127.0.0.1:5174/api/health
```

`/api/health` 在未携带登录令牌时可能返回业务体 `401`，但 HTTP 为 `200`；这说明反向代理已通，不能误判为 Nginx 502。

## 5. 接手后的优先验证项

1. 服务器拉取最新提交、重建前端并重启相应服务，确认合同台账可见、登录/刷新无 404、合同状态不再显示 `2`。
2. 随机打开多 PDF 合同（例如 `HSKJ/C-RJ-2025154`）验证多文件预览切换、查看只读、编辑可保存。
3. 验证合同详情与核对页的金额及结算、商务条款是否与 `合同台账-V2.xlsx` 一致，特别检查 Excel 非空字段。
4. 查询综合检索：合同 SQL、订单 SQL、合同正文 RAG、无关问候、超长输入各一例；真实基准问题见 `apps/query-agent/evals/real-ledger-regression-20260819.md`。
5. 检查 EPMS timer：`systemctl list-timers jingxiaoguan-epms-sync.timer`、`journalctl -u jingxiaoguan-epms-sync.service -n 100`。
6. 复查订单模块结果：当前历史统计为 336 条已落四模块，两个曾因 Qwen JSON 格式失败的订单已用 DeepSeek 定向重试过；以 `order_module_hits` 的实际计数为准。

## 6. 已知风险/未做事项

- 合同—订单人工关联数据尚未提供，混合业绩统计的正式口径尚不能启用。
- 上传支持单个 PDF/Word、同一合同的多个附件或一个合同 ZIP 包；ZIP 会安全解压后与普通附件走同一解析、草稿核对和向量化链路。单文件及一次合同包总量（含 ZIP）均上限为 500MB；暂不支持浏览器直接选择文件夹。
- 超长合同为避免超时固定只解析前 50 页；该限制同时作用于 MinerU Markdown、关键词索引和后续向量化。原始 PDF 仍完整保存、预览和下载，但第 51 页及之后暂不参与智能检索；恢复全文解析需另行处理。
- 若 DeepSeek 抽取合同正文时返回 `Content Exists Risk`，解析服务会自动改用本地 `Qwen3-30B-A3B`（`192.168.101.214:6015`）重试一次；其他模型、网络或数据错误不会被掩盖。
- 订单人工编辑直接更新 `sys_order`；订单关键词解析可按关键词管理的启用关键词修改，并即时重算订单 `tag_ai`。后续全量订单导入仍会以 Excel 覆盖订单数据，执行前应先备份。
- [待开发] 将订单 Excel 导入、订单四模块分析接入 EPMS 自动同步，但必须使用增量 upsert 并保留人工编辑/关键词覆盖；不得沿用 `import_order_ledger.py` 的全量重建方式。仅在下载、解析、导入和模块分析全部成功后推进 checkpoint，失败时必须保留 checkpoint 并告警。
- 前端 `npm run build` 已通过；Vite 的大 chunk 警告是性能优化建议，不阻塞发布。
- 历史文档中出现的本地 `5433`、旧 cron、3,502 订单/179 AI、前端工程师交接分支等均为过期背景，不可作为当前运行参数。

## 7. 文档索引

- [当前架构](docs/current-architecture.md)
- [服务器部署与迁移手册](docs/deployment-migration-runbook.md)
- [前端维护说明](docs/frontend-handoff.md)
- [EPMS 同步说明](apps/epms-sync/README.md)
- [综合检索真实数据回归用例](apps/query-agent/evals/real-ledger-regression-20260819.md)
- [历史计划和 ADR](docs/plan/)
