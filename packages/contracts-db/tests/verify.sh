#!/usr/bin/env bash
# verify.sh — 端到端验证 T01 验收标准，用一次性 Docker Postgres。
# 无需本机 psql；用 docker exec 进容器跑 psql。
set -euo pipefail

CID="contracts-db-verify-$$"
PGIMG="postgres:16-alpine"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ 启动一次性 Postgres ($PGIMG)…"
docker run -d --name "$CID" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=contracts "$PGIMG" >/dev/null

echo "▶ 等待就绪…"
for i in $(seq 1 30); do
  if docker exec "$CID" pg_isready -U postgres -d contracts >/dev/null 2>&1; then break; fi
  sleep 1
done

psql_c() { docker exec -i "$CID" psql -v ON_ERROR_STOP=1 -U postgres -d contracts "$@"; }

echo "▶ 应用 migration（跑两次证明幂等）…"
psql_c < "$HERE/migrations/001_contracts.sql"
psql_c < "$HERE/migrations/001_contracts.sql"   # 第二次：幂等
echo "▶ 应用 seeds（跑两次证明幂等）…"
psql_c < "$HERE/seeds/001_dict.sql"
psql_c < "$HERE/seeds/001_dict.sql"

fail=0
assert_eq() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "  ✓ $1（=$3）"; else echo "  ✗ $1：期望 $2，实得 $3"; fail=1; fi
}

