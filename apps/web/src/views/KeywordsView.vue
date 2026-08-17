<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo3.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">关键词管理</h1>
          <p class="text-xs text-gray-500 mt-1">管理命中关键词类别，当合同或订单中出现该类别下的词或语义时，即认定为命中该关键词</p>
        </div>
        <div class="flex gap-2">
        <el-button @click="showRescanModal = true">
          重新扫描关键词
        </el-button>
        <el-button
          size="large"
          @click="handleCreate"
        >
          <el-icon class="mr-1"><Plus /></el-icon> 新增关键词
        </el-button>
        </div>
      </div>
    </div>

    <!-- 筛选条件栏 (1:1 还原 demo3.html) -->
    <div class="content-card mb-4 p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索关键词"
          clearable
          style="width: 260px"
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select v-model="searchStatus" placeholder="全部状态" clearable style="width: 140px" @change="loadData">
          <el-option label="全部状态" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>

        <el-button @click="handleReset">重置</el-button>
      </div>
    </div>

    <!-- 关键词表格 (包含行展开展现子词 Tag 列表与加减交互) -->
    <div class="content-card p-0 overflow-hidden">
      <el-table
        :data="keywordList"
        v-loading="loading"
        stripe
        row-key="id"
        style="width: 100%"
      >
        <!-- 展开行：展示全量子词 Tags 列表 -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="bg-gray-50/90 px-6 py-4 border-y border-gray-100">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-semibold text-[#1A1A1A]">
                  {{ row.keyword_name }} - 包含子词（共 {{ row.sub_words?.length || 0 }} 个）
                </span>
                <el-button
                  link
                  size="small"
                  style="color: #1f1f1f;"
                  @click="openAddSubModal(row)"
                >
                  + 添加子词
                </el-button>
              </div>

              <div v-if="row.sub_words && row.sub_words.length > 0" class="flex flex-wrap gap-2">
                <span
                  v-for="(sub, sIdx) in row.sub_words"
                  :key="sIdx"
                  class="tag tag-blue inline-flex items-center gap-1.5 py-1 px-2.5"
                  style="font-size: 13px;"
                >
                  {{ sub }}
                  <el-icon
                    class="cursor-pointer text-blue-400 hover:text-red-500 text-xs transition-colors"
                    @click="handleRemoveSub(row, sub)"
                  >
                    <Close />
                  </el-icon>
                </span>
              </div>
              <div v-else class="text-xs text-gray-400 py-1">暂无子词，点击右上角【+ 添加子词】配置</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="keyword_name" label="关键词" min-width="120">
          <template #default="{ row }">
            <span class="font-semibold text-[#1A1A1A]">{{ row.keyword_name }}</span>
          </template>
        </el-table-column>

        <!-- 包含子词 (主表行直接明现蓝色 Tag 标签) -->
        <el-table-column label="包含子词" min-width="260">
          <template #default="{ row }">
            <div v-if="row.sub_words && row.sub_words.length > 0" class="flex flex-wrap gap-1.5 py-1">
              <span
                v-for="(sub, sIdx) in row.sub_words"
                :key="sIdx"
                class="tag tag-blue inline-flex items-center gap-1 py-0.5 px-2.5"
                style="font-size: 12px;"
              >
                {{ sub }}
                <el-icon
                  class="cursor-pointer text-blue-400 hover:text-red-500 text-[10px] transition-colors"
                  @click.stop="handleRemoveSub(row, sub)"
                >
                  <Close />
                </el-icon>
              </span>
            </div>
            <span v-else class="text-xs text-gray-400">暂无子词</span>
          </template>
        </el-table-column>

        <el-table-column label="子词数量" width="100" align="center">
          <template #default="{ row }">
            <span class="font-semibold text-[#303133]">{{ row.sub_words?.length ?? row.sub_count ?? 0 }}</span> 个
          </template>
        </el-table-column>

        <el-table-column prop="match_rules" label="匹配规则" min-width="200">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ row.match_rules || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 1 ? 'tag-green' : 'tag-gray'">
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link size="small" style="color: #1f1f1f;" @click="openAddSubModal(row)">
              + 添加子词
            </el-button>
            <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页控制 -->
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

    <!-- 新增/编辑主关键词 Modal -->
    <KeywordModal v-model="showKwModal" :edit-data="currentEditData" @success="loadData" />
    <RescanKeywordsModal v-model="showRescanModal" @success="loadData" />

    <!-- 新增/编辑子词 Modal -->
    <KwSubModal
      v-model="showSubModal"
      :keyword-id="currentMasterId"
      :keyword-name="currentMasterName"
      :existing-sub-words="currentExistingSubWords"
      @success="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Search, Close } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { keywordApi, type KeywordItem } from '../api';
import KeywordModal from '../components/modals/KeywordModal.vue';
import KwSubModal from '../components/modals/KwSubModal.vue';
import RescanKeywordsModal from '../components/modals/RescanKeywordsModal.vue';

const loading = ref(false);
const searchKeyword = ref('');
const searchStatus = ref<number | string>('');

const keywordList = ref<KeywordItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const showKwModal = ref(false);
const showSubModal = ref(false);
const currentEditData = ref<KeywordItem | null>(null);
const currentMasterId = ref<number | null>(null);
const currentMasterName = ref('');
const currentExistingSubWords = ref<string[]>([]);
const showRescanModal = ref(false);

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await keywordApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      status: searchStatus.value,
    });
    if (res.code === 200) {
      keywordList.value = res.data.list;
      total.value = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleReset() {
  searchKeyword.value = '';
  searchStatus.value = '';
  page.value = 1;
  loadData();
}

function handleCreate() {
  currentEditData.value = null;
  showKwModal.value = true;
}

function handleEdit(row: KeywordItem) {
  currentEditData.value = row;
  showKwModal.value = true;
}

function openAddSubModal(row: KeywordItem) {
  currentMasterId.value = row.id;
  currentMasterName.value = row.keyword_name;
  currentExistingSubWords.value = row.sub_words ? [...row.sub_words] : [];
  showSubModal.value = true;
}

async function handleRemoveSub(row: KeywordItem, subWord: string) {
  try {
    const res = await keywordApi.removeSubWord(row.id, subWord);
    if (res.code === 200) {
      ElMessage.success(`子词【${subWord}】已移除`);
      loadData();
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '移除失败');
  }
}

function handleDelete(id: number) {
  ElMessageBox.confirm('确定要删除该关键词及其包含的所有子词吗？', '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await keywordApi.delete(id);
    ElMessage.success('删除成功');
    loadData();
  });
}
</script>
