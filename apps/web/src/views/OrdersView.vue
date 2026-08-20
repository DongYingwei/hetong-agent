<template>
  <div>
    <!-- 头部渐变卡片 (1:1 还原 demo3.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">订单台账</h1>
          <p class="text-xs text-gray-500 mt-1">智能体自动抓取的订单数据</p>
        </div>
        <el-button size="large" @click="handleExport">
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
          v-for="module in modules"
          :key="module.module_key"
          v-model="moduleFilters[module.module_key]"
          :placeholder="module.name"
          clearable
          style="width: 140px"
          @change="loadData"
        >
          <el-option
            v-for="item in keywordOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-button type="primary" @click="loadData">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </div>

    <!-- 数据表格 (1:1 还原 demo3.html 表头与固定列控制) -->
    <div class="content-card p-0 overflow-hidden">
      <el-table
        :data="tableData"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="project_no" label="项目编号" width="120">
          <template #default="{ row }">
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="font-medium font-mono cursor-pointer hover:underline"
                @click="handleOpenDetail(row)"
                >{{ row.project_no }}</span
              >
              <el-tooltip
                v-if="row.name_mismatch === 1 || row.name_mismatch === true"
                content="数据源标记：订单名称与实际内容不符"
                placement="top"
              >
                <span
                  class="inline-flex text-[#DC2626] shrink-0"
                  aria-label="订单名称不符"
                  >⚠</span
                >
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          prop="project_name"
          label="项目名称"
          min-width="180"
          show-overflow-tooltip
        />

        <el-table-column prop="order_no" label="订单编号" min-width="180">
          <template #default="{ row }">
            <span
              class="font-medium font-mono cursor-pointer hover:underline"
              @click="handleOpenDetail(row)"
            >
              {{ row.order_no }}
            </span>
          </template>
        </el-table-column>

        <el-table-column
          prop="order_name"
          label="订单名称"
          min-width="220"
          show-overflow-tooltip
        />

        <el-table-column
          prop="customer_name"
          label="客户名称"
          min-width="160"
          show-overflow-tooltip
        />

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
          <template #default="{ row }"> {{ formatTaxRate(row.detail_tax_rate ?? row.tax_rate) }}% </template>
        </el-table-column>

        <el-table-column label="明细含税金额" width="140" align="right">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{
              formatCurrency(row.amount)
            }}</span>
          </template>
        </el-table-column>

        <el-table-column label="收入确认标记" width="120" align="center">
          <template #default="{ row }">
            <span
              class="tag"
              :class="row.income_confirmed === 1 ? 'tag-green' : 'tag-orange'"
            >
              {{ row.income_confirmed === 1 ? "已确认" : "未确认" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column
          prop="attachment_count"
          label="附件数量"
          width="100"
          align="center"
        />

        <el-table-column
          prop="has_eml"
          label="含eml附件"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <span>{{ row.has_eml || "否" }}</span>
          </template>
        </el-table-column>

        <el-table-column
          v-for="module in modules"
          :key="module.module_key"
          :label="module.name"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <span
              v-if="moduleHit(row, module.module_key)"
              class="tag tag-green"
              style="font-size: 11px"
              >AI</span
            >
            <span v-else class="text-gray-300 text-xs">—</span>
          </template>
        </el-table-column>

        <!-- 操作 (固定右侧) -->
        <el-table-column label="操作" width="130" fixed="right" align="center">
          <template #default="{ row }">
            <div class="flex justify-center gap-2">
              <el-button link size="small" style="color: #1f1f1f" @click="handleOpenDetail(row)">详情</el-button>
              <el-button link size="small" type="primary" @click="handleEdit(row)">编辑</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页区域 -->
      <div
        class="p-4 flex items-center justify-between border-t border-gray-100"
      >
        <span class="text-xs text-gray-500"
          >共 {{ total }} 条记录，当前第 {{ page }}/{{
            Math.ceil(total / pageSize) || 1
          }}
          页</span
        >
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
      :start-editing="detailStartEditing"
      @updated="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { Search, Download } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { orderApi, keywordApi, type KeywordItem } from "../api";
import { buildModuleFilters } from "../utils/moduleAi";
import { fetchAllFilteredPages } from "../utils/paginatedExport";
import { formatCurrency, formatDate } from "../utils/formatters";
import type { OrderLedger } from "../types";
import OrderDetailModal from "../components/modals/OrderDetailModal.vue";

import { exportFullOrderLedgerExcel } from "../utils/excelExporter";

const loading = ref(false);
const showDetailModal = ref(false);
const currentOrder = ref<OrderLedger | null>(null);
const detailStartEditing = ref(false);

const tableData = ref<OrderLedger[]>([]);
/**
 * 订单解析和筛选的业务口径固定为四个模块。
 * 订单台账不应因为模块配置接口不可用、改名或调整适配范围而丢失筛选条件。
 */
const modules = [
  { module_key: "role", name: "项目名称" },
  { module_key: "service", name: "服务内容" },
  { module_key: "tech", name: "技术要求" },
  { module_key: "staff", name: "人员需求" },
] as const;
const moduleFilters = reactive<Record<string, string>>(
  Object.fromEntries(modules.map((module) => [module.module_key, ""])),
);

function moduleHit(row: OrderLedger, key: string) {
  return !!row.module_hits?.some((x) => x.module_key === key && x.hit === 1);
}
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const filters = reactive({
  keyword: "",
});
const keywordOptions = ref<Array<{ label: string; value: string }>>([]);
const keywordTerms = new Map<string, string[]>();

/** 关键词仍由关键词管理提供；失败不影响四个固定筛选项和订单列表。 */
async function loadKeywordOptions() {
  try {
    const response = await keywordApi.getList({ page: 1, pageSize: 200 });
    if (response.code !== 200) return;
    response.data.list.forEach((item: KeywordItem) =>
      keywordTerms.set(item.keyword_name, [
        item.keyword_name,
        ...(item.sub_words || []),
      ]),
    );
    keywordOptions.value = response.data.list.map((item: KeywordItem) => ({
      label: item.keyword_name,
      value: item.keyword_name,
    }));
  } catch {
    // request 拦截器负责提示；固定模块筛选无需降级处理。
  }
}

onMounted(() => {
  // 首屏订单列表与关键词选项独立，四个模块不依赖远端配置。
  void loadData();
  void loadKeywordOptions();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await orderApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      moduleFilters: buildModuleFilters(moduleFilters, keywordTerms),
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
  filters.keyword = "";
  Object.keys(moduleFilters).forEach((key) => {
    moduleFilters[key] = "";
  });
  page.value = 1;
  loadData();
}

function handleOpenDetail(row: OrderLedger) {
  detailStartEditing.value = false;
  currentOrder.value = row;
  showDetailModal.value = true;
}
function handleEdit(row: OrderLedger) {
  detailStartEditing.value = true;
  currentOrder.value = row;
  showDetailModal.value = true;
}

function formatTaxRate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const rate = Number(value);
  return Number.isFinite(rate) ? rate.toFixed(4) : String(value);
}

async function handleExport() {
  loading.value = true;
  try {
    const activeFilters = buildModuleFilters(moduleFilters, keywordTerms);
    const rows = await fetchAllFilteredPages(async (exportPage, exportPageSize) => {
      const res = await orderApi.getList({
        page: exportPage,
        pageSize: exportPageSize,
        keyword: filters.keyword,
        moduleFilters: activeFilters,
      });
      if (res.code !== 200) throw new Error(res.msg || "读取订单导出数据失败");
      return res.data;
    });

    if (!rows.length) {
      ElMessage.warning("当前筛选条件下暂无订单数据可导出");
      return;
    }
    await exportFullOrderLedgerExcel(rows, "订单台账全量明细");
    ElMessage.success(`🎉 已导出 ${rows.length} 条订单台账数据！`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "订单台账导出失败");
  } finally {
    loading.value = false;
  }
}
</script>
