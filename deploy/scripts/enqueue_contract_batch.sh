#!/usr/bin/env bash
# 批量合同异步解析入队：服务端执行入口。
#
# 用法：
#   ./deploy/scripts/enqueue_contract_batch.sh --dry-run
#   ./deploy/scripts/enqueue_contract_batch.sh --execute
#
# 输入目录只是上传暂存区。成功入队后，Parse Service 会把原件统一写入
# PDF_ROOT/uploads/YYYY/MM，并建立 contract_sources 记录；不能手工拷进正式原件目录。

set -euo pipefail

MODE="${1:---dry-run}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "用法：$0 [--dry-run|--execute]" >&2
  exit 2
fi

APP_ROOT="${APP_ROOT:-/opt/jingxiaoguan/current}"
INPUT_DIR="${INPUT_DIR:-/data/jingxiaoguan/imports/contracts-20260821}"
PYTHON_BIN="${PYTHON_BIN:-/home/ubuntu/miniconda3/envs/jingxiaoguan/bin/python}"
PARSE_URL="${PARSE_URL:-http://127.0.0.1:8100}"
CREATED_BY="${CREATED_BY:-batch-import-20260821}"
WORKER_SCRIPT="$APP_ROOT/apps/parse-service/scripts/enqueue_contract_directory.py"
LOG_DIR="${LOG_DIR:-/opt/jingxiaoguan/shared/logs}"
DRY_LOG="$LOG_DIR/contract-enqueue-dry-run-20260821.log"
RUN_LOG="$LOG_DIR/contract-enqueue-20260821.log"
PROCESS_PATTERN="enqueue_contract_directory.py.*${INPUT_DIR}.*${CREATED_BY}"

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "输入目录不存在：$INPUT_DIR" >&2
  exit 1
fi
if [[ ! -f "$WORKER_SCRIPT" ]]; then
  echo "缺少批量入队脚本：$WORKER_SCRIPT" >&2
  echo "请先将最新 Git 代码同步到服务器。" >&2
  exit 1
fi
if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python 环境不存在：$PYTHON_BIN" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "[1/3] 检查 Parse Service：$PARSE_URL/health"
if ! curl --fail --silent --show-error "$PARSE_URL/health"; then
  echo >&2
  echo "Parse Service 不可用，未创建任何解析任务。" >&2
  exit 1
fi
echo

echo "[2/3] 执行完整预检（不上传、不写数据库）"
"$PYTHON_BIN" "$WORKER_SCRIPT" \
  --input-dir "$INPUT_DIR" \
  --parse-url "$PARSE_URL" \
  --created-by "$CREATED_BY" \
  > "$DRY_LOG" 2>&1
tail -n 1 "$DRY_LOG"

if [[ "$MODE" == "--dry-run" ]]; then
  echo "预检完成，详细日志：$DRY_LOG"
  echo "确认后执行：$0 --execute"
  exit 0
fi

if pgrep -f "$PROCESS_PATTERN" >/dev/null; then
  echo "已有同一批次的入队进程在运行，未重复启动。" >&2
  pgrep -af "$PROCESS_PATTERN" >&2 || true
  echo "查看日志：tail -f $RUN_LOG" >&2
  exit 0
fi

echo "[3/3] 后台提交解析任务"
nohup env PYTHONUNBUFFERED=1 \
  "$PYTHON_BIN" "$WORKER_SCRIPT" \
  --input-dir "$INPUT_DIR" \
  --parse-url "$PARSE_URL" \
  --created-by "$CREATED_BY" \
  --execute \
  > "$RUN_LOG" 2>&1 < /dev/null &
pid=$!

echo "已启动批量入队进程：PID=$pid"
echo "入队日志：tail -f $RUN_LOG"
echo "任务结果：$INPUT_DIR/批量入队结果_20260821.jsonl"
echo "数据库进度："
echo "  docker exec -i jingxiaoguan-postgres psql -U postgres -d contracts -P pager=off -c \"SELECT status,count(*) FROM contract_parse_jobs WHERE created_by='$CREATED_BY' GROUP BY status ORDER BY status;\""
