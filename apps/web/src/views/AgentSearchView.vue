<template>
  <div class="h-[calc(100vh-64px-3rem)] flex gap-4">
    <!-- 左侧对话历史记录 -->
    <div class="w-64 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col shrink-0">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
          <el-icon class="text-[#303133]"><ChatDotSquare /></el-icon>
          检索历史
        </h3>
        <el-button link size="small" style="color: #1f1f1f;" @click="handleNewChat">
          <el-icon class="mr-1"><Plus /></el-icon> 新对话
        </el-button>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div
          v-for="(item, idx) in historyList"
          :key="idx"
          :class="[
            'p-2.5 rounded-lg text-xs cursor-pointer transition-all flex flex-col gap-1',
            activeHistoryIndex === idx
              ? 'bg-[#f3f4f6] text-[#303133] font-medium border border-gray-300/40'
              : 'text-gray-600 hover:bg-gray-50'
          ]"
          @click="selectHistory(idx)"
        >
          <div class="truncate font-medium">{{ item.title }}</div>
          <div class="text-[10px] text-gray-400 flex items-center justify-between">
            <span>{{ String(item.updated_at || '').replace('T', ' ').slice(0, 16) }}</span>
            <span class="tag tag-gray text-[9px]">合同检索</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧主 AI 对话界面 -->
    <div class="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-w-0">
      <!-- 综合检索头部说明 -->
      <div class="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-white">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-gray-800">综合检索智能体</h2>
            <span class="tag tag-green">AI 增强版</span>
          </div>
          <p class="text-xs text-gray-500 mt-0.5">支持对全量合同文本及订单台账信息进行自然语言交互检索</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-right font-mono text-xs text-gray-400">
            已索引 <span class="font-bold text-[#303133]">{{ indexedContractCount ?? '—' }}</span> 份合同及 <span class="font-bold text-[#303133]">{{ indexedOrderCount ?? '—' }}</span> 条订单
          </div>
          <el-button type="info" plain size="small" @click="handleClearChat">清空记录</el-button>
        </div>
      </div>

      <!-- 消息对话区域 -->
      <div ref="chatScrollRef" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
        <div v-for="(msg, idx) in messages" :key="idx" class="space-y-3">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="bg-[#303133] text-white text-xs py-2.5 px-4 rounded-2xl rounded-tr-none max-w-[80%] leading-relaxed shadow-sm whitespace-pre-wrap">
              {{ msg.content }}
            </div>
          </div>

          <!-- AI 消息 -->
          <div v-else class="flex justify-start">
            <div class="flex items-start gap-2.5 max-w-[92%]">
              <div class="w-8 h-8 rounded-full bg-[#303133] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                AI
              </div>
              <div class="bg-white border border-gray-200 text-xs py-3 px-4 rounded-2xl rounded-tl-none leading-relaxed shadow-sm text-[#1A1A1A] min-w-0">
                <!-- Markdown 正文（剥离 SQL 块与表格，只渲染 prose） -->
                <div class="markdown-body" v-html="renderContent(msg.content)"></div>

                <div v-if="msg.process?.length" class="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-[11px] text-gray-700">
                  <span class="font-medium">检索过程：</span>{{ msg.process.map((item) => item.label).join(' → ') }}
                </div>

                <div v-if="ledgerRows(msg).length" class="mt-3 border border-gray-200 rounded-lg overflow-x-auto">
                  <div :class="msg.isExpanded ? 'max-h-[360px] overflow-y-auto' : ''">
                    <table class="w-full text-xs whitespace-nowrap"><thead class="sticky top-0 z-10 bg-gray-100"><tr>
                      <th v-for="col in ledgerColumns(msg)" :key="col.key" class="px-3 py-2 text-left font-medium">{{ col.label }}</th>
                    </tr></thead><tbody><tr v-for="(row,index) in (msg.isExpanded ? ledgerRows(msg) : ledgerRows(msg).slice(0,5))" :key="row.id || index" :class="index%2?'bg-gray-50':'bg-white'">
                      <td v-for="col in ledgerColumns(msg)" :key="col.key" class="px-3 py-2">{{ ledgerCell(row,col.key) }}</td>
                    </tr></tbody></table>
                  </div>
                  <div v-if="ledgerRows(msg).length > 5" class="px-3 py-1.5 bg-gray-50 text-[11px] text-gray-500 border-t">{{ msg.isExpanded ? '已展开全部明细' : `共 ${ledgerRows(msg).length} 条，展示前 5 条` }} <span class="float-right cursor-pointer font-bold" @click="toggleDetails(msg)">{{ msg.isExpanded ? '收起明细 ▲' : '展开查看全部明细 ▼' }}</span></div>
                </div>
                  <div v-if="msg.summary" class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {{ msg.summary.scope }}：共 {{ msg.entity === 'order' ? msg.summary.order_count : msg.summary.contract_count }} 条{{ msg.entity === 'order' ? '订单' : '合同' }}；金额合计 {{ formatAmount(msg.summary.total_amount) }}；{{ msg.summary.missing_amount_count }} 条未填写金额，未计入合计。
                    <div v-if="msg.summary.amount_type_breakdown?.length" class="mt-1 text-gray-500">金额口径说明：<span v-for="(item, index) in msg.summary.amount_type_breakdown" :key="item.amount_type">{{ index ? '；' : '' }}{{ item.amount_type }} {{ item.contract_count }} 份，{{ formatAmount(item.total_amount) }}</span></div>
                  </div>
                  <div class="flex gap-2"><el-button size="small" @click="handleExportResult(msg)"><el-icon class="mr-1"><Download /></el-icon>导出{{ msg.entity === 'order' ? '订单' : '合同' }}台账</el-button></div>

                <!-- 结构化结果表格（列名随 SQL 动态变化） -->
                <div v-if="!ledgerRows(msg).length && msg.tableData && msg.tableData.length > 0" class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div :class="msg.isExpanded ? 'max-h-[360px] overflow-y-auto' : ''">
                    <table class="w-full text-xs">
                      <thead class="sticky top-0 z-10 bg-gray-100 shadow-sm">
                        <tr class="text-gray-600 text-left border-b border-gray-200">
                          <th
                            v-for="col in tableColumns(msg.tableData)"
                            :key="col"
                            class="px-3 py-2 font-medium whitespace-nowrap"
                            :class="isAmountColumn(col) ? 'text-right' : ''"
                          >{{ columnLabel(col) }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(row, rIdx) in (msg.isExpanded ? msg.tableData : msg.tableData.slice(0, 5))"
                          :key="rIdx"
                          :class="[
                            'transition-colors',
                            row.isSummary ? 'bg-gray-100 font-semibold' : '',
                            rIdx % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'
                          ]"
                        >
                          <td
                            v-for="col in tableColumns(msg.tableData)"
                            :key="col"
                            class="px-3 py-2 whitespace-nowrap"
                            :class="isAmountColumn(col) ? 'text-right font-semibold' : ''"
                          >{{ cellText(row[col]) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div v-if="(msg.resultTotal || msg.tableData.length) > 5" class="px-3 py-1.5 bg-gray-50 text-[11px] text-gray-500 border-t border-gray-200 flex items-center justify-between font-mono">
                    <span v-if="!msg.isExpanded">...共 {{ msg.resultTotal || msg.tableData.length }} 条明细，当前已精简展示前 5 条</span>
                    <span v-else class="text-gray-700 font-semibold">✓ 已展开全量 {{ msg.tableData.length }} 条明细</span>
                    <span class="text-[#303133] cursor-pointer font-bold hover:underline select-none" @click="toggleDetails(msg)">
                      {{ msg.loadingDetails ? '正在加载全部明细…' : (msg.isExpanded ? '收起明细 ▲' : '展开查看全部明细 ▼') }}
                    </span>
                  </div>
                </div>

                <!-- SQL 折叠块 -->
                <details v-if="msg.sql" class="hidden">
                  <summary class="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer select-none hover:text-[#049667]">查看 SQL</summary>
                  <pre class="px-3 pb-3 overflow-x-auto text-[11px] font-mono text-gray-700 whitespace-pre-wrap"><code>{{ msg.sql }}</code></pre>
                </details>

                <!-- RAG 依据出处 -->
                <div v-if="msg.citations && msg.citations.length > 0" class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div class="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 border-b border-gray-100">依据出处</div>
                  <div v-for="(c, ci) in msg.citations" :key="ci" class="px-3 py-2 text-xs border-b border-gray-50 last:border-b-0">
                    <div class="flex items-center gap-2 font-medium text-[#303133]">
                      <span>{{ c.contract_no || '—' }}</span>
                      <span class="text-gray-400">·</span>
                      <span class="text-gray-600">{{ c.field }}</span>
                      <span v-if="c.score !== undefined" class="ml-auto text-[10px] text-gray-400 font-mono">相关度 {{ (c.score * 100).toFixed(0) }}%</span>
                    </div>
                    <div class="mt-1 text-gray-700 leading-relaxed">{{ c.content }}</div>
                  </div>
                </div>

                <!-- 导出按钮 -->
                <div v-if="msg.tableData && msg.tableData.length > 0" class="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                  <el-button size="small" style="height: 28px; font-size: 12px;" @click="handleExportResult(msg)">
                    <el-icon class="mr-1"><Download /></el-icon> 导出完整Excel
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入框与快捷提示词 -->
      <div class="p-4 border-t border-gray-100 bg-white shrink-0 space-y-3">
        <div class="flex gap-2">
          <el-input
            v-model="inputQuery"
            placeholder="输入您的问题，如：服务内容包含AI的合同有哪些、含AI的订单总金额..."
            class="custom-input flex-1"
            @keyup.enter="handleSend"
          >
            <template #prefix>
              <el-icon class="text-gray-400"><Search /></el-icon>
            </template>
          </el-input>
          <el-button
            :loading="sending"
            @click="handleSend"
          >
            发送
          </el-button>
        </div>

        <div class="flex items-center gap-2 text-xs text-gray-400 overflow-x-auto pb-1 select-none">
          <span class="shrink-0 text-gray-400">快捷检索：</span>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 hover:text-[#303133] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('服务内容包含AI智能体的合同有哪些')"
          >
            🤖 2026年AI合同
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 hover:text-[#303133] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('电力行业含AI关键词的合同金额是多少')"
          >
            ⚡ 电力行业AI金额
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 hover:text-[#303133] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('技术要求含机器学习的合同有哪些')"
          >
            🧠 机器学习相关
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 hover:text-[#303133] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('含AI关键词的合同有哪些，总金额是多少')"
          >
            📦 AI合同总金额
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import { Plus, ChatDotSquare, Search, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { agentApi, type Citation, type TableRowItem } from '../api/agentApi';
import { contractApi, orderApi } from '../api';
import { exportFullContractLedgerExcel, exportFullOrderLedgerExcel } from '../utils/excelExporter';
import { renderAssistantContent } from '../utils/markdown';

interface MessageItem {
  role: 'user' | 'assistant';
  content: string;
  tableData?: TableRowItem[];
  sql?: string;
  citations?: Citation[];
  contracts?: Record<string, any>[];
  orders?: Record<string, any>[];
  entity?: 'contract' | 'order';
  resultId?: number;
  resultTotal?: number;
  summary?: { scope: string; contract_count?: number; order_count?: number; total_amount: number; missing_amount_count: number; amount_type_breakdown?: Array<{ amount_type: string; contract_count: number; total_amount: number }> };
  process?: Array<{ label: string; status: string }>;
  isExpanded?: boolean;
  loadingDetails?: boolean;
}

// DB 列名 → 中文展示名。未命中的列按原始列名展示（不臆造、不补默认）。
const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  contract_no: '合同号',
  contract_name: '合同名称',
  customer_name: '客户名称',
  signing_entity: '签约主体',
  contract_type: '合同类型',
  customer_contract_no: '客方合同号',
  sign_date: '签订日期',
  start_date: '开始日期',
  end_date: '结束日期',
  sign_year: '签订年份',
  sign_quarter: '签订季度',
  sign_half: '半年',
  end_year: '结束年份',
  amount: '金额',
  amount_type: '金额口径',
  tax_rate: '税率',
  post_eval: '售后评价',
  deposit_amount: '保证金',
  contract_status: '合同状态',
  verify_status: '核验状态',
  assessment_line: '评估条线',
  has_ai_keyword: 'AI标签',
  contract_count: '数量',
  total_amount: '总金额',
  count: '数量',
  cnt: '数量',
  sum: '合计',
  total: '合计',
  order_no: '订单号',
  order_name: '订单名称',
  project_no: '项目号',
  project_name: '项目名称',
};
const contractFields = ['assessment_line', 'bid_no', 'related_main_no', 'framework_alias', 'customer_contract_no', 'signing_entity', 'contract_type', 'start_date', 'end_date', 'amount_type', 'tax_rate', 'settlement_terms', 'post_eval', 'deposit_amount', 'deposit_refund', 'arbitration', 'authorizer', 'status'];
const CONTRACT_LEDGER_COLUMNS = [
  ['contract_no','合同号'],['customer_name','客户名称'],['contract_name','合同名称'],['contract_type','合同类型'],['sign_date','签约时间'],['amount','合同金额(含税)'],['assessment_line','考核线'],['contract_status','合同状态'],['verify_status','核对状态'],['warning_status','断档预警'],['role','项目名称'],['service','服务内容'],['tech','技术要求'],['staff','人员需求'],
];
const ORDER_LEDGER_COLUMNS = [
  ['project_no','项目编号'],['project_name','项目名称'],['order_no','订单编号'],['order_name','订单名称'],['customer_name','客户名称'],['assessment_line','考核线'],['start_date','订单开始日期'],['end_date','订单结束日期'],['tax_rate','明细税率(%)'],['amount','明细含税金额'],['income_confirmed','收入确认标记'],['attachment_count','附件数量'],['has_eml','含eml附件'],['role','项目名称'],['service','服务内容'],['tech','技术要求'],['staff','人员要求'],
];
function ledgerRows(msg: MessageItem) { return msg.entity === 'order' ? (msg.orders || []) : (msg.contracts || []); }
function ledgerColumns(msg: MessageItem) { return (msg.entity === 'order' ? ORDER_LEDGER_COLUMNS : CONTRACT_LEDGER_COLUMNS).map(([key,label]) => ({ key, label })); }
function ledgerCell(row: Record<string, any>, key: string) {
  if (['role','service','tech','staff'].includes(key)) return Number(row.module_hits?.find((x: any) => x.module_key === key)?.hit) === 1 ? 'AI' : '—';
  if (key === 'amount') return formatAmount(row[key]);
  if (key === 'income_confirmed') return Number(row[key]) === 1 ? '已确认' : '未确认';
  return cellText(row[key]) || '—';
}
function formatAmount(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? `${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元` : '金额未填写'; }
function moduleAiFlags(contract: Record<string, any>) {
  const hits = Array.isArray(contract.module_hits) ? contract.module_hits : [];
  return [
    ['项目名称', 'role'], ['服务内容', 'service'], ['技术要求', 'tech'], ['人员需求', 'staff'],
  ].map(([name, key]) => ({ name, hit: Number(hits.find((item: any) => item.module_key === key)?.hit) === 1 }));
}

/** 取表格列（行里有哪些键就展示哪些列，排除 isSummary 标记）。 */
function tableColumns(rows: TableRowItem[]): string[] {
  const cols = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'isSummary') cols.add(key);
    }
  }
  return Array.from(cols);
}

function columnLabel(col: string): string {
  return COLUMN_LABELS[col] ?? col;
}

/** 金额/数量类列右对齐。 */
function isAmountColumn(col: string): boolean {
  return /amount|count|金额|数量|金额口径/.test(col);
}

/** 单元格展示：对象/数组 JSON 化，null/undefined 显示空。 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderContent(md: string): string {
  return renderAssistantContent(md);
}

const WELCOME = `您好，我是**综合检索智能体**。您可以问我关于合同和订单的任何问题，例如：

- "服务内容包含AI的合同有多少，提供编号和总金额"
- "2026年签订的运维合同有哪些"
- "含AI关键词的合同总金额是多少"`;

const historyList = ref<any[]>([]);
const sessionId = ref<string | undefined>();
const indexedContractCount = ref<number | null>(null);
const indexedOrderCount = ref<number | null>(null);

const activeHistoryIndex = ref(0);
const inputQuery = ref('');
const sending = ref(false);
const chatScrollRef = ref<HTMLDivElement | null>(null);

const messages = ref<MessageItem[]>([
  { role: 'assistant', content: WELCOME },
]);

onMounted(() => {
  scrollToBottom();
  loadSessions();
  loadIndexStats();
});

async function loadSessions() { const res = await agentApi.getSessions(); if (res.code === 200) historyList.value = res.data.list || []; }

/** 头部索引数量必须来自真实台账，不能使用原型演示值。 */
async function loadIndexStats() {
  const [contracts, orders] = await Promise.allSettled([
    contractApi.getList({ page: 1, pageSize: 1 }),
    orderApi.getList({ page: 1, pageSize: 1 }),
  ]);
  if (contracts.status === 'fulfilled' && contracts.value.code === 200) {
    indexedContractCount.value = Number(contracts.value.data.total);
  }
  if (orders.status === 'fulfilled' && orders.value.code === 200) {
    indexedOrderCount.value = Number(orders.value.data.total);
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
}

function handleNewChat() {
  activeHistoryIndex.value = -1;
  sessionId.value = undefined;
  messages.value = [{ role: 'assistant', content: WELCOME }];
}

/** 点击历史条目：填入标题作为新提问重新检索（真实链路，不再注入假数据）。 */
async function selectHistory(index: number) {
  activeHistoryIndex.value = index;
  const item = historyList.value[index];
  if (!item) return;
  const res = await agentApi.getSession(item.id);
  if (res.code !== 200) return ElMessage.error(res.msg || '读取会话失败');
  sessionId.value = item.id;
  messages.value = [{ role: 'assistant', content: WELCOME }, ...(res.data.messages || []).map((m: any) => {
    const data = m.result_data || {};
    return { role: m.role, content: m.content, ...data, tableData: data.records || data.tableData, resultTotal: data.record_ids?.length || data.records?.length || 0 };
  })];
  scrollToBottom();
}

function fillQuery(text: string) {
  inputQuery.value = text;
  handleSend();
}

async function handleSend() {
  const query = inputQuery.value.trim();
  if (!query) return;

  messages.value.push({ role: 'user', content: query });
  inputQuery.value = '';
  scrollToBottom();

  sending.value = true;
  try {
    const res = await agentApi.chat({ message: query, sessionId: sessionId.value });
    if (res.code === 200 && res.data) {
      messages.value.push({
        role: 'assistant',
        content: res.data.content || '',
        contracts: res.data.contracts,
        orders: res.data.orders,
        entity: res.data.entity,
        resultId: res.data.resultId,
        resultTotal: res.data.record_ids?.length || res.data.records?.length || 0,
        tableData: res.data.records,
        summary: res.data.summary,
        process: res.data.process,
        citations: res.data.citations,
      });
      sessionId.value = res.data.sessionId;
      loadSessions();
    } else {
      messages.value.push({ role: 'assistant', content: res.msg || '查询失败，请稍后重试' });
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '查询请求失败，请检查查询智能体服务是否可用。' });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

async function handleClearChat() {
  messages.value = [];
  await agentApi.clearSessions();
  historyList.value = [];
  sessionId.value = undefined;
  ElMessage.success('对话记录已清空');
}

async function handleExportResult(msg: MessageItem) {
  let list = msg.tableData || [];
  if (msg.resultId && (msg.resultTotal || 0) > list.length) {
    const res = await agentApi.getResult(msg.resultId, { page: 1, pageSize: 200 });
    if (res.code !== 200) return ElMessage.error(res.msg || '读取完整检索结果失败');
    list = res.data.list as TableRowItem[];
    for (let page = 2; list.length < res.data.total; page += 1) {
      const more = await agentApi.getResult(msg.resultId, { page, pageSize: 200 });
      if (more.code !== 200) return ElMessage.error(more.msg || '读取完整检索结果失败');
      list.push(...more.data.list as TableRowItem[]);
    }
  }
  if (!list || list.length === 0) {
    ElMessage.warning('无可导出的结果');
    return;
  }

  try {
    if (msg.entity === 'order') await exportFullOrderLedgerExcel(list, '综合检索订单台账');
    else await exportFullContractLedgerExcel(list, '综合检索合同台账');
    ElMessage.success(`${msg.entity === 'order' ? '订单' : '合同'}台账 Excel 已导出（共 ${list.length} 条）`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    ElMessage.error(`导出失败:${reason}`);
  }
}

async function toggleDetails(msg: MessageItem) {
  if (msg.isExpanded) { msg.isExpanded = false; return; }
  if (!msg.resultId || (msg.resultTotal || 0) <= (msg.tableData?.length || 0)) { msg.isExpanded = true; return; }
  msg.loadingDetails = true;
  try {
    const rows: TableRowItem[] = [];
    for (let page = 1; ; page += 1) {
      const res = await agentApi.getResult(msg.resultId, { page, pageSize: 200 });
      if (res.code !== 200) throw new Error(res.msg || '读取完整检索结果失败');
      rows.push(...res.data.list as TableRowItem[]);
      if (rows.length >= res.data.total) break;
    }
    msg.tableData = rows;
    msg.isExpanded = true;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '读取完整检索结果失败'); }
  finally { msg.loadingDetails = false; }
}
</script>
