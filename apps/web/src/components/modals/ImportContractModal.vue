<template>
  <el-dialog
    v-model="visible"
    title="导入合同"
    width="560px"
    destroy-on-close
    :close-on-click-modal="false"
    @closed="resetImport"
  >
    <!-- 阶段 1：文件上传 (1:1 还原 demo.html) -->
    <div v-if="phase === 'upload'" class="p-2">
      <div
        class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-[#049667] hover:bg-[#FAFFFC]"
        @click="triggerFileSelect"
        @dragover.prevent
        @drop.prevent="handleFileDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.zip"
          class="hidden"
          @change="handleFileSelect"
        />
        <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-sm font-medium text-gray-700">选择单合同文件、多个附件或合同 ZIP 包</p>
        <p class="text-xs text-gray-400 mt-1.5">可多次点击追加附件；同一组文件只生成一份合同草稿；单文件不超过 500MB</p>
      </div>

      <!-- 已选择待解析的文件列表 -->
      <div v-if="selectedFiles.length > 0" class="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
        <div class="text-xs font-semibold text-gray-500 mb-1">待解析合同文件 ({{ selectedFiles.length }})</div>
        <div
          v-for="(file, index) in selectedFiles"
          :key="index"
          class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-700"
        >
          <div class="flex items-center gap-2 truncate">
            <el-icon class="text-[#049667] text-base"><Document /></el-icon>
            <span class="truncate font-medium">{{ file.name }}</span>
            <span class="text-gray-400">({{ formatFileSize(file.size) }})</span>
          </div>
          <el-icon class="text-gray-400 hover:text-red-500 cursor-pointer" @click="removeFile(index)">
            <Delete />
          </el-icon>
        </div>
      </div>
      <p class="mt-4 text-xs text-gray-400">为避免超长合同解析超时，系统默认仅识别前 50 页；原始文件仍完整保存。</p>
    </div>

    <!-- 阶段 2：AI 智能解析进度 -->
    <div v-else-if="phase === 'parsing'" class="py-8 px-4 text-center">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#E6F8F0] mb-4">
        <el-icon class="is-loading text-[#049667] text-3xl"><Loading /></el-icon>
      </div>
      <p class="text-base font-bold text-[#1A1A1A] mb-1">AI 正在解析合同内容</p>
      <p class="text-xs text-gray-500 mb-6">正在识别合同字段、金额、条款及关键词...</p>

      <div class="w-full max-w-[380px] mx-auto">
        <el-progress :percentage="progressPercent" :color="'#049667'" :stroke-width="8" />
        <div class="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>{{ currentParsingHint }}</span>
          <span class="font-medium text-[#049667]">{{ progressPercent }}%</span>
        </div>
      </div>
    </div>

    <!-- 阶段 3：解析完成（真实草稿） -->
    <div v-else-if="phase === 'done'" class="p-2">
      <div class="text-center py-3">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E6F8F0] mb-3">
          <el-icon class="text-[#049667] text-2xl"><CircleCheckFilled /></el-icon>
        </div>
        <p class="text-base font-bold text-[#1A1A1A] mb-1">解析完成</p>
        <p class="text-xs text-gray-500 mb-4">
          共解析 <span class="font-semibold text-[#049667]">{{ parsedResults.length }}</span> 份合同，已入草稿待人工核对
        </p>
      </div>

      <!-- 解析结果列表 -->
      <div class="border border-gray-200 rounded-xl overflow-hidden mb-2 max-h-56 overflow-y-auto">
        <div class="bg-gray-50 px-4 py-2 text-xs text-gray-500 font-semibold border-b border-gray-200">
          解析结果
        </div>
        <div class="divide-y divide-gray-100">
          <div
            v-for="(item, idx) in parsedResults"
            :key="idx"
            class="p-3 text-xs flex items-center justify-between bg-white hover:bg-gray-50/80"
          >
            <div>
              <div class="font-bold text-[#1A1A1A]">{{ item.contract_name }}</div>
              <div class="text-gray-400 text-[11px] mt-0.5">
                编号: <span class="font-mono text-gray-700">{{ item.contract_no }}</span> ·
                客户: <span class="text-gray-700">{{ item.customer_name }}</span>
              </div>
            </div>
            <span class="tag tag-orange">待核对</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部按钮区 (1:1 还原 demo.html 按钮文字与逻辑) -->
    <template #footer>
      <div class="dialog-footer flex justify-end gap-2">
        <!-- 阶段1 按钮 -->
        <template v-if="phase === 'upload'">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            style="background-color: #049667; border-color: #049667;"
            :disabled="selectedFiles.length === 0"
            @click="startParsing"
          >
            <el-icon class="mr-1"><Cpu /></el-icon> 开始 AI 解析
          </el-button>
        </template>

        <!-- 阶段2 按钮 -->
        <template v-else-if="phase === 'parsing'">
          <el-button disabled>解析处理中...</el-button>
        </template>

        <!-- 阶段3 按钮 (1:1 还原 demo.html 的 稍后核对 / 继续导入 / 前往人工核对) -->
        <template v-else-if="phase === 'done'">
          <el-button @click="verifyLater">
            <el-icon class="mr-1"><Clock /></el-icon> 稍后核对
          </el-button>
          <el-button @click="resetImport">
            <el-icon class="mr-1"><Plus /></el-icon> 继续导入
          </el-button>
          <el-button
            type="primary"
            style="background-color: #049667; border-color: #049667;"
            @click="proceedToVerify"
          >
            前往人工核对
            <el-icon class="ml-1"><Right /></el-icon>
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Document, Delete, Loading, CircleCheckFilled, Cpu, Clock, Plus, Right } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { parseApi, type DraftForm } from '../../api';
import { formatFileSize } from '../../utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const router = useRouter();
const visible = ref(false);
const phase = ref<'upload' | 'parsing' | 'done'>('upload');
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFiles = ref<File[]>([]);

