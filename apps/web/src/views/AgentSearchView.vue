<template>
  <div class="h-[calc(100vh-64px-3rem)] flex gap-4">
    <!-- 左侧对话历史记录 -->
    <div class="w-64 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col shrink-0">
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
          <el-icon class="text-[#049667]"><ChatDotSquare /></el-icon>
          检索历史
        </h3>
        <el-button type="primary" link size="small" style="color: #049667;" @click="handleNewChat">
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
              ? 'bg-[#E6F8F0] text-[#049667] font-medium border border-[#049667]/20'
              : 'text-gray-600 hover:bg-gray-50'
          ]"
          @click="selectHistory(idx)"
        >
          <div class="truncate font-medium">{{ item.title }}</div>
          <div class="text-[10px] text-gray-400 flex items-center justify-between">
            <span>{{ item.time }}</span>
            <span class="tag tag-gray text-[9px]">{{ item.type === 'order' ? '订单检索' : '合同检索' }}</span>
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
            已索引 <span class="font-bold text-[#049667]">1,247</span> 份合同及 <span class="font-bold text-[#049667]">3,568</span> 条订单
          </div>
          <el-button type="info" plain size="small" @click="handleClearChat">清空记录</el-button>
        </div>
      </div>

      <!-- 消息对话区域 -->
      <div ref="chatScrollRef" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
        <div v-for="(msg, idx) in messages" :key="idx" class="space-y-3">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="bg-[#049667] text-white text-xs py-2.5 px-4 rounded-2xl rounded-tr-none max-w-[80%] leading-relaxed shadow-sm whitespace-pre-wrap">
              {{ msg.content }}
            </div>
          </div>

          <!-- AI 消息 -->
          <div v-else class="flex justify-start">
            <div class="flex items-start gap-2.5 max-w-[92%]">
              <div class="w-8 h-8 rounded-full bg-[#049667] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                AI
              </div>
              <div class="bg-white border border-gray-200 text-xs py-3 px-4 rounded-2xl rounded-tl-none leading-relaxed shadow-sm text-[#1A1A1A] min-w-0">
                <!-- Markdown 正文（剥离 SQL 块与表格，只渲染 prose） -->
                <div class="markdown-body" v-html="renderContent(msg.content)"></div>

                <!-- 结构化结果表格（列名随 SQL 动态变化） -->
                <div v-if="msg.tableData && msg.tableData.length > 0" class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
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
                            row.isSummary ? 'bg-emerald-50/70 font-semibold' : '',
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

                  <div v-if="msg.tableData.length > 5" class="px-3 py-1.5 bg-gray-50 text-[11px] text-gray-500 border-t border-gray-200 flex items-center justify-between font-mono">
                    <span v-if="!msg.isExpanded">...共 {{ msg.tableData.length }} 条明细，当前已精简展示前 5 条</span>
                    <span v-else class="text-emerald-700 font-semibold">✓ 已展开全量 {{ msg.tableData.length }} 条明细</span>
                    <span class="text-[#049667] cursor-pointer font-bold hover:underline select-none" @click="msg.isExpanded = !msg.isExpanded">
                      {{ msg.isExpanded ? '收起明细 ▲' : '展开查看全部明细 ▼' }}
                    </span>
                  </div>
                </div>

                <!-- SQL 折叠块 -->
                <details v-if="msg.sql" class="mt-3 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <summary class="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer select-none hover:text-[#049667]">查看 SQL</summary>
                  <pre class="px-3 pb-3 overflow-x-auto text-[11px] font-mono text-gray-700 whitespace-pre-wrap"><code>{{ msg.sql }}</code></pre>
                </details>

                <!-- RAG 依据出处 -->
                <div v-if="msg.citations && msg.citations.length > 0" class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div class="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 border-b border-gray-100">依据出处</div>
                  <div v-for="(c, ci) in msg.citations" :key="ci" class="px-3 py-2 text-xs border-b border-gray-50 last:border-b-0">
                    <div class="flex items-center gap-2 font-medium text-[#049667]">
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
            type="primary"
            style="background-color: #049667; border-color: #049667;"
            :loading="sending"
            @click="handleSend"
          >
            发送
          </el-button>
        </div>

        <div class="flex items-center gap-2 text-xs text-gray-400 overflow-x-auto pb-1 select-none">
          <span class="shrink-0 text-gray-400">快捷检索：</span>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-[#049667] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('服务内容包含AI智能体的合同有哪些')"
          >
            🤖 2026年AI合同
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-[#049667] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('电力行业含AI关键词的合同金额是多少')"
          >
            ⚡ 电力行业AI金额
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-[#049667] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('技术要求含机器学习的合同有哪些')"
          >
            🧠 机器学习相关
          </button>
          <button
            class="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-[#049667] rounded-md transition-colors shrink-0 text-gray-600 border border-gray-200/60"
            @click="fillQuery('含AI关键词的订单有哪些')"
          >
            📦 AI订单检索
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
import { buildFaithfulWorkbook, downloadWorkbook, type ExportRow } from '../utils/excelExporter';
import { renderAssistantContent } from '../utils/markdown';

interface MessageItem {
  role: 'user' | 'assistant';
  content: string;
  tableData?: TableRowItem[];
  sql?: string;
  citations?: Citation[];
  isExpanded?: boolean;
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
- "含AI关键词的订单总金额是多少"`;

const historyList = ref([
  { title: '服务内容包含AI智能体的合同', time: '2026-08-06 14:32', type: 'contract' },
  { title: '含AI关键词的订单有哪些', time: '2026-08-06 11:20', type: 'order' },
  { title: '2026年签订的运维合同有哪些', time: '2026-08-06 10:15', type: 'contract' },
  { title: '电力行业含AI关键词的合同金额', time: '2026-08-05 16:48', type: 'contract' },
  { title: '技术要求含机器学习的合同', time: '2026-08-05 09:22', type: 'contract' },
  { title: '数据标注相关合同及对应金额', time: '2026-08-04 14:05', type: 'contract' },
]);

const activeHistoryIndex = ref(0);
const inputQuery = ref('');
const sending = ref(false);
const chatScrollRef = ref<HTMLDivElement | null>(null);

const messages = ref<MessageItem[]>([
  { role: 'assistant', content: WELCOME },
]);

onMounted(() => {
  scrollToBottom();
});

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
    }
  });
}

function handleNewChat() {
  activeHistoryIndex.value = -1;
  messages.value = [{ role: 'assistant', content: WELCOME }];
}

/** 点击历史条目：填入标题作为新提问重新检索（真实链路，不再注入假数据）。 */
function selectHistory(index: number) {
  activeHistoryIndex.value = index;
  const item = historyList.value[index];
  if (item) {
    inputQuery.value = item.title;
    handleSend();
  }
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
    // history 只发本轮之前的对话（不含刚 push 的当前提问）。
    const history = messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
    const res = await agentApi.chat({ message: query, history });
    if (res.code === 200 && res.data) {
      messages.value.push({
        role: 'assistant',
        content: res.data.content || '',
        tableData: res.data.tableData,
        sql: res.data.sql,
        citations: res.data.citations,
      });
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

function handleClearChat() {
  messages.value = [];
  ElMessage.success('对话记录已清空');
}

// 忠实导出检索结果：列无关、不补默认值、不跨口径合计（ADR-0005 / 12b / 12c）。
async function handleExportResult(msg: MessageItem) {
  const list = msg.tableData;
  if (!list || list.length === 0) {
    ElMessage.warning('无可导出的结果');
    return;
  }

  const cols = tableColumns(list);
  const rows: ExportRow[] = list.map((item) => {
    const row: ExportRow = {};
    for (const c of cols) {
      const v = item[c];
      if (v === null || v === undefined) row[columnLabel(c)] = null;
      else if (typeof v === 'object') row[columnLabel(c)] = JSON.stringify(v);
      else row[columnLabel(c)] = v as string | number | boolean;
    }
    if (item.isSummary) row.isSummary = true;
    return row;
  });

  try {
    const wb = buildFaithfulWorkbook(rows);
    await downloadWorkbook(wb, '检索结果明细');
    ElMessage.success(`检索结果明细 Excel 已导出（共 ${rows.length} 条）`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    ElMessage.error(`导出失败:${reason}`);
  }
}
</script>
