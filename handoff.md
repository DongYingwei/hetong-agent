# 经小管合同智能体 · 交接文档

## 第零节：2026-08-18 当前状态（优先阅读）

### 已完成并已推送

- 2026-08-19 服务器内部验收环境已部署在 `192.168.101.217:5174`：Nginx `web` 容器、Gateway、Parse Service 与 Query Agent 均已打通。部署与故障修复步骤见 `docs/deployment-migration-runbook.md` 的 4.1、6.1。
- 服务器订单台账已按全量 Excel 重导为 9,815 条，338 条命中 AI；四模块分析已完成 336 条，两个 Qwen JSON 失败订单待用 DeepSeek 定向重试。
- 综合检索边界已确认待发布：Gateway 四态 Intent Gate（欢迎/执行/澄清/拒绝）、SQL/RAG/混合业绩严格分流、单次 8,000 字限制、最近 10 轮 + 30 天会话事实摘要；部署前需执行 `014_agent_session_memory.sql`。

- 合同台账、合同详情和人工核对页已按 v1.3 原型对齐：详情包含基本信息、金额及结算、商务条款、风控、关键词解析、原文件预览六页签。
- 合同详情的关键词解析由真实接口提供：模块识别结果 + 命中明细；明细中“关键词”为子词，“所属大类”为关键词管理中的父词，无识别置信度字段。
- 台账操作：未核对为“核对”；已核对主操作为“查看”，更多菜单提供“编辑”（可保存）、下载原文件和删除。
- 合同与订单台账均使用模块配置生成 AI 列和筛选项；多模块筛选为 AND。
- 关键词重扫任务已启用：合同管理员和系统管理员均可执行及重试；重扫只更新命中和 AI 标记，不重新解析、切片或建向量。
- EPMS cron 已实际安装：每天 `02:30` 执行 `apps/epms-sync/scripts/run_daily.py`。最近成功时间为 2026-08-18 02:30，状态在 `data/epms-sync-state.json`，日志在 `data/epms-sync.log`。

### 当前约束与待处理

- 合同—订单关联表和管理代码已保留，但没有人工确认的关联数据；页面入口已隐藏，禁止用于混合金额统计。
- 权限仍需继续收敛到数据库菜单权限；不要用前端默认角色、中文角色名或固定菜单 ID 作最终鉴权。
- 所有模型、MinerU、向量服务地址应逐步改为仅由 `.env` 提供；当前有历史默认地址。
- 工作区还存在未提交的查询智能体/综合检索相关修改，提交时必须与前端改动分开核对。

---

> 写给一个**完全没有上下文的新会话**。读完这份 + `apps/epms-sync/README.md` 就能接着干。
> 最后更新：2026-08-17 · 本轮主体是 **EPMS 订单数据增量同步**（`apps/epms-sync/`，新模块）。
> 项目查询侧/解析侧的旧交接仍有效，见本文件末尾「附：查询侧历史」与 `README.md`。

---

## 一、我们在做什么任务

从 **EPMS**（企业采购/合同系统，`http://47.99.86.222:8995/saas/`）把订单数据拉到本项目的 `hetong-agent`，做三件事：

| 子任务 | 一句话 | 入口 |
|---|---|---|
| ① 增量同步 | 每天增量拉订单 → 下载附件 → 解析 md → AI 关键词判定 | `apps/epms-sync/scripts/run_daily.py` |
| ② 台账导入 | 把 EPMS 全量 63 列订单写进运营库 `contract_assistant.sys_order` | `apps/epms-sync/scripts/import_order_ledger.py` |
| ③ AI 模块分析 | 对全文命中 AI 的订单，调本地 Qwen 判四模块（项目/服务/技术/人员），写 `order_module_hits` | `apps/epms-sync/scripts/analyze_order_ai_modules.py` |

**数据流向**：
```
EPMS 系统 ──导出/下载/解析──▶ 本地文件 data/{EPMS, md-epms}
                                   │
        ┌──────────────────────────┴──────────────┐
        ▼                                          ▼
  运营库 contract_assistant.sys_order           md-epms/ai_keyword_results.json
  （订单台账，含 AI 扫描结果）                   （订单→命中词，供③读取）
```

**关键区分（别混）**：本任务操作的是**运营库 `contract_assistant`**（`sys_order` / `order_module_hits`），**绝不碰查询库 `contracts`**（那是合同解析侧的库）。

---

## 二、已经完成了什么

### A. EPMS 接口逆向（全部实测通过，结论在 `apps/epms-sync/src/epms_sync/`）

- **导出完整订单**：`getExportData.do`（POST，参数 `queryParam`+`gdData`，返回 `ok`）→ `exportExcel.do`（POST，空 body，**同一 session**）→ 返回 63 列 xlsx 文件流。**一步拿到完整订单信息**（含明细/财务字段），比 `toList`（只有主表）+ 明细接口补全简单得多。
- **补 uuid**：`toList.do`（POST），`pageNumber` 是**行偏移 offset**（不是页号），分页 `offset += pageSize`。
- **下载附件**：三个接口齐全 —— `toAttachmentList.do`（合同附件）+ `toYsAttachmentList.do`（验收附件）+ `downloadFile.do`（GET 文件流）。**没有用** `toGetMainData2.do`（那是明细数据接口，与附件无关）。

