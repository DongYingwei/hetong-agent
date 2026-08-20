# 经小管合同智能体交接文档

最后更新：2026-08-20。本文件记录当前可运行基线、数据状态、部署方式和接手顺序；不记录密码、令牌或模型密钥。

## 1. 当前完成情况

### 合同

- 审核版 `demo/合同台账-V2.xlsx` 已作为正式基线，`contracts.confirmed=1` 为 **59** 条；2026-08-19 已补齐 59 条人工核对记录，均为已核对。
- 合同详情/核对页已按 v1.3 原型完成：基本信息、合同-金额及结算、合同-商务条款、风控管理、关键词解析、原文件预览六页签。
- 已核对合同列表主操作为“查看”，待核对为“核对”；查看只读，编辑才可保存；支持删除、查看原文件和多 PDF 切换预览。
- 上传已支持单附件、同合同多附件、合同 ZIP 包。服务端会保留全部不同附件；相同 SHA-256 的重复 PDF 不重复保存。
- 草稿确认必须人工填写真实合同号；内部 `DRAFT-*` 临时编号不得入正式库或 Milvus。
- 上传、关键词、切片和向量化均只处理前 50 页；原文件不截断，仍可完整预览和下载。

### 订单

- 服务器 `contract_assistant.sys_order` 已按 `订单信息_2026年_审核时间全量补全.xlsx` 全量导入 **9,815** 条订单，全文 AI 初筛 **338** 条。
- 服务器 EPMS 数据盘已存在 **8,997** 附件、**8,102** Markdown、`manifest.json`、`ai_keyword_results.json` 与 checkpoint。
- 订单详情保留只读“详情”；“编辑”可修改全部订单字段和四模块关键词结果，保存后直接更新 `sys_order`、模块命中和 `tag_ai`。
- 订单台账导出会按当前筛选条件读取全部订单，而不是仅导出当前 UI 页；Excel 新增“是否包含AI关键词”“命中AI关键词”，缺失字段不再填演示默认值。
- EPMS timer 每日同步源文件、Markdown 和全文关键词初筛；**不会**自动重导 `sys_order` 或重新执行订单四模块分析。

### 综合检索与前端

- 综合检索已接入 CoreMind + Harness：合同 SQL、订单 SQL、合同正文 RAG、会话记忆、无关问题引导和超长输入限制。
- SQL 结果必须返回对应台账明细：合同展示 15 列、订单展示 17 列，默认 5 条且可展开全部；导出保留完整表头和数据。
- 关键词管理采用父词/子词；列表不直接铺开子词，通过展开查看。四模块只显示 `AI` 或 `—`。
- 前端构建 `npm run build` 已通过；Vite 大 chunk 提示为非阻断性能告警。

## 2. 当前数据与部署基线

| 项目 | 当前值/位置 |
|---|---|
| 目标服务器 | `192.168.101.217` |
| 内部验收地址 | `http://192.168.101.217:5174` |
| 发布目录 | `/opt/jingxiaoguan/releases/<版本>` |
| 当前版本软链 | `/opt/jingxiaoguan/current` |
| 合同原文件 | `/data/jingxiaoguan/contracts/pdf` |
| 合同 Markdown | `/data/jingxiaoguan/contracts/md-file` |
| 订单源文件 | `/data/jingxiaoguan/epms/EPMS` |
| 订单 Markdown/扫描结果 | `/data/jingxiaoguan/epms/md-epms` |
| 合同库 | PostgreSQL `contracts` |
| 运营/订单库 | PostgreSQL `contract_assistant` |

基础设施 Compose 只管理 `jingxiaoguan-postgres`、`jingxiaoguan-etcd`、`jingxiaoguan-milvus`、`jingxiaoguan-minio`。前端是独立容器 `jingxiaoguan-web`，不是 Compose service。

