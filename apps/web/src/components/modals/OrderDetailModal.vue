<template>
  <el-dialog v-model="visible" title="订单详情" width="820px" destroy-on-close class="order-detail-dialog">
    <template #header>
      <div class="flex items-center justify-between pr-6">
        <span>订单详情</span>
        <div>
          <el-button link @click="visible = false">取消</el-button>
          <el-button type="primary" link :loading="saving" @click="saveEdit">保存</el-button>
        </div>
      </div>
    </template>

    <div v-if="order" class="space-y-4 overflow-y-auto max-h-[70vh] pr-2">
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p class="mb-3 text-xs text-gray-500">保存后，列表、综合检索、统计与导出均以修改后的订单数据为准。</p>
        <el-collapse v-model="editingSections">
          <el-collapse-item v-for="section in editableSections" :key="section.name" :name="section.name" :title="section.name">
            <el-form label-width="118px" class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <el-form-item v-for="field in section.fields" :key="field.key" :label="field.label">
                <el-date-picker v-if="field.kind === 'date'" v-model="editForm[field.key]" type="date" value-format="YYYY-MM-DD" class="w-full" clearable />
                <el-input v-else-if="field.kind === 'number'" v-model="editForm[field.key]" inputmode="decimal" clearable />
                <el-select v-else-if="field.kind === 'income'" v-model="editForm[field.key]" class="w-full">
                  <el-option label="未确认" :value="0" />
                  <el-option label="已确认" :value="1" />
                </el-select>
                <el-input v-else v-model="editForm[field.key]" clearable />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div class="mb-3 text-sm font-medium text-[#303133]">AI关键词解析结果</div>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="module in aiModules" :key="module.key" class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="mb-1 text-sm font-medium text-[#1A1A1A]">{{ module.name }}</div>
            <div class="mb-2 text-xs text-gray-400">{{ module.description }}</div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span v-for="keyword in (editModuleKeywords[module.key] || [])" :key="keyword" class="tag tag-green inline-flex items-center gap-1" style="font-size: 11px">
                {{ keyword }}
                <el-icon class="cursor-pointer hover:text-red-500" @click="removeModuleKeyword(module.key, keyword)"><Close /></el-icon>
              </span>
              <el-select v-model="moduleKeywordSelection[module.key]" size="small" filterable clearable placeholder="选择关键词" class="w-32" @change="addModuleKeyword(module.key)">
                <el-option v-for="item in availableKeywords" :key="item.id" :label="item.keyword_name" :value="item.keyword_name" :disabled="(editModuleKeywords[module.key] || []).includes(item.keyword_name)" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { OrderLedger } from '../../types';
import { keywordApi, orderApi } from '../../api';
import { ElMessage } from 'element-plus';
import { Close } from '@element-plus/icons-vue';

