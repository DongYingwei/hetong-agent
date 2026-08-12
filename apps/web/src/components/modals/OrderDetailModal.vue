<template>
  <el-dialog
    v-model="visible"
    title="订单详情"
    width="820px"
    destroy-on-close
    class="order-detail-dialog"
  >
    <div v-if="order" class="space-y-5 overflow-y-auto max-h-[70vh] pr-2">
      <!-- 1. 基本信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">基本信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">项目编号</label><div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ order.project_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">项目名称</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.project_name || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">明细项目编号</label><div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ order.detail_project_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单编号</label><div class="text-sm text-[#049667] font-medium font-mono mt-0.5">{{ order.order_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方订单号</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_order_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单名称</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.order_name || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">合同编号</label><div class="text-sm text-gray-400 mt-0.5">{{ order.contract_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客户名称</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.customer_name || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">考核线</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.assessment_line || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客户线</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.customer_line || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客户类型</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_type || '无' }}</div></div>
          <div><label class="text-xs text-gray-400">结算方式</label><div class="text-sm text-gray-400 mt-0.5">{{ order.settlement_type || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单类型</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.order_type || 'ARP' }}</div></div>
          <div><label class="text-xs text-gray-400">订单属性</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.order_attr || 'JS' }}</div></div>
          <div><label class="text-xs text-gray-400">业务员</label><div class="text-sm text-gray-400 mt-0.5">{{ order.salesperson || '—' }}</div></div>
        </div>
      </div>

      <!-- 2. 客方信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">客方信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">客方合同编号</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_contract_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方服务对象</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_service_target || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方项目经理</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_pm || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方订单名称</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_order_name || '—' }}</div></div>
        </div>
      </div>

      <!-- 3. 日期信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">日期信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">生成日期</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(order.created_date) || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">接受日期</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(order.accepted_date) || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单开始日期</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(order.start_date) || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单结束日期</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(order.end_date) || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">预计开票日期</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatDate(order.est_invoice_date) || '—' }}</div></div>
        </div>
      </div>

      <!-- 4. 订单金额 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">订单金额</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">订单状态</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.order_status || '执行中' }}</div></div>
          <div><label class="text-xs text-gray-400">订单税率(%)</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.tax_rate ?? 6 }}%</div></div>
          <div><label class="text-xs text-gray-400">订单含税总额</label><div class="text-sm text-[#1A1A1A] font-semibold mt-0.5">{{ formatCurrency(order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">订单不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount_ex_tax || order.amount * 0.94) }}</div></div>
          <div><label class="text-xs text-gray-400">订单明细单号</label><div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ order.detail_order_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方订单明细单号</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_detail_order_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">赎期(天)</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.redemption_days ?? 0 }}</div></div>
          <div><label class="text-xs text-gray-400">是否末单</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.is_last_order || '否' }}</div></div>
          <div><label class="text-xs text-gray-400">明细税率(%)</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.tax_rate ?? 6 }}%</div></div>
          <div><label class="text-xs text-gray-400">明细含税金额</label><div class="text-sm text-[#1A1A1A] font-semibold mt-0.5">{{ formatCurrency(order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">明细不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.detail_amount_ex_tax || order.amount * 0.94) }}</div></div>
        </div>
      </div>

      <!-- 5. 扣款信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">扣款信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">扣款含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">扣款不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">停止开票含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">停止开票不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
        </div>
      </div>

      <!-- 6. 收入信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">收入信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">确认收入含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">确认收入不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">未确认收入含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">未确认收入不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount * 0.94) }}</div></div>
          <div>
            <label class="text-xs text-gray-400">收入确认标记</label>
            <div class="text-sm mt-0.5">
              <span class="tag" :class="order.income_confirmed === 1 ? 'tag-green' : 'tag-orange'">
                {{ order.income_confirmed === 1 ? '已确认' : '未确认' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 7. 开票回款 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">开票回款</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">已开票含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">已开票不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount * 0.94) }}</div></div>
          <div><label class="text-xs text-gray-400">已回款含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">已回款不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">¥0.00</div></div>
          <div><label class="text-xs text-gray-400">已开票未回款含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">已开票未回款不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.amount * 0.94) }}</div></div>
        </div>
      </div>

      <!-- 8. 其他信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">其他信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">区域</label><div class="text-sm text-gray-400 mt-0.5">{{ order.region || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">省份</label><div class="text-sm text-gray-400 mt-0.5">{{ order.province || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">地市</label><div class="text-sm text-gray-400 mt-0.5">{{ order.city || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">交付人员名单</label><div class="text-sm text-gray-400 mt-0.5">{{ order.delivery_list || '—' }}</div></div>
        </div>
      </div>

      <!-- 9. 附件信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">附件信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">附件</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.has_attachment || '有' }}</div></div>
          <div><label class="text-xs text-gray-400">最新附件上传时间</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.latest_attachment_time || '2026-07-23 14:56:03' }}</div></div>
          <div><label class="text-xs text-gray-400">附件数量</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.attachment_count || 3 }}</div></div>
          <div><label class="text-xs text-gray-400">含eml附件</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.has_eml || '是' }}</div></div>
        </div>
      </div>

      <!-- 10. 制单信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">制单信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">制单人</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.maker || '陈心瑜B' }}</div></div>
          <div><label class="text-xs text-gray-400">制单时间</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.make_time || '2026-07-23 14:55:38' }}</div></div>
          <div><label class="text-xs text-gray-400">明细制单人</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.detail_maker || '陈心瑜B' }}</div></div>
          <div><label class="text-xs text-gray-400">明细制单时间</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.detail_make_time || '2026-07-23 14:55:38' }}</div></div>
          <div><label class="text-xs text-gray-400">更新人</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.updater || '陈心瑜B' }}</div></div>
          <div><label class="text-xs text-gray-400">更新时间</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.update_time || '2026-07-23 14:56:08' }}</div></div>
          <div><label class="text-xs text-gray-400">审核人</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.auditor || '陈心瑜B' }}</div></div>
          <div><label class="text-xs text-gray-400">审核时间</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.audit_time || '2026-07-23 14:56:08' }}</div></div>
        </div>
      </div>

      <!-- 11. AI关键词解析结果 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">AI关键词解析结果</h4>
        <div class="border border-gray-200 rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-[#1A1A1A]">AI</span>
              <span class="text-xs text-gray-400">支持手动添加/删除关键词</span>
            </div>
            <span class="tag tag-green" style="font-size:10px">命中</span>
          </div>
          <div class="flex flex-wrap gap-1.5 items-center">
            <span
              v-for="(kw, kIdx) in currentKeywords"
              :key="kIdx"
              class="tag tag-green inline-flex items-center gap-1"
              style="font-size:11px"
            >
              {{ kw }}
              <el-icon
                class="cursor-pointer text-green-600 hover:text-red-500 text-xs"
                @click="removeKeyword(kIdx)"
              >
                <Close />
              </el-icon>
            </span>
            <el-input
              v-if="showAddKwInput"
              v-model="newKwValue"
              size="small"
              style="width: 100px"
              placeholder="按回车添加"
              @keyup.enter="confirmAddKeyword"
              @blur="confirmAddKeyword"
            />
            <button
              v-else
              class="inline-flex items-center gap-0.5 text-xs text-[#049667] hover:text-[#037c55] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-transparent cursor-pointer"
              @click="showAddKwInput = true"
            >
              + 添加
            </button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { orderApi } from '../../api';