后端由 systemd 管理：`jingxiaoguan-gateway`（3002）、`jingxiaoguan-parse`（8100）、`jingxiaoguan-query-agent`（8101）。生产 PostgreSQL 端口为 `127.0.0.1:5432`；不得复用开发环境 `5433`。

## 3. 接手后先做的验证

```bash
readlink -f /opt/jingxiaoguan/current
curl -sS http://127.0.0.1:8100/health
curl -sS http://127.0.0.1:8101/health
curl -sS -w '\nHTTP=%{http_code}\n' http://127.0.0.1:5174/api/health
```

1. 登录、刷新、合同台账、订单台账、综合检索均不得出现 404、502 或 `Invalid URL`。
2. 抽查多 PDF 合同 `HSKJ/C-RJ-2025154`，验证全部附件可预览、查看只读、编辑可保存。
3. 对照 `合同台账-V2.xlsx` 抽查合同金额及结算、商务条款非空字段。
4. 验证关键词管理展开、合同/订单筛选、关键词重扫任务、订单详情与编辑。
5. 验证综合检索的合同 SQL、订单 SQL、合同正文 RAG、无关问候与超长输入各一例。
6. 查看 timer：`systemctl list-timers jingxiaoguan-epms-sync.timer` 与 `journalctl -u jingxiaoguan-epms-sync.service -n 100 --no-pager`。

## 4. 当前已知限制与待办

### 必须避免的误用

- 全量订单导入会清空重建 `sys_order`、`order_module_hits`、`order_manual_overrides`、`contract_order_links`。执行前必须备份 `contract_assistant`。
- `MD_DIR` 必须是服务器路径 `/data/jingxiaoguan/epms/md-epms`。保留开发机路径会导致订单模块分析显示“没有可分析的附件 Markdown”。
- 数据库 URL 中密码含 `@`、`/`、`:`、`#` 等字符时必须 URL 编码，否则会导致前端空列表、综合检索 `Invalid URL`。
- Nginx `proxy_pass http://host.docker.internal:3002` 末尾不得添加 `/`，否则 `/api/*` 会被去前缀而产生 404。

### 待继续处理

1. 综合检索同时按 `confirmed=1` 和人工核对状态过滤合同，杜绝待核对新合同被 SQL/RAG 返回。
2. 修复混合业绩工具的合同关键词查询与框架类型归一化；在人工确认合同—订单关联数据提供前，保持混合统计停用。
3. 将 EPMS 自动同步升级为保留人工编辑的增量 upsert + 增量模块分析；当前 timer 只完成文件和初筛。
4. 重新生成服务器当前订单数据（9,815/338）的综合检索回归真值；旧 5,213/178 的回归数字仅是历史本地快照。
5. 将 Reranker 集成测试从“首位必须固定合同”改成“相关合同进入 Top-N”，消除模型排序波动导致的假失败。

## 5. 最近代码变更

以 `git log -1 --oneline` 为最终依据。近期关键变更包括：

- `dcf9a84d`：正式合同号必须由人工核对页填写。
- `01895469`、`7b8d8265`：规范化并限制合同号以满足向量 metadata 约束。
- `44ac6f5f`：按内容指纹去除重复合同附件。
- `561c2a3f`、`addebf53`：网关与前端保留同一合同的全部上传附件。
- `8b5dc807`：修复原 PDF 代理 `Readable is not defined`。
- `0d1878af`、`8cba26d9`：默认 Qwen 解析，条件满足时 DeepSeek 兜底。

## 6. 文档索引

- [项目总览](README.md)
- [当前架构](docs/current-architecture.md)
- [服务器迁移与发布手册](docs/deployment-migration-runbook.md)
- [前端维护说明](docs/frontend-handoff.md)
- [EPMS 订单同步说明](apps/epms-sync/README.md)
- [合同解析服务说明](apps/parse-service/README.md)
- [综合检索回归用例](apps/query-agent/evals/real-ledger-regression-20260819.md)
- [历史规划归档](docs/plan/README.md)