echo "▶ 断言 1：contracts 台账字段（25 个非模块台账列直建；模块级已移到明细表）"
# §5.3 共 29 逻辑字段：其中 25 个非模块字段直接建 contracts 列；
# 26-29 四模块原文 + §6.3 模块级命中结果改为【配置驱动】→ contract_module_hits，
# 故 contracts 不再含 mod_* 宽列（见断言 10/11）。
LEDGER_COLS="contract_no assessment_line bid_no related_main_no framework_alias \
customer_name contract_name customer_contract_no signing_entity contract_type \
sign_date start_date end_date amount_type amount tax_rate settlement_terms \
post_eval deposit_amount deposit_refund arbitration authorizer status expiry_warning \
tag_ai"
missing=0
for c in $LEDGER_COLS; do
  got=$(psql_c -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='contracts' AND column_name='$c'")
  [ "$got" = "1" ] || { echo "  ✗ 台账列缺失: $c"; missing=$((missing+1)); }
done
assert_eq "25 个非模块台账字段齐全" "0" "$missing"
# 反向：确认 mod_* 宽列已不在 contracts（配置驱动的证据）
MODWIDE=$(psql_c -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='contracts' AND column_name LIKE 'mod\_%'")
assert_eq "contracts 已无 mod_* 宽列" "0" "$MODWIDE"

echo "▶ 断言 2：6 手工列为 NULLABLE"
HAND_COLS="contract_no assessment_line bid_no related_main_no framework_alias status"
# 注：contract_no 是手工但唯一键 NOT NULL；§5.3 手工列共 6 个(1,4,5,6,7,23)。
# 6 手工列里 contract_no(1) 为唯一键 NOT NULL，其余 5 个(4,5,6,7,23)须 NULLABLE。
nn=0
for c in assessment_line bid_no related_main_no framework_alias status; do
  isnull=$(psql_c -tAc "SELECT is_nullable FROM information_schema.columns WHERE table_name='contracts' AND column_name='$c'")
  [ "$isnull" = "YES" ] || { echo "  ✗ 手工列非 NULLABLE: $c"; nn=$((nn+1)); }
done
assert_eq "5 个可空手工列均 NULLABLE" "0" "$nn"

echo "▶ 断言 3：非模块 AI 字段有 _ai_raw 留痕列（计数=17；模块留痕在明细表）"
RAW_CNT=$(psql_c -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='contracts' AND column_name LIKE '%\_ai\_raw'")
assert_eq "_ai_raw 留痕列数" "17" "$RAW_CNT"
CONF=$(psql_c -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='contracts' AND column_name IN ('confirmed','confirmed_by','confirmed_at')")
assert_eq "记录级核对列 confirmed/_by/_at" "3" "$CONF"

echo "▶ 断言 4：物化时间列 —— INSERT sign_date='2026-04-02' → Q2/H1/2026"
psql_c -c "INSERT INTO contracts (contract_no, sign_date, end_date) VALUES ('HT-VERIFY-0001','2026-04-02','2027-12-31')" >/dev/null
SY=$(psql_c -tAc "SELECT sign_year    FROM contracts WHERE contract_no='HT-VERIFY-0001'")
SQ=$(psql_c -tAc "SELECT sign_quarter FROM contracts WHERE contract_no='HT-VERIFY-0001'")
SH=$(psql_c -tAc "SELECT sign_half    FROM contracts WHERE contract_no='HT-VERIFY-0001'")
EY=$(psql_c -tAc "SELECT end_year     FROM contracts WHERE contract_no='HT-VERIFY-0001'")
assert_eq "sign_year"    "2026" "$SY"
assert_eq "sign_quarter" "2"    "$SQ"
assert_eq "sign_half"    "1"    "$SH"
assert_eq "end_year"     "2027" "$EY"

echo "▶ 断言 5：金额可空 —— 无金额合同可 INSERT（框架协议）"
psql_c -c "INSERT INTO contracts (contract_no, amount) VALUES ('HT-VERIFY-NULLAMT', NULL)" >/dev/null
NA=$(psql_c -tAc "SELECT count(*) FROM contracts WHERE contract_no='HT-VERIFY-NULLAMT' AND amount IS NULL")
assert_eq "无金额合同入库" "1" "$NA"

echo "▶ 断言 6：正式库 confirmed=1 约束 —— 插 confirmed=0 应被拒"
if psql_c -c "INSERT INTO contracts (contract_no, confirmed) VALUES ('HT-VERIFY-BAD', 0)" >/dev/null 2>&1; then
  echo "  ✗ CHECK 未生效：confirmed=0 竟被接受"; fail=1
else
  echo "  ✓ confirmed=0 被 CHECK 拒绝（正式库只存已背书数据）"
fi

echo "▶ 断言 7：草稿表 / 片段表存在"
DRAFT=$(psql_c -tAc "SELECT to_regclass('contracts_draft') IS NOT NULL")
CHUNK=$(psql_c -tAc "SELECT to_regclass('contract_chunks') IS NOT NULL")
assert_eq "contracts_draft 存在" "t" "$DRAFT"
assert_eq "contract_chunks 存在" "t" "$CHUNK"

echo "▶ 断言 8：片段表 metadata 四字段（§7.6.3）"
META=$(psql_c -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='contract_chunks' AND column_name IN ('contract_id','contract_no','field','module_category')")
assert_eq "chunk metadata 四字段" "4" "$META"

echo "▶ 断言 9：种子字典 5 类均有行"
for cat in contract_type status amount_type confirm_status ai_category; do
  n=$(psql_c -tAc "SELECT count(*) FROM dict WHERE category='$cat'")
  if [ "$n" -ge 1 ]; then echo "  ✓ 字典 $cat 有 $n 行"; else echo "  ✗ 字典 $cat 无行"; fail=1; fi
done

echo "▶ 断言 10：模块配置表 contract_modules（可新增）——预置 4 模块 + 锚点变体"
MODS=$(psql_c -tAc "SELECT to_regclass('contract_modules') IS NOT NULL")
assert_eq "contract_modules 存在" "t" "$MODS"
MODCNT=$(psql_c -tAc "SELECT count(*) FROM contract_modules")
assert_eq "预置模块数" "4" "$MODCNT"
# service 模块的锚点变体应含原型里的 4 个
ANCHOR=$(psql_c -tAc "SELECT '服务标的' = ANY(anchor_names) FROM contract_modules WHERE module_key='service'")
assert_eq "service 锚点含「服务标的」" "t" "$ANCHOR"
# 模拟「新增模块」：插一行即成，无需 ALTER
psql_c -c "INSERT INTO contract_modules (module_key,name,anchor_names,sort_order) VALUES ('legal','法务条款',ARRAY['法务','合规'],5)" >/dev/null
NEWMOD=$(psql_c -tAc "SELECT count(*) FROM contract_modules WHERE module_key='legal'")
assert_eq "新增模块=插行（无需 ALTER）" "1" "$NEWMOD"

echo "▶ 断言 11：模块命中明细 contract_module_hits —— 每合同×每模块一行"
CMH=$(psql_c -tAc "SELECT to_regclass('contract_module_hits') IS NOT NULL")
assert_eq "contract_module_hits 存在" "t" "$CMH"
# 用已插入的 HT-VERIFY-0001 写两条模块命中（注意：不要复用容器名变量 CID）
ROWID=$(psql_c -tAc "SELECT id FROM contracts WHERE contract_no='HT-VERIFY-0001'")
psql_c -c "INSERT INTO contract_module_hits (contract_id,module_key,hit,keywords,category,raw_text) VALUES ($ROWID,'service',1,'智能巡检,AIOps','智能巡检','服务内容原文…'), ($ROWID,'tech',0,NULL,NULL,'技术要求原文…')" >/dev/null
HITS=$(psql_c -tAc "SELECT count(*) FROM contract_module_hits WHERE contract_id=$ROWID")
assert_eq "该合同模块命中行数" "2" "$HITS"
# 查询侧 mod_service_ai=1 的等价：JOIN 明细表
SVC=$(psql_c -tAc "SELECT count(*) FROM contract_module_hits WHERE module_key='service' AND hit=1 AND contract_id=$ROWID")
assert_eq "JOIN 明细表可查『服务内容命中』" "1" "$SVC"
# 唯一约束：同合同同模块不可重复
if psql_c -c "INSERT INTO contract_module_hits (contract_id,module_key,hit) VALUES ($ROWID,'service',1)" >/dev/null 2>&1; then
  echo "  ✗ (contract_id,module_key) 唯一约束未生效"; fail=1
else
  echo "  ✓ (contract_id,module_key) 唯一约束生效"
fi

echo
if [ "$fail" = "0" ]; then echo "✅ T01 全部断言通过（migration 幂等 + 台账字段 + 物化列 + 约束 + 五表 + 6 类字典/模块 + 配置驱动模块）"; else echo "❌ 存在失败断言"; fi
exit $fail
