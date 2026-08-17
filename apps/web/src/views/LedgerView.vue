<template>
  <div>
    <!-- 头部渐变卡片 (1:1 还原 demo.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">合同台账</h1>
          <p class="text-xs text-gray-500 mt-1">管理全部合同台账及AI识别结果</p>
        </div>
        <div class="flex gap-2">
          <el-button size="large" @click="showImportModal = true">
            <el-icon class="mr-1"><Upload /></el-icon> 导入合同
          </el-button>
        </div>
      </div>
    </div>

    <!-- 筛选区域 (1:1 还原 demo.html) -->
    <div class="content-card mb-4 p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索合同号、客户名称、合同名称"
          clearable
          style="width: 220px"
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select v-model="filters.contractStatus" placeholder="合同状态" clearable style="width: 130px" @change="loadData">
          <el-option
            v-for="item in dictStore.dictMap.contract_status"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-select v-model="filters.contractType" placeholder="合同类型" clearable style="width: 130px" @change="loadData">
          <el-option
            v-for="item in dictStore.dictMap.contract_type"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-select v-model="filters.verifyStatus" placeholder="核对状态" clearable style="width: 130px" @change="loadData">
          <el-option
            v-for="item in dictStore.dictMap.verify_status"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <!-- 查询库 contract_modules 动态驱动，筛选命中该模块的合同。 -->
        <el-select v-model="filters.moduleKey" placeholder="AI命中模块" clearable style="width: 150px" @change="loadData">
          <el-option v-for="module in modules" :key="module.module_key" :label="module.name" :value="module.module_key" />
        </el-select>

        <el-button @click="handleReset">重置</el-button>

        <div class="ml-auto">
          <el-button @click="handleExport">
            <el-icon class="mr-1"><Download /></el-icon> 导出Excel
          </el-button>
        </div>
      </div>
    </div>

    <!-- 数据表格 (1:1 还原 demo.html 列名与操作控制) -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="contract_no" label="合同号" width="150">
          <template #default="{ row }">
            <span class="font-medium cursor-pointer hover:underline font-mono" @click="goToDetail(row.id)">
              {{ row.contract_no }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="contract_name" label="合同名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="合同类型" width="120">
          <template #default="{ row }">
            {{ dictStore.getLabel('contract_type', row.contract_type) }}
          </template>
        </el-table-column>
        <el-table-column label="签约时间" width="120">
          <template #default="{ row }">
            {{ formatDate(row.sign_date) }}
          </template>
        </el-table-column>
        <el-table-column label="合同金额(含税)" width="140" align="right">
          <template #default="{ row }">
            {{ formatCurrency(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="assessment_line" label="考核线" width="90" />
        <el-table-column label="合同状态" width="110" align="center">
          <template #default="{ row }">
            <span class="tag tag-green">{{ dictStore.getLabel('contract_status', row.contract_status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="核对状态" width="110" align="center">
          <template #default="{ row }">
            <span
              class="tag cursor-pointer"
              :class="row.verify_status === 1 ? 'tag-green' : (row.verify_status === 2 ? 'tag-red' : 'tag-orange')"
              @click="handleVerifyClick(row)"
            >
              {{ dictStore.getLabel('verify_status', row.verify_status) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="断档预警" width="130" align="center">
          <template #default="{ row }">
            <span v-if="!row.warning_status || row.warning_status === 0" class="text-gray-400 text-xs">—</span>
            <span
              v-else-if="row.warning_status === 1"
              class="tag tag-blue"
              title="系统自动识别合同到期时间，在到期前4个月推送预警"
            >
              到期前4个月
            </span>
            <span
              v-else-if="row.warning_status === 2"
              class="tag tag-orange"
              title="系统自动识别合同到期时间，在到期前3个月推送预警"
            >
              到期前3个月
            </span>
            <span
              v-else-if="row.warning_status === 3"
              class="tag tag-orange"
              style="color: #d97706; background-color: #fef3c7;"
              title="系统自动识别合同到期时间，在到期前2个月推送预警"
            >
              到期前2个月
            </span>
            <span
              v-else-if="row.warning_status === 4"
              class="tag tag-red"
              title="系统自动识别合同到期时间，在到期前1个月推送预警"
            >
              到期前1个月
            </span>
          </template>
        </el-table-column>

        <!-- 动态模块命中列：只展示查询库 contract_module_hits，不生成假关键词。 -->
        <el-table-column v-for="module in modules" :key="module.module_key" :label="module.name" width="120" align="center">
          <template #default="{ row }">
            <span v-if="moduleHitText(row, module.module_key)" class="tag tag-green" style="font-size: 11px;">
              {{ moduleHitText(row, module.module_key) }}
            </span>
            <span v-else class="text-gray-300 text-xs">—</span>
          </template>
        </el-table-column>

        <!-- 操作列 (1:1 还原规则: 未核对更多只有删除; 已核对更多有原文件, 编辑, 删除) -->
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              style="color: #1f1f1f;"
              @click="handleActionClick(row)"
            >
              {{ row.verify_status === 1 ? '查看' : '核对' }}
            </el-button>

            <el-dropdown trigger="click">
              <span class="text-[#1f1f1f] cursor-pointer ml-2 text-xs">更多</span>
              <template #dropdown>
                <el-dropdown-menu>
                  <!-- 未核对：更多只有【删除】 -->
                  <template v-if="row.verify_status !== 1">
                    <el-dropdown-item style="color: #F56C6C;" @click="handleDelete(row.id)">删除</el-dropdown-item>
                  </template>

                  <!-- 已核对：更多包含【原文件】、【编辑】、【删除】 -->
                  <template v-else>
                    <el-dropdown-item @click="goToCompare(row.id)">原文件</el-dropdown-item>
                    <el-dropdown-item @click="handleOpenEditModal(row)">编辑</el-dropdown-item>
                    <el-dropdown-item divided style="color: #F56C6C;" @click="handleDelete(row.id)">删除</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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

    <!-- 导入合同弹框组件 -->
    <ImportContractModal v-model="showImportModal" @success="loadData" />

    <!-- 编辑合同弹框组件 (demo.html 1:1 还原) -->
    <EditContractModal v-model="showEditModal" :edit-data="currentEditRow" @success="loadData" />

    <!-- 查看合同核对信息弹框 (1:1 还原 demo2.html viewModal) -->
    <ContractViewModal
      v-model="showViewModal"
      :contract-data="currentViewRow"
      @edit="handleOpenEditModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Upload, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { contractApi, type ContractModule } from '../api/contractApi';
import { useDictStore } from '../stores/dictStore';
import { formatCurrency, formatDate } from '../utils/formatters';
import { exportFullContractLedgerExcel } from '../utils/excelExporter';
import type { ContractLedger } from '../types';
import ImportContractModal from '../components/modals/ImportContractModal.vue';
import EditContractModal from '../components/modals/EditContractModal.vue';
import ContractViewModal from '../components/modals/ContractViewModal.vue';

const router = useRouter();
const dictStore = useDictStore();

const loading = ref(false);
const showImportModal = ref(false);
const showEditModal = ref(false);
const currentEditRow = ref<ContractLedger | null>(null);
const showViewModal = ref(false);
const currentViewRow = ref<ContractLedger | null>(null);

const tableData = ref<ContractLedger[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const modules = ref<ContractModule[]>([]);

const filters = reactive({
  keyword: '',
  contractStatus: '',
  contractType: '',
  hasAiKeyword: '',
  verifyStatus: '',
  moduleKey: '',
});

onMounted(async () => {
  try {
    const res = await contractApi.getModules();
    if (res.code === 200) modules.value = res.data.list;
  } finally {
    loadData();
  }
});

async function loadData() {
  loading.value = true;
  try {
    const res = await contractApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      contractStatus: filters.contractStatus,
      contractType: filters.contractType,
      hasAiKeyword: filters.hasAiKeyword,
      verifyStatus: filters.verifyStatus,
      moduleKey: filters.moduleKey,
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
  filters.contractStatus = '';
  filters.contractType = '';
  filters.hasAiKeyword = '';
  filters.verifyStatus = '';
  filters.moduleKey = '';
  page.value = 1;
  loadData();
}

function moduleHitText(row: ContractLedger, moduleKey: string): string {
  const hit = row.module_hits?.find((item) => item.module_key === moduleKey && item.hit === 1);
  return hit?.keywords || (hit ? '命中' : '');
}

function goToDetail(id: number) {
  router.push(`/detail/${id}`);
}

function goToCompare(id: number) {
  router.push(`/compare?id=${id}`);
}

function handleOpenEditModal(row: ContractLedger) {
  currentEditRow.value = row;
  showEditModal.value = true;
}

function handleVerifyClick(row: ContractLedger) {
  if (row.verify_status === 1) {
    router.push({ path: '/verify', query: { id: String(row.id), readonly: 'true' } });
  } else {
    // 未核对：进行人工核对
    router.push({ path: '/verify', query: { id: String(row.id) } });
  }
}

function handleActionClick(row: ContractLedger) {
  if (row.verify_status === 1) {
    router.push({ path: '/verify', query: { id: String(row.id), readonly: 'true' } });
  } else {
    // 未核对：进行人工核对
    router.push({ path: '/verify', query: { id: String(row.id) } });
  }
}

function handleDelete(id: number) {
  // 1:1 还原 demo.html deleteModal 弹窗文案与逻辑
  ElMessageBox.confirm(
    '删除后合同数据将移入回收站，30天内可恢复。合同原件文件不受影响。',
    '确定要删除这份合同吗？',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    await contractApi.delete(id);
    ElMessage.success('删除成功');
    loadData();
  });
}

async function handleExport() {
  await exportFullContractLedgerExcel(tableData.value, '合同台账全量明细');
  ElMessage.success('导出成功');
}
</script>
