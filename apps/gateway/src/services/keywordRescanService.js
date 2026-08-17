import { query, queryRead } from '../config/db.js';
import { config } from '../config/index.js';

let activeJobId = null;

function jobSummary(row) {
  return { ...row, total_count: Number(row.total_count), success_count: Number(row.success_count), skipped_count: Number(row.skipped_count), failed_count: Number(row.failed_count) };
}

export async function listKeywordRescanJobs() {
  const rows = await query('SELECT * FROM keyword_rescan_jobs ORDER BY id DESC LIMIT 20');
  return Promise.all(rows.map((row) => getKeywordRescanJob(row.id)));
}

export async function getKeywordRescanJob(id) {
  const rows = await query('SELECT * FROM keyword_rescan_jobs WHERE id=?', [id]);
  if (!rows[0]) return null;
  const [counts] = await query(`SELECT
    COUNT(*) FILTER (WHERE status='running')::int running_count,
    COUNT(*) FILTER (WHERE status='queued')::int queued_count,
    COUNT(*) FILTER (WHERE status='success')::int success_count,
    COUNT(*) FILTER (WHERE status='skipped')::int skipped_count,
    COUNT(*) FILTER (WHERE status='failed')::int failed_count
    FROM keyword_rescan_job_items WHERE job_id=?`, [id]);
  return { ...jobSummary(rows[0]), ...counts };
}

export async function getKeywordRescanFailures(id) {
  return query(`SELECT entity_type,entity_no,error_message FROM keyword_rescan_job_items
    WHERE job_id=? AND status='failed' ORDER BY entity_type,entity_no`, [id]);
}

export async function startKeywordRescan({ scope = 'all', overwriteManual = false, requestedBy }) {
  const running = await query("SELECT id FROM keyword_rescan_jobs WHERE status IN ('queued','running') ORDER BY id DESC LIMIT 1");
  if (running.length) return { existing: true, job: await getKeywordRescanJob(running[0].id) };
  const created = await query('INSERT INTO keyword_rescan_jobs(scope,overwrite_manual,requested_by) VALUES (?,?,?) RETURNING id', [scope, overwriteManual, requestedBy]);
  const id = created[0].id;
  const [contracts, orders] = await Promise.all([
    scope === 'order' ? [] : queryRead('SELECT id,contract_no FROM contracts ORDER BY id'),
    scope === 'contract' ? [] : query('SELECT id,order_no FROM sys_order WHERE delete_status=0 ORDER BY id'),
  ]);
  const items = [
    ...contracts.map((row) => [id, 'contract', row.id, row.contract_no]),
    ...orders.map((row) => [id, 'order', row.id, row.order_no]),
  ];
  for (const item of items) await query('INSERT INTO keyword_rescan_job_items(job_id,entity_type,entity_id,entity_no) VALUES (?,?,?,?)', item);
  await query('UPDATE keyword_rescan_jobs SET total_count=?,status=?,started_at=now(),updated_at=now() WHERE id=?', [items.length, 'running', id]);
  void runKeywordRescan(id);
  return { existing: false, job: await getKeywordRescanJob(id) };
}

export async function retryKeywordRescanFailures(id) {
  const job = await getKeywordRescanJob(id);
  if (!job) return null;
  if (activeJobId) return { existing: true, job: await getKeywordRescanJob(activeJobId) };
  await query("UPDATE keyword_rescan_job_items SET status='queued',error_message=NULL,started_at=NULL,finished_at=NULL WHERE job_id=? AND status='failed'", [id]);
  await query("UPDATE keyword_rescan_jobs SET status='running',failed_count=0,finished_at=NULL,updated_at=now() WHERE id=?", [id]);
  void runKeywordRescan(id);
  return { existing: false, job: await getKeywordRescanJob(id) };
}

async function markItem(jobId, type, id, status, error = null) {
  await query(`UPDATE keyword_rescan_job_items SET status=?,error_message=?,started_at=COALESCE(started_at,now()),finished_at=now()
    WHERE job_id=? AND entity_type=? AND entity_id=?`, [status, error, jobId, type, id]);
}

async function runContracts(job) {
  const items = await query("SELECT entity_id FROM keyword_rescan_job_items WHERE job_id=? AND entity_type='contract' AND status IN ('queued','running') ORDER BY entity_id", [job.id]);
  for (const item of items) {
    try {
      await query("UPDATE keyword_rescan_job_items SET status='running',started_at=now() WHERE job_id=? AND entity_type='contract' AND entity_id=?", [job.id, item.entity_id]);
      const response = await fetch(`${config.parse.url}/contracts/rescan-keywords`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contract_ids: [item.entity_id], overwrite_manual: job.overwrite_manual }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `合同扫描服务返回 ${response.status}`);
      await markItem(job.id, 'contract', item.entity_id, 'success');
    } catch (error) { await markItem(job.id, 'contract', item.entity_id, 'failed', error.message); }
  }
}

async function runOrders(job) {
  // 订单脚本从同一任务表领取 queued 项，逐条提交进度，网关重启后可继续领取。
  const { spawn } = await import('node:child_process');
  const root = new URL('../../../epms-sync/scripts/rescan_order_keywords.py', import.meta.url);
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || '/home/wdy/data/anaconda3/bin/python', [root.pathname, '--job-id', String(job.id)], { cwd: new URL('../../../epms-sync', import.meta.url).pathname, env: { ...process.env, PYTHONPATH: 'src:../parse-service/src' }, stdio: 'ignore', detached: false });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`订单扫描进程退出码 ${code}`)));
  });
}

export async function runKeywordRescan(id) {
  if (activeJobId && activeJobId !== id) return;
  activeJobId = id;
  try {
    const job = await getKeywordRescanJob(id);
    if (!job || !['queued', 'running'].includes(job.status)) return;
    await runContracts(job);
    await runOrders(job);
    const [counts] = await query(`SELECT COUNT(*) FILTER (WHERE status='success')::int success_count, COUNT(*) FILTER (WHERE status='skipped')::int skipped_count, COUNT(*) FILTER (WHERE status='failed')::int failed_count FROM keyword_rescan_job_items WHERE job_id=?`, [id]);
    await query("UPDATE keyword_rescan_jobs SET status=?,success_count=?,skipped_count=?,failed_count=?,finished_at=now(),updated_at=now() WHERE id=?", [counts.failed_count ? 'completed_with_errors' : 'completed', counts.success_count, counts.skipped_count, counts.failed_count, id]);
  } catch (error) {
    await query("UPDATE keyword_rescan_jobs SET status='failed',error_message=?,finished_at=now(),updated_at=now() WHERE id=?", [error.message, id]);
  } finally { activeJobId = null; }
}

export async function resumeKeywordRescanJobs() {
  const rows = await query("SELECT id FROM keyword_rescan_jobs WHERE status IN ('queued','running') ORDER BY id LIMIT 1");
  if (rows[0]) void runKeywordRescan(rows[0].id);
}
