<template>
  <el-popover placement="bottom-end" :width="380" trigger="click" @show="load">
    <template #reference>
      <el-badge :value="activeJobs.length || undefined" type="warning" class="cursor-pointer">
        <el-button plain class="!border-[#f8a42b] !text-[#9a5b0b]">
          <el-icon class="mr-1"><UploadFilled /></el-icon>解析任务
        </el-button>
      </el-badge>
    </template>
    <div class="flex items-center justify-between mb-3">
      <span class="font-semibold text-[#1f1f1f]">合同解析进度</span>
      <el-button link class="!text-[#c77710]" @click="load">刷新</el-button>
    </div>
    <div v-if="jobs.length === 0" class="py-5 text-center text-xs text-gray-400">暂无解析任务</div>
    <div v-else class="max-h-[420px] overflow-y-auto space-y-3 pr-1">
      <div v-for="job in jobs" :key="job.id" class="rounded-lg border border-[#faeae1] bg-[#fffdfa] p-3">
        <div class="flex justify-between gap-2 text-xs">
          <span class="truncate font-medium text-[#1f1f1f]">{{ displayName(job.current_file, job.id) }}</span>
          <span :class="statusClass(job.status)">{{ statusText(job.status) }}</span>
        </div>
        <el-progress class="mt-2" :percentage="job.progress" :stroke-width="7" :show-text="false"
          :color="job.status === 'failed' ? '#e26d5a' : '#f8a42b'" />
        <div class="mt-1.5 flex justify-between text-[11px] text-gray-400">
          <span>{{ job.processed_files || 0 }}/{{ job.total_files || 0 }} 个 PDF</span>
          <span>{{ job.progress }}%</span>
        </div>
        <p v-if="job.status === 'failed'" class="mt-2 text-[11px] text-[#c24b3c] break-words">{{ job.error_message || '解析失败' }}</p>
        <div v-if="job.status === 'failed'" class="mt-2 text-right">
          <el-button size="small" class="!border-[#f8a42b] !text-[#9a5b0b]" :loading="retrying === job.id" @click="retry(job.id)">使用 DeepSeek 重试</el-button>
        </div>
        <div v-else-if="job.status === 'succeeded' && job.draft_id" class="mt-2 text-right">
          <el-button size="small" class="!border-[#f8a42b] !text-[#9a5b0b]" @click="openDraft(job.draft_id)">前往人工核对</el-button>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { UploadFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { parseApi, type ContractParseJob } from '../api/parseApi';

const jobs = ref<ContractParseJob[]>([]);
const router = useRouter();
const retrying = ref<number | null>(null);
const activeJobs = computed(() => jobs.value.filter((job) => job.status === 'queued' || job.status === 'running'));
let timer: ReturnType<typeof setInterval> | undefined;

function displayName(currentFile: string | null | undefined, id: number) {
  const base = String(currentFile || '').split(/[\\/]/).filter(Boolean).pop();
  return base || `合同任务 #${id}`;
}

function statusText(status: ContractParseJob['status']) {
  return ({ queued: '解析中', running: '解析中', succeeded: '待核对', failed: '失败' } as const)[status];
}
function statusClass(status: ContractParseJob['status']) {
  return status === 'failed' ? 'text-[#c24b3c]' : status === 'succeeded' ? 'text-[#9a5b0b]' : 'text-[#c77710]';
}
async function load() {
  try {
    const res = await parseApi.getJobs();
    if (res.code === 200) jobs.value = res.data.list;
  } catch { /* 任务徽标不能影响页面正常使用 */ }
}
async function retry(jobId: number) {
  retrying.value = jobId;
  try {
    const res = await parseApi.retryJob(jobId);
    if (res.code !== 200) throw new Error(res.msg);
    ElMessage.success('已加入 DeepSeek 重试队列');
    await load();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.msg || error?.message || '重试失败');
  } finally { retrying.value = null; }
}
function openDraft(draftId: number) {
  router.push({ path: '/verify', query: { draftId: String(draftId) } });
}
onMounted(() => { load(); timer = setInterval(load, 3000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>