const props = defineProps<{ modelValue: boolean; order: OrderLedger | null }>();
const emit = defineEmits(['update:modelValue', 'updated']);
const visible = ref(false);
const saving = ref(false);
type FieldKind = 'text' | 'date' | 'number' | 'income';
type EditableField = { key: string; label: string; kind?: FieldKind; precision?: number };
const editableSections: Array<{ name: string; fields: EditableField[] }> = [
  { name: '基本信息', fields: [
    { key: 'project_no', label: '项目编号' }, { key: 'project_name', label: '项目名称' }, { key: 'detail_project_no', label: '明细项目编号' }, { key: 'order_no', label: '订单编号' },
    { key: 'customer_order_no', label: '客方订单号' }, { key: 'order_name', label: '订单名称' }, { key: 'contract_no', label: '合同编号' }, { key: 'customer_name', label: '客户名称' },
    { key: 'assessment_line', label: '考核线' }, { key: 'customer_line', label: '客户线' }, { key: 'customer_type', label: '客户类型' }, { key: 'settlement_type', label: '结算方式' },
    { key: 'order_type', label: '订单类型' }, { key: 'order_attr', label: '订单属性' }, { key: 'salesperson', label: '业务员' },
  ] },
  { name: '客方与日期信息', fields: [
    { key: 'customer_contract_no', label: '客方合同编号' }, { key: 'customer_service_target', label: '客方服务对象' }, { key: 'customer_pm', label: '客方项目经理' }, { key: 'customer_order_name', label: '客方订单名称' },
    { key: 'created_date', label: '生成日期', kind: 'date' }, { key: 'accepted_date', label: '接受日期', kind: 'date' }, { key: 'start_date', label: '订单开始日期', kind: 'date' },
    { key: 'end_date', label: '订单结束日期', kind: 'date' }, { key: 'est_invoice_date', label: '预计开票日期', kind: 'date' },
  ] },
  { name: '订单与明细金额', fields: [
    { key: 'order_status', label: '订单状态' }, { key: 'tax_rate', label: '订单税率(%)', kind: 'number', precision: 4 }, { key: 'amount', label: '订单含税总额', kind: 'number' },
    { key: 'amount_ex_tax', label: '订单不含税总额', kind: 'number' }, { key: 'detail_order_no', label: '订单明细单号' }, { key: 'customer_detail_order_no', label: '客方订单明细单号' },
    { key: 'redemption_days', label: '赎期(天)', kind: 'number', precision: 0 }, { key: 'is_last_order', label: '是否末单' }, { key: 'detail_tax_rate', label: '明细税率(%)', kind: 'number', precision: 4 },
    { key: 'detail_amount', label: '明细含税金额', kind: 'number' }, { key: 'detail_amount_ex_tax', label: '明细不含税金额', kind: 'number' },
  ] },
  { name: '扣款、收入与开票回款', fields: [
    { key: 'deduct_amount', label: '扣款含税金额', kind: 'number' }, { key: 'deduct_amount_ex_tax', label: '扣款不含税金额', kind: 'number' },
    { key: 'stop_invoice_amount', label: '停止开票含税金额', kind: 'number' }, { key: 'stop_invoice_amount_ex_tax', label: '停止开票不含税金额', kind: 'number' },
    { key: 'confirmed_income_amount', label: '确认收入含税总额', kind: 'number' }, { key: 'confirmed_income_amount_ex_tax', label: '确认收入不含税总额', kind: 'number' },
    { key: 'unconfirmed_income_amount', label: '未确认收入含税金额', kind: 'number' }, { key: 'unconfirmed_income_amount_ex_tax', label: '未确认收入不含税金额', kind: 'number' },
    { key: 'income_confirmed', label: '收入确认标记', kind: 'income' }, { key: 'invoiced_amount', label: '已开票含税总额', kind: 'number' },
    { key: 'invoiced_amount_ex_tax', label: '已开票不含税总额', kind: 'number' }, { key: 'returned_amount', label: '已回款含税总额', kind: 'number' },
    { key: 'returned_amount_ex_tax', label: '已回款不含税总额', kind: 'number' }, { key: 'invoiced_unreturned_amount', label: '已开票未回款含税金额', kind: 'number' },
    { key: 'invoiced_unreturned_amount_ex_tax', label: '已开票未回款不含税金额', kind: 'number' },
  ] },
  { name: '其他、附件与制单信息', fields: [
    { key: 'region', label: '区域' }, { key: 'province', label: '省份' }, { key: 'city', label: '地市' }, { key: 'delivery_list', label: '交付人员名单' },
    { key: 'has_attachment', label: '附件' }, { key: 'latest_attachment_time', label: '最新附件上传时间' }, { key: 'attachment_count', label: '附件数量', kind: 'number', precision: 0 }, { key: 'has_eml', label: '含eml附件' },
    { key: 'maker', label: '制单人' }, { key: 'make_time', label: '制单时间' }, { key: 'detail_maker', label: '明细制单人' }, { key: 'detail_make_time', label: '明细制单时间' },
    { key: 'updater', label: '更新人' }, { key: 'update_time', label: '更新时间' }, { key: 'auditor', label: '审核人' }, { key: 'audit_time', label: '审核时间' },
  ] },
];
const numericFields = editableSections.flatMap((section) => section.fields).filter((field) => field.kind === 'number');
const editingSections = ref(editableSections.map((section) => section.name));
const editForm = reactive<Record<string, unknown>>({});
type ManagedKeyword = { id: number; keyword_name: string };
const availableKeywords = ref<ManagedKeyword[]>([]);
const editModuleKeywords = reactive<Record<string, string[]>>({ role: [], service: [], tech: [], staff: [] });
const moduleKeywordSelection = reactive<Record<string, string>>({ role: '', service: '', tech: '', staff: '' });
const aiModules = [
  { key: 'role', name: '合同/项目名称', description: '含（合同名称、项目名称）' },
  { key: 'service', name: '合同服务内容', description: '含（项目内容、服务标的、项目交付物）' },
  { key: 'tech', name: '公司技术要求', description: '含（项目技术栈、交付技术标准、公司技术储备、项目技术要求、技术规范）' },
  { key: 'staff', name: '人员需求', description: '含（人员资质、人员技术要求、人员技能要求、岗位需求、岗位说明、岗位要求）' },
];