### B. 全量数据已跑完（本地文件）

- `data/EPMS/`：4377 个文件（订单 Excel + 附件，附件名 `{订单编号}-{序号}{ext}`，订单编号里的 `/` 已转 `_`）。
- `data/md-epms/`：4049 个 md（每订单一个子目录，`{订单编号}/1.md`），3502 个订单目录；`manifest.json`（订单→md 列表）+ `ai_keyword_results.json`（订单→判定/命中词）。
- **AI 判定结果：3502 个订单，命中 179**（关键词表来自数据库 `ai_keyword_terms`，父词「AI」+ 60 子词，与台账同源）。

### C. 代码已移植到位（`apps/epms-sync/`，base 环境 Python 3.10）

```
src/epms_sync/
  config.py       # 从 .env 读配置
  state.py        # checkpoint 读写（last_start_time）
  epms_login.py   # EPMS 登录换 Cookie（TTL 缓存）
  export.py       # 增量导出 63 列 + 补 uuid
  download.py     # 下载附件（合同+验收，并发，文件存在即跳过）
  parse.py        # 附件→md 按订单分目录（幂等）
  ai_scan.py      # DB 词表 + jinguan_parse.keyword_scan 判定
  pipeline.py     # 五步编排
  pdf_text.py / eml_text.py / attachment_text.py / mineru_client.py  # 解析依赖
scripts/run_daily.py  cron 入口
scripts/import_order_ledger.py  台账导入（已写）
scripts/analyze_order_ai_modules.py  AI 模块分析（已写）
scripts/rescan_order_keywords.py  关键词重扫（已写）
tests/test_analyze_order_ai_modules.py
cron/epms-sync.cron / .env（已生成真实值）/ README.md
```

- 依赖已装齐：base 环境 `pymupdf`（新装）、`xlrd`、`psycopg[binary]` 等（见 `requirements.txt`）。
- `eml_text.py` 已扩展为**同时提取邮件内嵌附件**（PDF/Office/图片），解决空正文邮件丢证据问题。
- `.xls` 附件是「HTML 伪装」的（老式导出，Excel 可开），已用 `read_html` 处理，不依赖 xlrd。

---

## 三、当前卡在哪（按严重度排序）

### 🔴 1. cron 没装 —— 不会自动跑（最硬的断点）
只写了 `apps/epms-sync/cron/epms-sync.cron`，**没写进 crontab**。安装：
```bash
crontab -e   # 追加 cron/epms-sync.cron 里那一行
# 或系统级：
sudo cp apps/epms-sync/cron/epms-sync.cron /etc/cron.d/epms-sync && sudo chmod 644 /etc/cron.d/epms-sync
```

### 🟠 2. checkpoint 还没创建
验证时用的是 `--start-from` 手动区间（特意**不回写** checkpoint）。首次正式跑（`python3 scripts/run_daily.py` 不带参数）才会创建 `data/epms-sync-state.json`，初始 `last_start_time=2026-08-16`（已按「已统计到 8-15」设置）。**跑之前确认 state 文件不存在或 last_start_time 正确**，否则可能误全量重拉。

### 🟡 3. 台账导入 / AI 模块分析的端到端未在本会话验证
`import_order_ledger.py`、`analyze_order_ai_modules.py`、`rescan_order_keywords.py` 是会话末尾补齐的，**本会话没跑过端到端**（有 `tests/test_analyze_order_ai_modules.py`，但未在本会话确认全绿）。接手后先各自 dry-run 一遍。

---

## 四、下一步计划（按优先级）

1. **装 cron**（第三节 🔴），然后手动 `python3 scripts/run_daily.py` 跑一次，确认：导出→下载→解析→判定→生成 state 文件，`last_start_time` 推进到当天。
2. **验证台账导入**：`python3 scripts/import_order_ledger.py`，确认 `contract_assistant.sys_order` 写入正确、订单号 `/`→`_` 关联对得上 `md-epms` 目录。
3. **验证 AI 模块分析**：`python3 scripts/analyze_order_ai_modules.py`（只对全文命中 AI 的 179 个订单调 Qwen），确认 `order_module_hits` 落库、四模块标记正确。
4. **回填存量空 EML**：`eml_text.py` 已能提取内嵌附件，但历史 324 个空 md（EML 空正文）不会自动重跑——`parse.py` 里已有 `retry_empty_eml` 逻辑允许空 EML 在解析器升级后重试，跑一次 `run_daily` 或单独触发解析即可。
5. **可选**：确认增量字段 `startTime` 是否漏单（「开始日期在未来」的订单当天拉不到），必要时在 `pipeline.run_daily` 把 `end_to` 顺延 N 天或改 `receiveTime`。

