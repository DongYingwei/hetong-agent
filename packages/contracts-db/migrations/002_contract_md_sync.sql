-- 002 — 片段同步支撑列（T04 切片3 / §7.6.5）
--
-- 背景：正式表 contracts 原不存 MinerU 全文，核对时草稿被删（confirm.py），
-- 导致「原文重传比对 MD5」无处比、重建向量无全文可切。
-- 决策（G5，2026-08-12）：正式库存住全文 md + md5：
--   · 原文重传 → 比 mineru_md5，相同跳过；不同 delete_by_contract + 用新全文重切重建。
--   · 只改标签/关键字 → 不重算 embedding，仅更新 Milvus metadata。
-- 触发方式：显式函数调用 sync_contract() + /sync 端点（不引入事件/MQ 基建）。

BEGIN;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS mineru_md   TEXT,   -- MinerU 全文 markdown（核对时从草稿搬运）；重建向量据此重切
  ADD COLUMN IF NOT EXISTS mineru_md5  TEXT;   -- 上句全文的 MD5，原文重传时比对以决定是否重建

COMMIT;
