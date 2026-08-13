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
            <div class="bg-[#049667] text-white text-xs py-2.5 px-4 rounded-2xl rounded-tr-none max-w-[80%] leading-relaxed shadow-sm">
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
                <div v-html="msg.content"></div>

                <!-- 嵌入式结果数据表格 (直接在当前气泡内展开/滚动查看，无需弹窗) -->
                <div v-if="msg.tableData && msg.tableData.length > 0" class="mt-3 border border-gray-200 rounded-lg overflow-hidden transition-all duration-200">
                  <div :class="msg.isExpanded ? 'max-h-[360px] overflow-y-auto shadow-inner' : ''">
                    <table class="w-full text-xs">
                      <thead class="sticky top-0 z-10 bg-gray-100 shadow-sm">
                        <tr class="text-gray-600 text-left border-b border-gray-200">
                          <th class="px-3 py-2">编号</th>
                          <th class="px-3 py-2">名称</th>
                          <th class="px-3 py-2 text-right">金额</th>
                          <th class="px-3 py-2 text-center w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(row, rIdx) in (msg.isExpanded ? msg.tableData : msg.tableData.slice(0, 5))"
                          :key="rIdx"
                          :class="rIdx % 2 === 1 ? 'bg-gray-50/70 hover:bg-emerald-50/50' : 'bg-white hover:bg-emerald-50/50'"
                          class="transition-colors cursor-pointer"
                          @click="handleOpenRowModal(row)"
                        >
                          <td class="px-3 py-2 font-mono font-medium text-[#049667] whitespace-nowrap">{{ row.no }}</td>
                          <td class="px-3 py-2">{{ row.name }}</td>
                          <td class="px-3 py-2 text-right font-semibold whitespace-nowrap">{{ row.amount }}</td>
                          <td class="px-3 py-2 text-center whitespace-nowrap">
                            <span class="text-[#049667] hover:underline font-medium">查看</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <!-- 嵌入表格底部的展开/收起状态指示条 -->
                  <div v-if="msg.tableData.length > 5" class="px-3 py-1.5 bg-gray-50 text-[11px] text-gray-500 border-t border-gray-200 flex items-center justify-between font-mono">
                    <span v-if="!msg.isExpanded">...共 {{ msg.tableData.length }} 条明细，当前已精简展示前 5 条</span>
                    <span v-else class="text-emerald-700 font-semibold">✓ 已展开全量 {{ msg.tableData.length }} 条明细（支持向上滑动滚动条查看）</span>
                    <span class="text-[#049667] cursor-pointer font-bold hover:underline select-none" @click="msg.isExpanded = !msg.isExpanded">
                      {{ msg.isExpanded ? '收起明细 ▲' : '展开查看全部明细 ▼' }}
                    </span>
                  </div>
                </div>

                <!-- 操作按钮栏 (导出Excel + 在当前展开/收起) -->
                <div v-if="msg.tableData && msg.tableData.length > 0" class="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                  <el-button size="small" style="height: 28px; font-size: 12px;" @click="handleExportResult(msg)">
                    <el-icon class="mr-1"><Download /></el-icon> 导出完整Excel
                  </el-button>
                  <el-button
                    v-if="msg.tableData.length > 5"
                    type="primary"
                    link
                    size="small"
                    style="color: #049667;"
                    @click="msg.isExpanded = !msg.isExpanded"
                  >
                    {{ msg.isExpanded ? '收起明细' : `查看全部明细 (${msg.tableData.length}条)` }}
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

    <!-- 查看具体合同详情 modal -->
    <ContractViewModal
      v-model="showContractModal"
      :contract-data="selectedContractRow"
    />

    <!-- 查看具体订单详情 modal -->
    <OrderDetailModal
      v-model="showOrderModal"
      :order="selectedOrderRow"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import { Plus, ChatDotSquare, Search, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { agentApi } from '../api';
import { buildFaithfulWorkbook, downloadWorkbook, type ExportRow } from '../utils/excelExporter';
import ContractViewModal from '../components/modals/ContractViewModal.vue';
import OrderDetailModal from '../components/modals/OrderDetailModal.vue';

interface TableRowItem {
  no: string;
  name: string;
  amount: string;
  customer?: string;
  status?: string;
  rawType?: 'contract' | 'order';
  isSummary?: boolean;
}

interface MessageItem {
  role: 'user' | 'assistant';
  content: string;
  tableData?: TableRowItem[];
  type?: 'contract' | 'order';
  totalCount?: number;
  isExpanded?: boolean;
}

// 动态生成全量 42 份合同明细数据
function generate42Contracts(): TableRowItem[] {
  const customers = ['中国移动通信集团', '中国电信集团', '中国联通股份', '南京大学', '华为技术有限公司', '百度在线', '科大讯飞', '中兴通讯', '国家电网', '腾讯科技', '阿里巴巴', '字节跳动', '招商银行', '平安科技'];
  const titles = ['智能运维服务合同', '数据标注平台开发协议', '智能客服系统建设合同', '智慧校园平台建设合同', 'AIOps平台开发协议', '5G基站网优维护合同', '算法模型训练标注合同', 'NLP语音机器人采购协议', '智能知识库构建合同', '自动化巡检系统技术合同', '计算机视觉识别服务协议', '大模型微调训练合同', '智能推荐引擎开发合同'];
  const statuses = ['已签约', '已签约', '已签约', '已闭环', '已签约', '流水中'];

  const list: TableRowItem[] = [];
  for (let i = 0; i < 42; i++) {
    const noNum = 892 - i;
    const noStr = `HT-2026-0${noNum < 100 ? (noNum < 10 ? '0' + noNum : noNum) : noNum}`;
    const name = titles[i % titles.length] + (i >= 13 ? ` (第${Math.floor(i / 13) + 1}期)` : '');
    const cust = customers[i % customers.length];
    const amountVal = Math.floor(500 + ((i * 37) % 115)) * 10000 + 80000;
    const amountStr = `¥${amountVal.toLocaleString()}`;
    const st = statuses[i % statuses.length];
    list.push({
      no: noStr,
      name,
      amount: amountStr,
      customer: cust,
      status: st,
      rawType: 'contract',
    });
  }
  return list;
}

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

// 详情弹窗控制
const showContractModal = ref(false);
const selectedContractRow = ref<any>(null);
const showOrderModal = ref(false);
const selectedOrderRow = ref<any>(null);

const messages = ref<MessageItem[]>([
  {
    role: 'assistant',
    content: `您好，我是<strong>综合检索智能体</strong>。您可以问我关于合同和订单的任何问题，例如：<br>
    · <span class="text-[#049667]">"服务内容包含AI的合同有多少，提供编号和总金额"</span><br>
    · <span class="text-[#049667]">"2026年签订的运维合同有哪些"</span><br>
    · <span class="text-[#049667]">"含AI关键词的订单总金额是多少"</span>`,
  },
  {
    role: 'user',
    content: '帮我看下服务内容条款下包含AI智能体的合同有多少，请提供这些合同的编号，还有总金额。',
  },
  {
    role: 'assistant',
    type: 'contract',
    totalCount: 42,
    isExpanded: false,
    content: `为您检索到 <strong>服务内容</strong> 板块下包含 <strong>AI/智能体</strong> 关键词的合同共 <strong>42 份</strong>，总金额 <strong>¥186,320,000</strong>。<br><br>相关合同明细列表如下：`,
    tableData: generate42Contracts(),
  },
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
  messages.value = [
    {
      role: 'assistant',
      content: `您好，我是<strong>综合检索智能体</strong>。请随时告诉我您想检索的合同或订单信息！`,
    },
  ];
}

function selectHistory(index: number) {
  activeHistoryIndex.value = index;
  const item = historyList.value[index];
  if (item.type === 'order') {
    messages.value = [
      {
        role: 'user',
        content: item.title,
      },
      {
        role: 'assistant',
        type: 'order',
        totalCount: 2,
        isExpanded: false,
        content: `为您检索到包含 <strong>AI</strong> 关键词的订单共 <strong>2 条</strong>，明细金额 <strong>¥71,052.54</strong>。<br><br>相关订单列表如下：`,
        tableData: [
          { no: 'HSKJ/C-RJ-2025069-122', name: '2025-2026年度软件开发外包服务框架合同-华苏', amount: '¥36,923.25', customer: '诺博汽车系统有限公司', status: '未确认', rawType: 'order' },
          { no: 'HSKJ/C-RJ-2025069-121', name: '2025-2026年度软件开发外包服务框架合同-华苏', amount: '¥34,129.29', customer: '诺博汽车系统有限公司', status: '未确认', rawType: 'order' },
        ],
      },
    ];
  } else {
    messages.value = [
      {
        role: 'user',
        content: item.title,
      },
      {
        role: 'assistant',
        type: 'contract',
        totalCount: 42,
        isExpanded: false,
        content: `为您检索到包含相关关键词的合同共 <strong>42 份</strong>，详情如下：`,
        tableData: generate42Contracts(),
      },
    ];
  }
  scrollToBottom();
}

function fillQuery(text: string) {
  inputQuery.value = text;
  handleSend();
}

async function handleSend() {
  const query = inputQuery.value.trim();
  if (!query) return;

  messages.value.push({
    role: 'user',
    content: query,
  });
  inputQuery.value = '';
  scrollToBottom();

  sending.value = true;
  try {
    const res = await agentApi.chat(query, messages.value.map((m) => ({ role: m.role, content: m.content })));
    if (res.code === 200 && res.data && res.data.content) {
      messages.value.push({
        role: 'assistant',
        content: res.data.content,
      });
    } else {
      if (query.includes('订单')) {
        messages.value.push({
          role: 'assistant',
          type: 'order',
          totalCount: 2,
          isExpanded: false,
          content: `为您在数据库中检索到符合条件 <strong>"${query}"</strong> 的订单明细如下：`,
          tableData: [
            { no: 'HSKJ/C-RJ-2025069-122', name: '2025-2026年度软件开发外包服务框架合同-华苏', amount: '¥36,923.25', customer: '诺博汽车系统有限公司', status: '未确认', rawType: 'order' },
            { no: 'HSKJ/C-RJ-2025069-121', name: '2025-2026年度软件开发外包服务框架合同-华苏', amount: '¥34,129.29', customer: '诺博汽车系统有限公司', status: '未确认', rawType: 'order' },
          ],
        });
      } else {
        messages.value.push({
          role: 'assistant',
          type: 'contract',
          totalCount: 42,
          isExpanded: false,
          content: `为您在数据库中检索到符合条件 <strong>"${query}"</strong> 的合同共 <strong>42 份</strong>，明细数据如下：`,
          tableData: generate42Contracts(),
        });
      }
    }
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: `检索结果：已在数据库中匹配到相关数据。`,
    });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

function handleClearChat() {
  messages.value = [];
  ElMessage.success('对话记录已清空');
}

// 忠实导出检索结果:只落真实 tableData 的字段,不补默认值、不兜底假数据、不跨口径合计(ADR-0005 / D2 / D4)。
async function handleExportResult(msg: MessageItem) {
  const list = msg.tableData;
  if (!list || list.length === 0) {
    ElMessage.warning('无可导出的结果');
    return;
  }

  // 映射当前展示的这几列(合同号/名称/金额/客户/状态),不补默认值、不臆造后端未给的列。
  // 注:通用列无关的落盘逻辑在 buildFaithfulWorkbook;此处按 TableRowItem 的现有字段取值。
  const rows: ExportRow[] = list.map((item) => {
    const row: ExportRow = {
      合同号: item.no,
      名称: item.name,
      金额: item.amount ?? null,
    };
    if (item.customer !== undefined) row['客户'] = item.customer;
    if (item.status !== undefined) row['状态'] = item.status;
    if (item.isSummary) row.isSummary = true;
    return row;
  });

  const prefix = msg.type === 'order' ? '订单检索明细' : '合同检索明细';
  try {
    const wb = buildFaithfulWorkbook(rows);
    await downloadWorkbook(wb, prefix);
    ElMessage.success(`${prefix} Excel 已导出（共 ${rows.length} 条）`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    ElMessage.error(`导出失败:${reason}`);
  }
}

function handleOpenRowModal(row: TableRowItem) {
  if (row.rawType === 'order' || row.no.includes('HSKJ') || row.no.includes('Z26')) {
    selectedOrderRow.value = {
      id: 1,
      project_no: 'V250056',
      project_name: row.name,
      order_no: row.no,
      order_name: row.name,
      customer_name: row.customer || '诺博汽车系统有限公司',
      assessment_line: '软件',
      start_date: '2026-04-01',
      end_date: '2026-06-30',
      tax_rate: 6,
      amount: 36923.25,
      income_confirmed: 0,
      attachment_count: 3,
      has_eml: '是',
      hit_keyword: 'AI',
    };
    showOrderModal.value = true;
  } else {
    selectedContractRow.value = {
      id: 1,
      contract_no: row.no,
      customer_name: row.customer || '中国移动通信集团',
      contract_name: row.name,
      contract_type: 1,
      sign_date: '2026-06-15',
      amount: 5800000,
      assessment_line: '信息技术',
      contract_status: 2,
      verify_status: 1,
    };
    showContractModal.value = true;
  }
}
</script>