---

## 五、绝对不要再踩的坑

1. **EPMS `pageNumber` 是行偏移 offset，不是页号** —— 翻页 `pageNumber = 0, pageSize, 2*pageSize, ...`；用 `0,1,2...` 会永远只返回第一页（之前踩过，拉了 5100 条重复数据）。
2. **`getExportData.do` 必须带 `gdData` 参数** —— 只传 `queryParam` 会返回 `error`（不是 `ok`）。
3. **导出两步要同一 session** —— `getExportData.do` 触发、`exportExcel.do` 下载，共享 JSESSIONID；换新 session 拿不到文件。
4. **`exportExcel.do` 返回的文件名是 GBK 编码** —— `Content-Disposition` 里 `订单信息.xlsx` 被 latin-1 解码成乱码；我们直接自定输出文件名，不解析它。
5. **订单编号里的 `/` 在附件文件名里变成 `_`** —— 下载用 `_safe_filename` 处理过；md 目录名用 `_` 版，关联订单编号时要统一（`norm_order_no` 已做这个）。
6. **`.xls` 附件是 HTML 伪装** —— 不是真 xls，用 `pandas.read_html` 解析；真 xls 二进制才需要 xlrd（requirements 已加但没验证过真 xls）。
7. **空 md（EML 空正文/扫描件）会被重复解析** —— 幂等跳过用「文件存在即跳过」，不是「非空才跳过」；否则每天重复调昂贵的 MinerU。空 EML 单独 `retry_empty_eml` 允许升级后重试。
8. **时间戳是毫秒 UTC** —— 转日期要 `+ pd.Timedelta(hours=8)`，否则月份错位。
9. **base 环境是 Python 3.10，不是 mineru 环境的 3.12** —— 语法有差异（如 bytes 字面量 `rb"一"` 在 3.10 直接 SyntaxError），别照搬 mineru 环境能跑的写法。
10. **`Path(...).suffix` 返回单个字符串，不能解包** —— `_, ext = Path(x).suffix` 会 ValueError；要拆用 `os.path.splitext` 或直接取 `.suffix`。
11. **两个 PG 库别混** —— 本任务只写**运营库 `contract_assistant`**（`sys_order`/`order_module_hits`），查询库 `contracts` 是合同解析侧的，结构不同、别碰。
12. **AI 判定词表在数据库 `ai_keyword_terms`，不是 xlsx** —— 用 `jinguan_parse.keyword_scan.scan_fulltext_markdown`（复用，别重写）；词表来自台账 Sheet 同步（`sync_keyword_sheet.py`）。

---

## 六、关键端点/配置（真实值在各自 `.env`，勿提交）

- **EPMS** `http://47.99.86.222:8995/saas/`，登录 `POST /saas/userLoginCtrl/authLogin.do`（下发 JSESSIONID + X-Access-Token）。
- **MinerU** `http://192.168.121.33:8000/file_parse`，`backend=pipeline`（图片附件解析）。
- **PG 运营库** `postgresql://...@localhost:5433/contract_assistant`（`sys_order`/`order_module_hits`）；**查询库** `.../contracts`（合同，别碰）。
- **本地 Qwen**（AI 模块分析用）：见 `apps/gateway/.env`（`import_order_ledger.py` 从 `apps/gateway/.env` 读 DB）。
- epms-sync 自身 `.env`（`apps/epms-sync/.env`，已生成真实值）：`EPMS_USERNAME/PASSWORD`、`PG_URL`、`MINERU_BASE_URL`、`ATTACH_DIR`、`MD_DIR`、`STATE_PATH`、`EPMS_INITIAL_START_TIME=2026-08-16`。

---

## 七、新会话快速上手

1. 读本文件 + `apps/epms-sync/README.md`。
2. 确认依赖：`/home/wdy/data/anaconda3/bin/python -c "import requests,pandas,openpyxl,fitz,psycopg,dotenv"`。
3. 手动跑一次增量：`cd apps/epms-sync && /home/wdy/data/anaconda3/bin/python scripts/run_daily.py`（首次会创建 state）。
4. 看 AI 结果：`data/md-epms/ai_keyword_results.json`。
5. 装 cron（第三节 🔴），收尾。

---

## 附：查询侧历史（上一轮工作，仍有效但非本轮焦点）

本项目「经小管合同智能体」另有两块查询能力（结构化 SQL + RAG 语义检索），由 `apps/query-agent/`（TS）+ `apps/parse-service/`（Python FastAPI）+ `apps/gateway/`（Koa:3002）+ `apps/web/`（Vue3:5173）构成，经 PostgreSQL `contracts` + Milvus 耦合。上一轮已完成 T01–T11、坑 1–22（详见旧 handoff 或 `docs/plan/`）。**本轮 EPMS 任务（`apps/epms-sync/`）是新增模块，与查询侧并行，互不冲突。** 唯一共享点是 `jinguan_parse.keyword_scan`（AI 关键词扫描函数）和数据库 `ai_keyword_terms` 词表。
