<template>
  <div>
    <!-- 头部渐变卡片 (1:1 还原 demo3.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">订单台账</h1>
          <p class="text-xs text-gray-500 mt-1">智能体自动抓取的订单数据</p>
        </div>
        <el-button
          type="primary"
          size="large"
          style="background-color: #049667; border-color: #049667;"
          @click="handleExport"
        >
          <el-icon class="mr-1"><Download /></el-icon> 导出Excel
        </el-button>
      </div>
    </div>

    <!-- 筛选区域 (1:1 还原 demo3.html) -->
    <div class="content-card mb-4 p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索订单编号、订单名称"
          clearable
          style="width: 260px"
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select
          v-model="filters.customerLine"
          placeholder="全部客户线"
          clearable
          style="width: 140px"
          @change="loadData"
        >
          <el-option label="运营商" value="运营商" />
          <el-option label="中兴" value="中兴" />
          <el-option label="软件" value="软件" />
          <el-option label="其他" value="其他" />
        </el-select>

        <el-select
          v-model="filters.orderType"
          placeholder="全部订单类型"
          clearable
          style="width: 140px"
          @change="loadData"
        >
          <el-option label="ARP" value="ARP" />
          <el-option label="ASP" value="ASP" />
        </el-select>

        <el-button @click="handleReset">重置</el-button>
      </div>
    </div>

    <!-- 数据表格 (1:1 还原 demo3.html 表头与固定列控制) -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="project_no" label="项目编号" width="120">
          <template #default="{ row }">
            <span class="text-[#049667] font-medium font-mono cursor-pointer hover:underline" @click="handleOpenDetail(row)">
              {{ row.project_no }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="project_name" label="项目名称" min-width="180" show-overflow-tooltip />

        <el-table-column prop="order_no" label="订单编号" min-width="180">
          <template #default="{ row }">
            <span class="text-[#049667] font-medium font-mono cursor-pointer hover:underline" @click="handleOpenDetail(row)">
              {{ row.order_no }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="order_name" label="订单名称" min-width="220" show-overflow-tooltip />

        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />

        <el-table-column prop="assessment_line" label="考核线" width="100" />

        <el-table-column label="订单开始日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.start_date) }}
          </template>
        </el-table-column>

        <el-table-column label="订单结束日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.end_date) }}
          </template>
        </el-table-column>

        <el-table-column label="明细税率(%)" width="110" align="right">
          <template #default="{ row }">
            {{ row.tax_rate ?? 6 }}%
          </template>
        </el-table-column>

        <el-table-column label="明细含税金额" width="140" align="right">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ formatCurrency(row.amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="收入确认标记" width="120" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.income_confirmed === 1 ? 'tag-green' : 'tag-orange'">
              {{ row.income_confirmed === 1 ? '已确认' : '未确认' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="attachment_count" label="附件数量" width="100" align="center" />

        <el-table-column prop="has_eml" label="含eml附件" width="100" align="center">
          <template #default="{ row }">
            <span>{{ row.has_eml || '否' }}</span>
          </template>
        </el-table-column>

        <!-- 命中关键词 (固定右侧) -->
        <el-table-column label="命中关键词" width="110" fixed="right" align="center">
          <template #default="{ row }">
            <span v-if="row.hit_keyword || (row.ai_keywords && row.ai_keywords.length > 0)" class="tag tag-green" style="font-size: 11px">
              {{ row.hit_keyword || (row.ai_keywords ? row.ai_keywords[0] : 'AI') }}
            </span>
            <span v-else class="text-gray-300 text-xs">—</span>
          </template>
        </el-table-column>

        <!-- 操作 (固定右侧) -->
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" style="color: #049667;" @click="handleOpenDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页区域 -->
      <div class="p-4 flex items-center justify-between border-t border-gray-100">
        <span class="text-xs text-gray-500">共 {{ total }} 条记录，当前第 {{ page }}/{{ Math.ceil(total / pageSize) || 1 }} 页</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          layout="prev, pager, next, sizes"
          :total="total"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </div>

    <!-- 订单详情弹框 (1:1 还原 demo3.html orderDetailModal) -->
    <OrderDetailModal
      v-model="showDetailModal"
      :order="currentOrder"
      @updated="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Search, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { orderApi } from '../api';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { OrderLedger } from '../types';
import OrderDetailModal from '../components/modals/OrderDetailModal.vue';

import { exportFullOrderLedgerExcel } from '../utils/excelExporter';

const loading = ref(false);
const showDetailModal = ref(false);
const currentOrder = ref<OrderLedger | null>(null);

const tableData = ref<OrderLedger[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const filters = reactive({
  keyword: '',
  customerLine: '',
  orderType: '',
});

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await orderApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      customerLine: filters.customerLine,
      orderType: filters.orderType,
    });
    if (res.code === 200) {
      tableData.value = res.data.list;
      total.value = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  filters.keyword = '';
  filters.customerLine = '';
  filters.orderType = '';
  page.value = 1;
  loadData();
}

function handleOpenDetail(row: OrderLedger) {
  currentOrder.value = row;
  showDetailModal.value = true;
}

async function handleExport() {
  if (!tableData.value || tableData.value.length === 0) {
    ElMessage.warning('当前暂无订单数据可导出');
    return;
  }
  await exportFullOrderLedgerExcel(tableData.value, '订单台账全量明细');
  ElMessage.success('🎉 订单台账 Excel 已成功生成并开始下载！');
}
</script>