const progressPercent = ref(0);
const currentParsingHint = ref('');
// 真实解析出的草稿（parseApi.upload → draft_id + 抽取字段），供「解析完成」阶段展示与跳转。
interface ParsedDraft {
  draft_id: number;
  contract_name: string;
  contract_no: string;
  customer_name: string;
}
const parsedResults = ref<ParsedDraft[]>([]);

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

function triggerFileSelect() {
  fileInputRef.value?.click();
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    selectContractFiles(Array.from(target.files));
    // 清空后可重复选择同一个文件。
    target.value = '';
  }
}

function handleFileDrop(e: DragEvent) {
  if (e.dataTransfer?.files) {
    selectContractFiles(Array.from(e.dataTransfer.files));
  }
}

function selectContractFiles(files: File[]) {
  if (files.some((file) => file.size > 500 * 1024 * 1024)) {
    ElMessage.error('单个合同文件不能超过 500MB');
    return;
  }
  if (files.some((file) => !/\.(pdf|doc|docx|zip)$/i.test(file.name))) {
    ElMessage.error('仅支持 PDF、DOC、DOCX 或 ZIP 格式的合同文件');
    return;
  }
  // 用户可能先选择主合同、再追加扫描件/补充协议；不能用后一次选择覆盖前一次。
  // 同一浏览器会话中的文件以名称、大小、最后修改时间作稳定去重。
  const existing = new Set(selectedFiles.value.map(fileKey));
  const additions = files.filter((file) => !existing.has(fileKey(file)));
  selectedFiles.value.push(...additions);
  if (additions.length < files.length) ElMessage.info('已忽略重复选择的附件');
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1);
}

function resetImport() {
  phase.value = 'upload';
  selectedFiles.value = [];
  progressPercent.value = 0;
  parsedResults.value = [];
  currentParsingHint.value = '';
}

function verifyLater() {
  visible.value = false;
  resetImport();
  emit('success');
  ElMessage.info('草稿已保留，可在文件管理中重新上传并核对');
}

function proceedToVerify() {
  const first = parsedResults.value[0];
  visible.value = false;
  resetImport();
  if (first) {
    // 真实草稿 → 跳转草稿核对页（?draftId=N），不再是 demo 的多合同 mock。
    router.push({ path: '/verify', query: { draftId: first.draft_id } });
  } else {
    emit('success');
    ElMessage.warning('没有可核对的草稿');
  }
}

async function startParsing() {
  if (selectedFiles.value.length === 0) return;

  phase.value = 'parsing';
  progressPercent.value = 5;
  currentParsingHint.value = '正在上传文件...';

  try {
    const formData = new FormData();
    selectedFiles.value.forEach((file) => formData.append('files', file));
    currentParsingHint.value = `正在解析 ${selectedFiles.value.length} 个合同附件（MinerU + LLM，大文件可能数分钟）...`;
    const res = await parseApi.uploadPackage(formData);
    if (res.code !== 200) throw new Error(res.msg || '合同包解析失败');
    // 重复上传已核对合同不会生成草稿；这不是解析失败，应明确告知用户。
    if (!res.data?.draft_id) {
      if (res.data?.contract_id) {
        ElMessage.info('该合同已存在且已核对，无需重复导入');
        visible.value = false;
        emit('success');
        return;
      }
      throw new Error(res.msg || '合同包未生成可核对草稿');
    }
    const f = (res.data.draft?.form ?? {}) as DraftForm;
    parsedResults.value = [{
      draft_id: res.data.draft_id,
      contract_name: f.contract_name || selectedFiles.value[0]?.name.replace(/\.[^/.]+$/, '') || '待填写',
      contract_no: f.contract_no || '待填写',
      customer_name: f.customer_name || '',
    }];
    progressPercent.value = 100;
    phase.value = 'done';
    ElMessage.success(res.data.status === 'skipped_duplicate'
      ? '合同附件已存在，已打开原草稿待核对'
      : '合同包解析完成，已生成一份草稿待人工核对');
  } catch (err: any) {
    ElMessage.error(`解析失败：${err?.response?.data?.msg || err?.message || '未知错误'}`);
    phase.value = 'upload';
  }
}
</script>
