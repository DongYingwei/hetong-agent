-- 001_dict.sql — 种子字典（5 类，可查询）
--
-- 来源：§5.3 枚举列（合同类型/金额属性/合同状态）、§7.2（核对状态）、§6.2 词表大方向（AI 大方向）。
-- 字典独立成表，供前端下拉、查询侧校验、以及验收「SELECT 种子字典 5 类均有行」。
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING。

BEGIN;

CREATE TABLE IF NOT EXISTS dict (
  category   TEXT NOT NULL,      -- 字典大类
  code       TEXT NOT NULL,      -- 取值
  label      TEXT NOT NULL,      -- 展示名（首版与 code 同）
  sort_order INT  NOT NULL DEFAULT 0,
  CONSTRAINT dict_pk PRIMARY KEY (category, code)
);

-- ① 合同类型（§5.3 第10行枚举）
INSERT INTO dict (category, code, label, sort_order) VALUES
  ('contract_type', '框架',   '框架',   1),
  ('contract_type', '单项',   '单项',   2),
  ('contract_type', '补充',   '补充',   3),
  ('contract_type', '解除',   '解除',   4),
  ('contract_type', '变更协议','变更协议',5)
ON CONFLICT DO NOTHING;

-- ② 合同状态（§5.3 第23行枚举）
INSERT INTO dict (category, code, label, sort_order) VALUES
  ('status', '流水中', '流水中', 1),
  ('status', '已签约', '已签约', 2),
  ('status', '已闭环', '已闭环', 3),
  ('status', '已作废', '已作废', 4)
ON CONFLICT DO NOTHING;

-- ③ 金额属性（§5.3 第14行枚举；查询侧分口径求和依据 §7.5/ADR-0002）
INSERT INTO dict (category, code, label, sort_order) VALUES
  ('amount_type', '上限', '上限金额', 1),
  ('amount_type', '预估', '预估金额', 2),
  ('amount_type', '固定', '固定金额', 3)
ON CONFLICT DO NOTHING;

-- ④ 核对状态（§7.2 记录级 confirmed）
INSERT INTO dict (category, code, label, sort_order) VALUES
  ('confirm_status', '0', '草稿（未核对）', 1),
  ('confirm_status', '1', '已核对（正式）', 2)
ON CONFLICT DO NOTHING;

-- ⑤ AI 大方向（§6.2 词表 10 大方向；模块级 mod_*_cat 取值域）
INSERT INTO dict (category, code, label, sort_order) VALUES
  ('ai_category', '大模型与生成式AI', '大模型与生成式AI', 1),
  ('ai_category', '机器学习',         '机器学习',         2),
  ('ai_category', '计算机视觉',       '计算机视觉',       3),
  ('ai_category', '自然语言处理',     '自然语言处理',     4),
  ('ai_category', '语音技术',         '语音技术',         5),
  ('ai_category', '知识图谱',         '知识图谱',         6),
  ('ai_category', '智能运维AIOps',    '智能运维AIOps',    7),
  ('ai_category', '数据智能',         '数据智能',         8),
  ('ai_category', '智能巡检',         '智能巡检',         9),
  ('ai_category', '边缘智能',         '边缘智能',        10)
ON CONFLICT DO NOTHING;

-- ⑥ 合同模块（预置 4 个；可新增——原型「合同模块」页）。
--    anchor_names = 对应合同内模块名称（章节锚点变体，取自原型 page-sections）。
INSERT INTO contract_modules (module_key, name, anchor_names, recognition_rule, enabled, sort_order) VALUES
  ('service', '服务内容', ARRAY['服务内容','项目内容','服务标的','项目交付物'], '按标题章节自动归类：服务/项目内容、交付物相关章节', TRUE, 1),
  ('tech',    '技术要求', ARRAY['技术要求','项目技术栈','交付技术标准','公司技术储备'], '按标题章节自动归类：技术要求、技术栈、技术标准相关章节', TRUE, 2),
  ('role',    '岗位说明', ARRAY['岗位说明','岗位需求'], '按标题章节自动归类：岗位相关章节', TRUE, 3),
  ('staff',   '人员需求', ARRAY['人员需求','人员资质','人员技术要求','人员技能要求'], '按标题章节自动归类：人员资质/技术/技能相关章节', TRUE, 4)
ON CONFLICT DO NOTHING;

COMMIT;
