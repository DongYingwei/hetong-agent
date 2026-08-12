<template>
  <div v-loading="loading">
    <!-- 面包屑与返回 -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span class="cursor-pointer hover:text-[#049667]" @click="$router.push('/ledger')">合同台账</span>
        <span>/</span>
        <span class="text-gray-800 font-medium">合同详情</span>
      </div>
      <el-button @click="$router.push('/ledger')">
        <el-icon class="mr-1"><Back /></el-icon> 返回台账列表
      </el-button>
    </div>

    <!-- 顶部合同名名牌卡片 -->
    <div class="page-header-card mb-4" v-if="contract">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-[#1A1A1A]">{{ contract.contract_name }}</h1>
            <span class="tag tag-green">{{ dictStore.getLabel('contract_status', contract.contract_status) }}</span>
            <span class="tag tag-blue">{{ dictStore.getLabel('contract_type', contract.contract_type) }}</span>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            合同编号: <span class="font-mono text-gray-800 mr-4">{{ contract.contract_no }}</span>
            客户名称: <span class="font-medium text-gray-800">{{ contract.customer_name }}</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <el-button type="primary" style="background-color: #049667; border-color: #049667;" @click="goToVerify">
            开始 AI 核对
          </el-button>
          <el-button @click="goToCompare">文本比对</el-button>
        </div>
      </div>
    </div>

    <!-- 详情主格布局 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6" v-if="contract">
      <!-- 左侧：基本信息与AI识别分析 (占2列) -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 基本资料 -->
        <div class="content-card">
          <h3 class="text-base font-bold text-[#1A1A1A] mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <el-icon class="text-[#049667]"><InfoFilled /></el-icon> 合同基本属性
          </h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><span class="text-gray-400">签约时间:</span> <span class="font-medium text-gray-700 ml-2">{{ formatDate(contract.sign_date) }}</span></div>
            <div><span class="text-gray-400">合同金额(含税):</span> <span class="font-bold text-[#049667] ml-2">{{ formatCurrency(contract.amount) }}</span></div>
            <div><span class="text-gray-400">考核线:</span> <span class="font-medium text-gray-700 ml-2">{{ contract.assessment_line }}</span></div>
            <div><span class="text-gray-400">AI关键词识别:</span> <span class="tag tag-green ml-2">{{ contract.has_ai_keyword === 1 ? '已识别包含' : '未包含' }}</span></div>
            <div><span class="text-gray-400">核对状态:</span> <span class="tag tag-orange ml-2">{{ dictStore.getLabel('verify_status', contract.verify_status) }}</span></div>
            <div><span class="text-gray-400">创建时间:</span> <span class="font-medium text-gray-700 ml-2">{{ formatDate(contract.create_time) }}</span></div>
          </div>
        </div>

        <!-- AI 核心条款提取 -->
        <div class="content-card">
          <h3 class="text-base font-bold text-[#1A1A1A] mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <el-icon class="text-[#049667]"><Cpu /></el-icon> AI 智能识别摘要条款
          </h3>
          <div class="space-y-3 text-sm">
            <div class="p-3 bg-green-50/50 rounded-lg border border-green-100">
              <div class="font-semibold text-[#049667] mb-1">【算力服务与SLA指标约定】</div>
              <p class="text-gray-600">约定服务可用性率需达到 99.9%，故障修复时间不得超过 2 小时，按月进行绩效指标考核。</p>
            </div>
            <div class="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
              <div class="font-semibold text-blue-700 mb-1">【数据保密与合规】</div>
              <p class="text-gray-600">双方应严格遵循《数据安全法》，所有运行数据及用户敏感信息需进行脱敏隔离。</p>
            </div>
            <div class="p-3 bg-orange-50/50 rounded-lg border border-orange-100">
              <div class="font-semibold text-amber-700 mb-1">【违约与索赔上限】</div>
              <p class="text-gray-600">任何一方违约赔偿金额总计不超过合同累计已支付金额的 10%。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：履约历史记录时间轴 (占1列) -->
      <div class="space-y-6">
        <div class="content-card">
          <h3 class="text-base font-bold text-[#1A1A1A] mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <el-icon class="text-[#049667]"><Clock /></el-icon> 履约与操作记录
          </h3>
          <el-timeline>
            <el-timeline-item
              v-for="item in historyList"
              :key="item.id"
              :timestamp="formatDate(item.create_time)"
              type="primary"
            >
              <div class="font-medium text-sm text-gray-800">{{ item.action_type }}</div>
              <div class="text-xs text-gray-500 mt-1">操作人: {{ item.operator_name }}</div>
              <div class="text-xs text-gray-600 mt-1" v-if="item.remark">{{ item.remark }}</div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Back, InfoFilled, Cpu, Clock } from '@element-plus/icons-vue';
import { contractApi } from '../api';
import { useDictStore } from '../stores/dictStore';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { ContractLedger } from '../types';

const route = useRoute();
const router = useRouter();
const dictStore = useDictStore();

const loading = ref(false);
const contract = ref<ContractLedger | null>(null);
const historyList = ref<any[]>([]);

onMounted(() => {
  const id = Number(route.params.id);
  if (id) {
    loadDetail(id);
  }
});

async function loadDetail(id: number) {
  loading.value = true;
  try {
    const res = await contractApi.getDetail(id);
    if (res.code === 200) {
      contract.value = res.data.contract;
      historyList.value = res.data.history || [];
    }
  } finally {
    loading.value = false;
  }
}

function goToVerify() {
  if (contract.value) {
    router.push(`/verify?id=${contract.value.id}`);
  }
}

function goToCompare() {
  if (contract.value) {
    router.push(`/compare?id=${contract.value.id}`);
  }
}
</script>
