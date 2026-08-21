# epms-sync — EPMS 订单增量同步

从 EPMS 系统增量拉取订单附件，解析为 Markdown 并按订单编号分目录，再做 AI 关键词判定，随后按订单编号增量写入订单台账。
生产服务器每天凌晨 02:30 由 `jingxiaoguan-epms-sync.timer` 自动执行，用 checkpoint 记录已统计到的「审核日期」，避免全量重拉。本地可按需手动运行或使用遗留 cron 文件。

## 流程

```
导出订单 Excel（getExportData→exportExcel，63 列）
  → 补 uuid（offset 分页拉 toList 建索引）
  → 下载附件（按 uuid，跳过「附件=无」）
  → 解析 md（PDF→PyMuPDF / 图片→MinerU / eml→正文 / office→纯文本）
  → AI 关键词判定（数据库 ai_keyword_terms + jinguan_parse.keyword_scan）
  → 增量 upsert 订单台账（保留人工字段覆盖）
  → 本次 AI 订单四模块归类（保留人工关键词调整）
  → 更新 checkpoint
```

产物：
- `data/EPMS/` 订单 Excel + 附件（文件名 `{订单编号}-{序号}{ext}`）
- `data/md-epms/` 每订单一个子目录的 md + `manifest.json` + `ai_keyword_results.json`
- `data/epms-sync-state.json` 增量 checkpoint

## 自动同步范围与数据边界（重要）

`run_daily.py` 在下载、解析、AI 初筛完成后，会将本次审核时间范围内的订单按 `订单编号` 写入运营库 `contract_assistant.sys_order`：新订单插入，已有订单更新 EPMS 来源字段。

页面编辑不会直接与 EPMS 来源混在一起：`order_sync_sources` 保存最新来源快照，`order_field_overrides` 保存人工变更字段。每日同步不会覆盖这些字段；用户将字段改回来源值时，对应覆盖会自动解除。人工维护的四模块关键词以 `manual` 标记保留，不会被自动模型归类覆盖。

`import_order_ledger.py` 仍是受控全量重导脚本，会重建订单主表及关联数据，不能接入定时任务。

首次启用增量同步前，必须用当前已审核全量 Excel 执行一次基线建立，识别旧版直接写入 `sys_order` 的人工修改：

```bash
python3 scripts/seed_order_sync_baseline.py \
  --xlsx /data/jingxiaoguan/epms/EPMS/订单信息_2026年_审核时间全量补全.xlsx \
  --ai-results /data/jingxiaoguan/epms/md-epms/ai_keyword_results.json
```

## 配置

```bash
cd apps/epms-sync
cp .env.example .env
# 填 EPMS_PASSWORD、PG_URL（合同关键词库）、ORDER_PG_URL（订单运营库）；
# systemd 已加载 gateway.env 时可由 DB_* 自动生成 ORDER_PG_URL。
```

依赖（base 环境，Python 3.10）：
```bash
pip install -r requirements.txt   # requests/pandas/openpyxl/pymupdf/psycopg/python-dotenv
```

## 手动运行

```bash
cd apps/epms-sync
python3 scripts/run_daily.py                                    # 读 checkpoint 增量
python3 scripts/run_daily.py --review-from 2026-08-16 --review-to 2026-08-17  # 手动审核时间区间（不回写 checkpoint）

# 全量订单台账重导（人工确认后执行；会覆盖运营库 sys_order，不影响合同库 contracts）
# 不要将此命令加入 run_daily.py 或 systemd timer。
python3 scripts/import_order_ledger.py

# 对全文命中 AI 的订单附件调用本地 Qwen，写入四模块 AI/— 标记
python3 scripts/analyze_order_ai_modules.py

# 仅导出审阅用 Excel：在源订单 Excel 末尾增加“是否包含AI关键词”，不修改数据库
python3 scripts/export_order_ledger_with_ai.py \
  --xlsx /data/jingxiaoguan/epms/EPMS/订单信息_2026年_审核时间全量补全.xlsx \
  --ai-results /data/jingxiaoguan/epms/md-epms/ai_keyword_results.json \
  --output /data/jingxiaoguan/epms/订单信息_2026年_含AI关键词.xlsx
```

## 定时（服务器 systemd timer）

```bash
sudo systemctl enable --now jingxiaoguan-epms-sync.timer
systemctl list-timers jingxiaoguan-epms-sync.timer
journalctl -u jingxiaoguan-epms-sync.service -n 100 --no-pager
```

部署环境变量中的 `MD_DIR` 必须为 `/data/jingxiaoguan/epms/md-epms`。若保留开发机
`/home/wdy/...` 路径，模块分析会错误提示“没有可分析的附件 Markdown”。

## 本地遗留 cron（可选）

```bash
crontab -e   # 追加 cron/epms-sync.cron 里的那一行
# 或系统级：
sudo cp cron/epms-sync.cron /etc/cron.d/epms-sync && sudo chmod 644 /etc/cron.d/epms-sync
```

## 增量机制与已知限制

- checkpoint `last_review_date` = 下次拉取的「审核日期」起始（含）；升级时会自动读取旧字段 `last_start_time`。
- 增量字段是**审核时间 reviewTime**（接口 `reviewTimeSt/reviewTimeEd`）。日期参数会自动扩展为
  `00:00:00` 至 `23:59:59`；也可传入完整的 `YYYY-MM-DD HH:MM:SS`。
  已审核但订单开始日期更早/更晚的订单也会被同步。
- 已存在的 md 幂等跳过；重复跑同一天不会重复下载（文件存在即跳过）。
- 全量导入会清空并重建 `sys_order` 及其关联的模块命中、人工覆盖、合同订单关联；执行前必须备份 `contract_assistant`。合同库、合同附件和合同向量不受影响。
- 订单编号中的 `/` 在文件名和 Markdown 目录中会变为 `_`；关联时必须使用脚本的规范化函数，不能直接拼原订单号路径。
