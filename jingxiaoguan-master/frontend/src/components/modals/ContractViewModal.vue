<template>
  <el-dialog
    v-model="visible"
    title="合同核对信息"
    width="680px"
    :max-height="'85vh'"
    destroy-on-close
    class="contract-view-dialog"
  >
    <div v-if="contractData" class="space-y-5 overflow-y-auto" style="max-height: calc(85vh - 160px);">

      <!-- ① 合同信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">合同信息</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label class="text-xs text-gray-400">合同号</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5 font-medium text-[#049667]">{{ contractData.contract_no }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">客户</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.customer_name || '—' }}</div>
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-400">合同名</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.contract_name }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">类型</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ dictStore.getLabel('contract_type', contractData.contract_type) }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">考核线</label>
            <div class="text-sm text-gray-500 mt-0.5">{{ contractData.assessment_line || '—' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">合同期</label>
            <div class="text-sm text-gray-500 mt-0.5">—</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">归属地</label>
            <div class="text-sm text-gray-500 mt-0.5">—</div>
          </div>
        </div>
      </div>

      <!-- ② 合同-主要信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">合同-主要信息</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label class="text-xs text-gray-400">对方合同号</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.customer_contract_no || '—' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">签约方</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.signing_party || '—' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">合同类型</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ dictStore.getLabel('contract_type', contractData.contract_type) }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">签约时间</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(contractData.sign_date) }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">起始时间</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(contractData.start_date) || '—' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">终止时间</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(contractData.end_date) || '—' }}</div>
          </div>
        </div>
      </div>

      <!-- ③ 合同-金额 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">合同-金额</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label class="text-xs text-gray-400">价格方式</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.price_type || '固定' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">合同金额（含税）</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5 font-semibold">{{ formatCurrency(contractData.amount) }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">税率</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.tax_rate ? contractData.tax_rate + '%' : '—' }}</div>
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-400">付款条件</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.payment_terms || '—' }}</div>
          </div>
        </div>
      </div>

      <!-- ④ 合同-其他 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">合同-其他</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label class="text-xs text-gray-400">是否涉及担保</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.has_guarantee ? '是' : '否' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">履约证金</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.performance_bond ? formatCurrency(contractData.performance_bond) : '—' }}</div>
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-400">履约证金返还</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.bond_return_rule || '—' }}</div>
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-400">纠纷解决方式</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.dispute_method || '协商解决，提交仲裁委员会仲裁' }}</div>
          </div>
          <div>
            <label class="text-xs text-gray-400">管辖权</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractData.jurisdiction || '—' }}</div>
          </div>
        </div>
      </div>

      <!-- ⑤ 审管 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">审管</h4>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label class="text-xs text-gray-400">合同状态</label>
            <div class="text-sm mt-0.5">
              <span class="tag tag-green">{{ dictStore.getLabel('contract_status', contractData.contract_status) }}</span>
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-400">合同到期预警</label>
            <div class="text-sm mt-0.5">
              <span v-if="!contractData.warning_status || contractData.warning_status === 0" class="text-gray-400 text-xs">无预警</span>
              <span v-else-if="contractData.warning_status === 1" class="tag tag-blue">到期前4个月</span>
              <span v-else-if="contractData.warning_status === 2" class="tag tag-orange">到期前3个月</span>
              <span v-else-if="contractData.warning_status === 3" class="tag" style="color: #d97706; background-color: #fef3c7;">到期前2个月</span>
              <span v-else-if="contractData.warning_status === 4" class="tag tag-red">到期前1个月</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ⑥ AI关键识别（4列Grid卡片，1:1还原demo2.html） -->
      <div v-if="aiKeywords && aiKeywords.length > 0">
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">AI关键识别</h4>
        <div class="grid grid-cols-4 gap-2">
          <div
            v-for="(section, idx) in aiKeywords"
            :key="idx"
            class="border border-gray-200 rounded-lg p-2"
          >
            <div class="text-xs text-gray-400 mb-1">{{ section.title }}</div>
            <div v-if="section.tags && section.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="(tag, tIdx) in section.tags"
                :key="tIdx"
                class="tag tag-green"
                style="font-size: 11px;"
              >
                {{ tag }}
              </span>
            </div>
            <div v-else class="text-xs text-gray-400 mt-1">未检测</div>
          </div>
        </div>
      </div>

      <!-- AI关键识别默认展示（当无具体数据时显示默认4格） -->
      <div v-else>
        <h4 class="text-xs font-semibold text-gray-400 mb-2.5 pb-1.5 border-b border-gray-100">AI关键识别</h4>
        <div class="grid grid-cols-4 gap-2">
          <div class="border border-gray-200 rounded-lg p-2">
            <div class="text-xs text-gray-400 mb-1">服务</div>
            <div class="text-xs text-gray-400 mt-1">未检测</div>
          </div>
          <div class="border border-gray-200 rounded-lg p-2">
            <div class="text-xs text-gray-400 mb-1">技术要求</div>
            <div class="text-xs text-gray-400 mt-1">未检测</div>
          </div>
          <div class="border border-gray-200 rounded-lg p-2">
            <div class="text-xs text-gray-400 mb-1">岗位说明</div>
            <div class="text-xs text-gray-400 mt-1">未检测</div>
          </div>
          <div class="border border-gray-200 rounded-lg p-2">
            <div class="text-xs text-gray-400 mb-1">人员</div>
            <div class="text-xs text-gray-400 mt-1">未检测</div>
          </div>
        </div>
      </div>

    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="visible = false">关闭</el-button>
        <el-button
          type="primary"
          style="background-color: #049667; border-color: #049667;"
          @click="handleGoEdit"
        >
          编辑
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDictStore } from '../../stores/dictStore';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { ContractLedger } from '../../types';

const props = defineProps<{
  modelValue: boolean;
  contractData: ContractLedger | null;
}>();

const emit = defineEmits(['update:modelValue', 'edit']);

const dictStore = useDictStore();
const visible = ref(false);

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

// 构建AI关键识别数据（从合同数据解析，或展示默认结构）
const aiKeywords = computed(() => {
  const d = props.contractData as any;
  if (!d) return [];

  // 尝试从 ai_keywords 字段解析（JSON字符串或已解析对象）
  let parsed: any = null;
  if (d.ai_keywords) {
    try {
      parsed = typeof d.ai_keywords === 'string' ? JSON.parse(d.ai_keywords) : d.ai_keywords;
    } catch (e) {}
  }

  if (parsed && Array.isArray(parsed)) return parsed;

  // 从关键词字段构建默认4格
  const sections = [
    { title: '服务', tags: d.service_keywords ? (Array.isArray(d.service_keywords) ? d.service_keywords : [d.service_keywords]) : [] },
    { title: '技术要求', tags: d.tech_keywords ? (Array.isArray(d.tech_keywords) ? d.tech_keywords : [d.tech_keywords]) : [] },
    { title: '岗位说明', tags: d.position_keywords ? (Array.isArray(d.position_keywords) ? d.position_keywords : [d.position_keywords]) : [] },
    { title: '人员', tags: d.personnel_keywords ? (Array.isArray(d.personnel_keywords) ? d.personnel_keywords : [d.personnel_keywords]) : [] },
  ];

  const hasAny = sections.some(s => s.tags.length > 0);
  return hasAny ? sections : [];
});

function handleGoEdit() {
  emit('edit', props.contractData);
  visible.value = false;
}
</script>

<style scoped>
:deep(.el-dialog__body) {
  padding: 16px 20px;
}
</style>
