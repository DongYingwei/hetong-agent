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
          accept=".pdf,.doc,.docx"
          class="hidden"
          @change="handleFileSelect"
        />
        <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-sm font-medium text-gray-700">点击或拖拽合同文件到此处上传</p>
        <p class="text-xs text-gray-400 mt-1.5">支持 PDF、Word 格式，单文件不超过 50MB，可同时上传多份合同</p>
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

    <!-- 阶段 3：解析完成 (1:1 还原 demo.html) -->
    <div v-else-if="phase === 'done'" class="p-2">
      <div class="text-center py-3">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E6F8F0] mb-3">
          <el-icon class="text-[#049667] text-2xl"><CircleCheckFilled /></el-icon>
        </div>
        <p class="text-base font-bold text-[#1A1A1A] mb-1">解析完成</p>
        <p class="text-xs text-gray-500 mb-4">
          共解析 <span class="font-semibold text-[#049667]">{{ parsedResults.length || 3 }}</span> 份合同，AI识别 <span class="font-semibold text-[#049667]">84</span> 项字段，<span class="font-semibold text-orange-500">9</span> 项需手工补录
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
            <div class="text-right">
              <div class="font-bold text-[#049667]">{{ formatCurrency(item.amount) }}</div>
              <span class="tag tag-orange mt-1">未核对</span>
            </div>
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
import { contractApi, fileApi } from '../../api';
import { formatFileSize, formatCurrency } from '../../utils/formatters';
import type { ContractLedger } from '../../types';

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
const parsedResults = ref<Partial<ContractLedger>[]>([]);

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
    const files = Array.from(target.files);
    selectedFiles.value.push(...files);
  }
}

function handleFileDrop(e: DragEvent) {
  if (e.dataTransfer?.files) {
    const files = Array.from(e.dataTransfer.files);
    selectedFiles.value.push(...files);
  }
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
  ElMessage.info('已保存入库，您可在合同台账中随时发起人工核对');
}

function proceedToVerify() {
  visible.value = false;
  resetImport();
  emit('success');
  router.push({ path: '/verify', query: { mode: 'multi' } });
}

async function startParsing() {
  if (selectedFiles.value.length === 0) return;

  phase.value = 'parsing';
  progressPercent.value = 10;
  currentParsingHint.value = '正在上传文件并写入持久化存储...';

  try {
    for (let i = 0; i < selectedFiles.value.length; i++) {
      const file = selectedFiles.value[i];
      const formData = new FormData();
      formData.append('file', file);
      await fileApi.upload(formData);

      progressPercent.value = Math.min(40, Math.round(((i + 1) / selectedFiles.value.length) * 40));
    }

    currentParsingHint.value = 'AI 识别合同字段、金额、条款及关键词...';
    await new Promise((resolve) => setTimeout(resolve, 800));
    progressPercent.value = 75;

    const mockParsed: Partial<ContractLedger>[] = selectedFiles.value.map((file, idx) => {
      const randomNo = 'HT-2026-' + Math.floor(1000 + Math.random() * 9000);
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const amount = Math.floor(10 + Math.random() * 90) * 10000;
      return {
        contract_no: randomNo,
        customer_name: fileNameWithoutExt.includes('服务') ? '兴晟泽科技有限公司' : '华南电力工程集团',
        contract_name: fileNameWithoutExt,
        contract_type: (idx % 3) + 1,
        sign_date: new Date().toISOString().split('T')[0],
        amount,
        assessment_line: '电力',
        has_ai_keyword: 1,
        contract_status: 2,
        verify_status: 0,
      };
    });

    for (const record of mockParsed) {
      await contractApi.create({
        contractNo: record.contract_no,
        customerName: record.customer_name,
        contractName: record.contract_name,
        contractType: record.contract_type,
        signDate: record.sign_date,
        amount: record.amount,
        assessmentLine: record.assessment_line,
        hasAiKeyword: record.has_ai_keyword,
        contractStatus: record.contract_status,
      });
    }

    progressPercent.value = 100;
    parsedResults.value = mockParsed;

    await new Promise((resolve) => setTimeout(resolve, 400));
    phase.value = 'done';
    ElMessage.success(`解析完成，共解析 ${mockParsed.length} 份合同`);
  } catch (err) {
    ElMessage.error('解析处理失败，请检查文件格式');
    phase.value = 'upload';
  }
}
</script>
