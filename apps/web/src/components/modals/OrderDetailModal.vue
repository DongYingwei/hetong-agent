<template>
  <el-dialog
    v-model="visible"
    title="订单详情"
    width="820px"
    destroy-on-close
    class="order-detail-dialog"
  >
    <template #header><div class="flex items-center justify-between pr-6"><span>订单详情</span><el-button v-if="!editing" type="primary" link @click="beginEdit">编辑</el-button><div v-else><el-button link @click="editing=false">取消</el-button><el-button type="primary" link :loading="saving" @click="saveEdit">保存</el-button></div></div></template>
    <div v-if="order" class="space-y-5 overflow-y-auto max-h-[70vh] pr-2">
      <div v-if="editing" class="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"><div class="mb-3 text-sm font-medium text-[#049667]">人工编辑（保存为覆盖层，不改写 EPMS 源数据）</div><el-form label-width="90px" class="grid grid-cols-1 md:grid-cols-2 gap-x-4"><el-form-item label="项目名称"><el-input v-model="editForm.project_name" /></el-form-item><el-form-item label="订单名称"><el-input v-model="editForm.order_name" /></el-form-item><el-form-item label="客户名称"><el-input v-model="editForm.customer_name" /></el-form-item><el-form-item label="合同编号"><el-input v-model="editForm.contract_no" /></el-form-item><el-form-item label="考核线"><el-input v-model="editForm.assessment_line" /></el-form-item><el-form-item label="含税金额"><el-input-number v-model="editForm.amount" :min="0" class="w-full" /></el-form-item></el-form></div>
      <!-- 1. 基本信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">基本信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">项目编号</label><div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ order.project_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">项目名称</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.project_name || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">明细项目编号</label><div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ order.detail_project_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">订单编号</label><div class="text-sm text-[#049667] font-medium font-mono mt-0.5">{{ order.order_no || '—' }}</div></div>
          <div><label class="text-xs text-gray-400">客方订单号</label><div class="text-sm text-gray-400 mt-0.5">{{ order.customer_order_no || '—' }}</div></div>
          <div>
            <label class="text-xs text-gray-400">订单名称</label>
            <div class="text-sm text-[#1A1A1A] mt-0.5 flex items-center gap-1.5">
              <span>{{ order.order_name || '—' }}</span>
              <span v-if="order.name_mismatch === 1 || order.name_mismatch === true" class="text-xs text-[#DC2626] bg-red-50 border border-red-100 rounded px-1.5 py-0.5">数据源标记：名称不符</span>
            </div>
          </div>
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
          <div><label class="text-xs text-gray-400">明细税率(%)</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ order.detail_tax_rate ?? order.tax_rate ?? 6 }}%</div></div>
          <div><label class="text-xs text-gray-400">明细含税金额</label><div class="text-sm text-[#1A1A1A] font-semibold mt-0.5">{{ formatCurrency(order.detail_amount ?? order.amount) }}</div></div>
          <div><label class="text-xs text-gray-400">明细不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.detail_amount_ex_tax || order.amount * 0.94) }}</div></div>
        </div>
      </div>

      <!-- 5. 扣款信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">扣款信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">扣款含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.deduct_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">扣款不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.deduct_amount_ex_tax ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">停止开票含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.stop_invoice_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">停止开票不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.stop_invoice_amount_ex_tax ?? 0) }}</div></div>
        </div>
      </div>

      <!-- 6. 收入信息 -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">收入信息</h4>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3">
          <div><label class="text-xs text-gray-400">确认收入含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.confirmed_income_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">确认收入不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.confirmed_income_amount_ex_tax ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">未确认收入含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.unconfirmed_income_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">未确认收入不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.unconfirmed_income_amount_ex_tax ?? 0) }}</div></div>
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
          <div><label class="text-xs text-gray-400">已开票含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.invoiced_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">已开票不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.invoiced_amount_ex_tax ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">已回款含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.returned_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">已回款不含税总额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.returned_amount_ex_tax ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">已开票未回款含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.invoiced_unreturned_amount ?? 0) }}</div></div>
          <div><label class="text-xs text-gray-400">已开票未回款不含税金额</label><div class="text-sm text-[#1A1A1A] mt-0.5">{{ formatCurrency(order.invoiced_unreturned_amount_ex_tax ?? 0) }}</div></div>
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

      <!-- 11. AI关键词解析结果（与 v1.3 原型相同的四模块只读展示） -->
      <div>
        <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">AI关键词解析结果</h4>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="module in aiModules" :key="module.key" class="border border-gray-200 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-[#1A1A1A]">{{ module.name }}</span>
              <span class="tag" :class="moduleHit(module.key) ? 'tag-green' : 'tag-gray'" style="font-size:10px">
                {{ moduleHit(module.key) ? `命中 ${moduleKeywords(module.key).length} 项` : '未命中' }}
              </span>
            </div>
            <div class="text-xs text-gray-400 mb-1.5">{{ module.description }}</div>
            <div v-if="moduleHit(module.key)" class="flex flex-wrap gap-1">
              <span v-for="kw in moduleKeywords(module.key)" :key="kw" class="tag tag-green" style="font-size:11px">{{ kw }}</span>
            </div>
            <div v-else class="text-sm text-gray-400">该板块未识别到AI关键词</div>
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
import { reactive, ref, watch } from 'vue';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { OrderLedger } from '../../types';
import { orderApi } from '../../api';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  order: OrderLedger | null;
}>();

const emit = defineEmits(['update:modelValue', 'updated']);

const visible = ref(false);
const editing = ref(false); const saving = ref(false);
const editForm = reactive<Partial<OrderLedger>>({});
const aiModules = [
  { key: 'role', name: '合同/项目名称', description: '含（合同名称、项目名称）' },
  { key: 'service', name: '合同服务内容', description: '含（项目内容、服务标的、项目交付物）' },
  { key: 'tech', name: '公司技术要求', description: '含（项目技术栈、交付技术标准、公司技术储备、项目技术要求、技术规范）' },
  { key: 'staff', name: '人员需求', description: '含（人员资质、人员技术要求、人员技能要求、岗位需求、岗位说明、岗位要求）' },
];

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});
function beginEdit() { if (!props.order) return; Object.assign(editForm, { project_name: props.order.project_name, order_name: props.order.order_name, customer_name: props.order.customer_name, contract_no: props.order.contract_no, assessment_line: props.order.assessment_line, amount: props.order.amount }); editing.value = true; }
async function saveEdit() { if (!props.order) return; saving.value=true; try { const res=await orderApi.update(props.order.id, editForm); if(res.code!==200) throw new Error(res.msg); Object.assign(props.order, editForm); editing.value=false; emit('updated'); ElMessage.success('订单人工修改已保存'); } catch(e:any) { ElMessage.error(e.message || '保存失败'); } finally { saving.value=false; } }

function moduleHit(key: string) {
  return !!props.order?.module_hits?.some((x) => x.module_key === key && x.hit === 1);
}

function moduleKeywords(key: string): string[] {
  const raw = props.order?.module_hits?.find((x) => x.module_key === key && x.hit === 1)?.keywords;
  return raw ? raw.split(',').filter(Boolean) : ['AI'];
}
</script>

<style scoped>
:deep(.el-dialog__body) {
  padding: 16px 20px;
}
</style>