import type { OrderLedger } from '../../types';

const props = defineProps<{
  modelValue: boolean;
  order: OrderLedger | null;
}>();

const emit = defineEmits(['update:modelValue', 'updated']);

const visible = ref(false);
const currentKeywords = ref<string[]>([]);
const showAddKwInput = ref(false);
const newKwValue = ref('');

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.order, (val) => {
  if (val) {
    if (Array.isArray(val.ai_keywords)) {
      currentKeywords.value = [...val.ai_keywords];
    } else if (val.hit_keyword) {
      currentKeywords.value = val.hit_keyword.split(',').filter(Boolean);
    } else {
      currentKeywords.value = ['AI'];
    }
  }
}, { immediate: true });

function removeKeyword(idx: number) {
  currentKeywords.value.splice(idx, 1);
  saveKeywords();
}

function confirmAddKeyword() {
  const val = newKwValue.value.trim();
  if (val && !currentKeywords.value.includes(val)) {
    currentKeywords.value.push(val);
    saveKeywords();
  }
  newKwValue.value = '';
  showAddKwInput.value = false;
}

async function saveKeywords() {
  if (props.order?.id) {
    try {
      await orderApi.updateKeywords(props.order.id, currentKeywords.value);
      ElMessage.success('AI 关键词调整已保存');
      emit('updated');
    } catch (e) {}
  }
}
</script>

<style scoped>
:deep(.el-dialog__body) {
  padding: 16px 20px;
}
</style>
