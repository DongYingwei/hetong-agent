# epms-sync — EPMS 订单增量同步

从 EPMS 系统增量拉取订单附件，解析为 Markdown 并按订单编号分目录，再做 AI 关键词判定。
每天凌晨 02:30 自动执行一次（cron），用 checkpoint 记录已统计到的「审核日期」，避免全量重拉。

## 流程

```
导出订单 Excel（getExportData→exportExcel，63 列）
  → 补 uuid（offset 分页拉 toList 建索引）
  → 下载附件（按 uuid，跳过「附件=无」）
  → 解析 md（PDF→PyMuPDF / 图片→MinerU / eml→正文 / office→纯文本）
  → AI 关键词判定（数据库 ai_keyword_terms + jinguan_parse.keyword_scan）
  → 更新 checkpoint
```

产物：
- `data/EPMS/` 订单 Excel + 附件（文件名 `{订单编号}-{序号}{ext}`）
- `data/md-epms/` 每订单一个子目录的 md + `manifest.json` + `ai_keyword_results.json`
- `data/epms-sync-state.json` 增量 checkpoint

## 配置

```bash
cd apps/epms-sync
cp .env.example .env
# 填 EPMS_PASSWORD、PG_URL（contracts 库）、必要时 MinerU 地址
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

# 全量订单台账导入（仅覆盖运营库 sys_order，不影响合同库 contracts）
python3 scripts/import_order_ledger.py

# 对全文命中 AI 的订单附件调用本地 Qwen，写入四模块 AI/— 标记
python3 scripts/analyze_order_ai_modules.py
```

## 定时（cron）

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