watch(() => props.modelValue, (value) => { visible.value = value; if (value) beginEdit(); });
watch(visible, (value) => emit('update:modelValue', value));

function beginEdit() {
  if (!props.order) return;
  for (const key of Object.keys(editForm)) delete editForm[key];
  for (const field of editableSections.flatMap((section) => section.fields)) {
    const value = (props.order as unknown as Record<string, unknown>)[field.key];
    editForm[field.key] = field.kind === 'date' && value ? String(value).slice(0, 10)
      : field.key === 'tax_rate' || field.key === 'detail_tax_rate' ? (formatTaxRate(value) ?? '') : (value ?? null);
  }
  for (const module of aiModules) {
    editModuleKeywords[module.key] = editableModuleKeywords(module.key);
    moduleKeywordSelection[module.key] = '';
  }
  keywordApi.getList({ page: 1, pageSize: 200, status: 1 })
    .then((result) => { if (result.code === 200) availableKeywords.value = result.data.list || []; })
    .catch(() => ElMessage.error('读取关键词管理失败，暂时不能修改关键词解析结果'));
  editingSections.value = editableSections.map((section) => section.name);
}

async function saveEdit() {
  if (!props.order) return;
  saving.value = true;
  try {
    const payload: Record<string, unknown> = Object.fromEntries(Object.entries(editForm).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value]));
    for (const field of numericFields) {
      const value = payload[field.key];
      if (value === null || value === undefined) continue;
      const numberValue = Number(String(value).trim());
      if (!Number.isFinite(numberValue)) throw new Error(`${field.label}必须为数字`);
      if (field.precision === 0 && !Number.isInteger(numberValue)) throw new Error(`${field.label}必须为整数`);
      payload[field.key] = field.precision === 4 ? numberValue.toFixed(4) : numberValue;
    }
    const result = await orderApi.update(props.order.id, payload as Partial<OrderLedger>);
    if (result.code !== 200) throw new Error(result.msg);
    const moduleHits = aiModules.map((module) => ({ module_key: module.key, keywords: editModuleKeywords[module.key] || [] }));
    const hitResult = await orderApi.updateModuleHits(props.order.id, moduleHits);
    if (hitResult.code !== 200) throw new Error(hitResult.msg);
    Object.assign(props.order, payload);
    (props.order as any).module_hits = moduleHits.map((item) => ({ ...item, hit: item.keywords.length ? 1 : 0 }));
    (props.order as any).tag_ai = moduleHits.some((item) => item.keywords.length) ? 1 : 0;
    visible.value = false;
    emit('updated');
    ElMessage.success('订单人工修改已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally { saving.value = false; }
}
function removeModuleKeyword(moduleKey: string, keyword: string) { editModuleKeywords[moduleKey] = (editModuleKeywords[moduleKey] || []).filter((item) => item !== keyword); }
function addModuleKeyword(moduleKey: string) {
  const keyword = moduleKeywordSelection[moduleKey];
  moduleKeywordSelection[moduleKey] = '';
  const keywords = editModuleKeywords[moduleKey] || [];
  if (keyword && !keywords.includes(keyword)) keywords.push(keyword);
}
function formatTaxRate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const rate = Number(value);
  return Number.isFinite(rate) ? rate.toFixed(4) : String(value);
}
function editableModuleKeywords(key: string): string[] {
  const raw = props.order?.module_hits?.find((item) => item.module_key === key)?.keywords;
  return raw ? raw.split(',').filter(Boolean) : [];
}
</script>

<style scoped>
:deep(.el-dialog__body) { padding: 16px 20px; }
</style>
