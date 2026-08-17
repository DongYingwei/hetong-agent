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
      <div v-if="editing" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div class="mb-3 text-sm font-medium text-[#303133]">人工编辑（保存为覆盖层，不改写 EPMS 源数据）</div>
        <p class="mb-3 text-xs text-gray-500">可修改全部订单台账业务字段；订单内部标识、EPMS 来源标识及 AI 关键词解析结果保持只读。</p>
        <el-collapse v-model="editingSections">
          <el-collapse-item v-for="section in editableSections" :key="section.name" :name="section.name" :title="section.name">
            <el-form label-width="118px" class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <el-form-item v-for="field in section.fields" :key="field.key" :label="field.label">
                <el-date-picker v-if="field.kind === 'date'" v-model="editForm[field.key]" type="date" value-format="YYYY-MM-DD" class="w-full" clearable />
                <el-input-number v-else-if="field.kind === 'number'" v-model="editForm[field.key]" class="w-full" :precision="field.precision ?? 2" />
                <el-select v-else-if="field.kind === 'income'" v-model="editForm[field.key]" class="w-full">
                  <el-option label="未确认" :value="0" /><el-option label="已确认" :value="1" />
                </el-select>
                <el-input v-else v-model="editForm[field.key]" clearable />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>
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
type FieldKind = 'text' | 'date' | 'number' | 'income';
type EditableField = { key: string; label: string; kind?: FieldKind; precision?: number };
const editableSections: Array<{ name: string; fields: EditableField[] }> = [
  { name: '基本信息', fields: [
    { key: 'project_no', label: '项目编号' }, { key: 'project_name', label: '项目名称' },
    { key: 'detail_project_no', label: '明细项目编号' }, { key: 'order_no', label: '订单编号' },
    { key: 'customer_order_no', label: '客方订单号' }, { key: 'order_name', label: '订单名称' },
    { key: 'contract_no', label: '合同编号' }, { key: 'customer_name', label: '客户名称' },
    { key: 'assessment_line', label: '考核线' }, { key: 'customer_line', label: '客户线' },
    { key: 'customer_type', label: '客户类型' }, { key: 'settlement_type', label: '结算方式' },
    { key: 'order_type', label: '订单类型' }, { key: 'order_attr', label: '订单属性' }, { key: 'salesperson', label: '业务员' },
  ] },
  { name: '客方与日期信息', fields: [
    { key: 'customer_contract_no', label: '客方合同编号' }, { key: 'customer_service_target', label: '客方服务对象' },
    { key: 'customer_pm', label: '客方项目经理' }, { key: 'customer_order_name', label: '客方订单名称' },
    { key: 'created_date', label: '生成日期', kind: 'date' }, { key: 'accepted_date', label: '接受日期', kind: 'date' },
    { key: 'start_date', label: '订单开始日期', kind: 'date' }, { key: 'end_date', label: '订单结束日期', kind: 'date' },
    { key: 'est_invoice_date', label: '预计开票日期', kind: 'date' },
  ] },
  { name: '订单与明细金额', fields: [
    { key: 'order_status', label: '订单状态' }, { key: 'tax_rate', label: '订单税率(%)', kind: 'number', precision: 4 },
    { key: 'amount', label: '订单含税总额', kind: 'number' }, { key: 'amount_ex_tax', label: '订单不含税总额', kind: 'number' },
    { key: 'detail_order_no', label: '订单明细单号' }, { key: 'customer_detail_order_no', label: '客方订单明细单号' },
    { key: 'redemption_days', label: '赎期(天)', kind: 'number', precision: 0 }, { key: 'is_last_order', label: '是否末单' },
    { key: 'detail_tax_rate', label: '明细税率(%)', kind: 'number', precision: 4 },
    { key: 'detail_amount', label: '明细含税金额', kind: 'number' }, { key: 'detail_amount_ex_tax', label: '明细不含税金额', kind: 'number' },
  ] },
  { name: '扣款、收入与开票回款', fields: [
    { key: 'deduct_amount', label: '扣款含税金额', kind: 'number' }, { key: 'deduct_amount_ex_tax', label: '扣款不含税金额', kind: 'number' },
    { key: 'stop_invoice_amount', label: '停止开票含税金额', kind: 'number' }, { key: 'stop_invoice_amount_ex_tax', label: '停止开票不含税金额', kind: 'number' },
    { key: 'confirmed_income_amount', label: '确认收入含税总额', kind: 'number' }, { key: 'confirmed_income_amount_ex_tax', label: '确认收入不含税总额', kind: 'number' },
    { key: 'unconfirmed_income_amount', label: '未确认收入含税金额', kind: 'number' }, { key: 'unconfirmed_income_amount_ex_tax', label: '未确认收入不含税金额', kind: 'number' },
    { key: 'income_confirmed', label: '收入确认标记', kind: 'income' },
    { key: 'invoiced_amount', label: '已开票含税总额', kind: 'number' }, { key: 'invoiced_amount_ex_tax', label: '已开票不含税总额', kind: 'number' },
    { key: 'returned_amount', label: '已回款含税总额', kind: 'number' }, { key: 'returned_amount_ex_tax', label: '已回款不含税总额', kind: 'number' },
    { key: 'invoiced_unreturned_amount', label: '已开票未回款含税金额', kind: 'number' }, { key: 'invoiced_unreturned_amount_ex_tax', label: '已开票未回款不含税金额', kind: 'number' },
  ] },
  { name: '其他、附件与制单信息', fields: [
    { key: 'region', label: '区域' }, { key: 'province', label: '省份' }, { key: 'city', label: '地市' }, { key: 'delivery_list', label: '交付人员名单' },
    { key: 'has_attachment', label: '附件' }, { key: 'latest_attachment_time', label: '最新附件上传时间' }, { key: 'attachment_count', label: '附件数量', kind: 'number', precision: 0 }, { key: 'has_eml', label: '含eml附件' },
    { key: 'maker', label: '制单人' }, { key: 'make_time', label: '制单时间' }, { key: 'detail_maker', label: '明细制单人' }, { key: 'detail_make_time', label: '明细制单时间' },
    { key: 'updater', label: '更新人' }, { key: 'update_time', label: '更新时间' }, { key: 'auditor', label: '审核人' }, { key: 'audit_time', label: '审核时间' },
  ] },
];
const editingSections = ref(editableSections.map((section) => section.name));
const editForm = reactive<Record<string, unknown>>({});
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
function beginEdit() {
  if (!props.order) return;
  for (const key of Object.keys(editForm)) delete editForm[key];
  for (const field of editableSections.flatMap((section) => section.fields)) {
    const value = (props.order as Record<string, unknown>)[field.key];
    editForm[field.key] = field.kind === 'date' && value ? String(value).slice(0, 10) : (value ?? null);
  }
  editingSections.value = editableSections.map((section) => section.name);
  editing.value = true;
}
async function saveEdit() {
  if (!props.order) return;
  saving.value = true;
  try {
    const payload = Object.fromEntries(Object.entries(editForm).map(([key, value]) => [key, value === '' ? null : value]));
    const res = await orderApi.update(props.order.id, payload as Partial<OrderLedger>);
    if (res.code !== 200) throw new Error(res.msg);
    Object.assign(props.order, payload);
    editing.value = false;
    emit('updated');
    ElMessage.success('订单人工修改已保存');
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

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
