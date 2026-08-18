<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo2.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">首页配置</h1>
          <p class="text-xs text-gray-500 mt-1">配置各角色/用户登录后的默认首页路由与首页组件</p>
        </div>
        <el-button type="primary" size="large" style="background-color: #049667; border-color: #049667;" @click="handleCreate">
          <el-icon class="mr-1"><Plus /></el-icon> 新增首页配置
        </el-button>
      </div>
    </div>

    <!-- 表格容器 -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="roleHomepageList" stripe style="width: 100%">
        <el-table-column prop="relationType" label="关联类型" width="120">
          <template #default="{ row }">
            <span class="tag" :class="row.relationType === '角色' ? 'tag-green' : (row.relationType === '用户' ? 'tag-blue' : 'tag-orange')">
              {{ row.relationType || '角色' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="roleName" label="关联目标" min-width="160">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ row.roleName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="route" label="首页路由" min-width="180">
          <template #default="{ row }">
            <span class="text-gray-500 font-mono text-xs">{{ row.route }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="component" label="组件地址" min-width="200">
          <template #default="{ row }">
            <span class="text-gray-500 font-mono text-xs">{{ row.component }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" align="center" />
        <el-table-column label="是否开启" width="100" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 1 ? 'tag-green' : 'tag-gray'">
              {{ row.status === 1 ? '开启' : '关闭' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(row)">
              编辑配置
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 1:1 还原截图的首页配置编辑 Modal 弹窗组件 -->
    <HomepageConfigModal
      v-model="showModal"
      :edit-data="currentEditData"
      @success="handleModalSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { homepageApi } from '../api';
import HomepageConfigModal from '../components/modals/HomepageConfigModal.vue';

interface HomepageItem {
  id: number;
  relationType: '角色' | '用户' | '全局默认';
  roleName: string;
  route: string;
  component: string;
  description: string;
  priority: number;
  status: number;
}

const showModal = ref(false);
const currentEditData = ref<HomepageItem | null>(null);

const roleHomepageList = ref<HomepageItem[]>([]);

async function loadData() {
  try {
    const res = await homepageApi.getList();
    if (res.code === 200) {
      roleHomepageList.value = (res.data || []).map((item: any) => ({
        id: item.id,
        relationType: item.relation_type,
        roleName: item.target_name || (item.relation_type === '全局默认' ? '全局默认首页' : ''),
        route: item.route,
        component: item.component,
        description: '',
        priority: item.priority,
        status: item.status,
      }));
    }
  } catch {
    roleHomepageList.value = [];
  }
}

onMounted(loadData);

function handleCreate() {
  currentEditData.value = null;
  showModal.value = true;
}

function handleEdit(row: HomepageItem) {
  currentEditData.value = row;
  showModal.value = true;
}

function handleModalSuccess() {
  loadData();
}
</script>
