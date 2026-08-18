<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo2.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">菜单管理</h1>
          <p class="text-xs text-gray-500 mt-1">管理系统菜单结构、组件路由及权限标识配置</p>
        </div>
        <el-button size="large" @click="handleCreate">
          <el-icon class="mr-1"><Plus /></el-icon> 新增菜单
        </el-button>
      </div>
    </div>

    <!-- 表格容器 -->
    <div class="content-card p-0 overflow-hidden">
      <el-table
        :data="menuList"
        row-key="id"
        stripe
        style="width: 100%"
        :tree-props="{ children: 'children' }"
      >
        <el-table-column prop="name" label="菜单名称" min-width="180">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="菜单类型" width="100" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.type === '目录' ? 'tag-blue' : 'tag-green'">{{ row.type }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="组件路径" min-width="180">
          <template #default="{ row }">
            <span class="text-gray-500 font-mono text-xs">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="permission" label="权限标识" min-width="160">
          <template #default="{ row }">
            <span class="text-gray-400 font-mono text-xs">{{ row.permission }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="tag tag-green">{{ row.status === 1 ? '启用' : '禁用' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button v-if="row.type === '目录'" link size="small" style="color: #1f1f1f;" @click="handleCreateChild(row)">
              新增子菜单
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 1:1 还原的菜单配置 Modal 弹窗组件 -->
    <MenuModal
      v-model="showModal"
      :edit-data="currentEditData"
      :parent-data="currentParentData"
      @success="handleModalSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MenuModal from '../components/modals/MenuModal.vue';
import { menuApi } from '../api';

interface MenuItem {
  id: number;
  name: string;
  type: string;
  path: string;
  permission: string;
  sort: number;
  status: number;
  children?: MenuItem[];
}

const showModal = ref(false);
const currentEditData = ref<MenuItem | null>(null);
const currentParentData = ref<MenuItem | null>(null);

const menuList = ref<MenuItem[]>([]);

function toTree(list: any[]) {
  const nodes = new Map<number, MenuItem>();
  const roots: MenuItem[] = [];
  list.forEach((item) => nodes.set(item.id, { ...item, children: [] }));
  nodes.forEach((item: any) => {
    if (item.parent_id && nodes.has(item.parent_id)) nodes.get(item.parent_id)!.children!.push(item);
    else roots.push(item);
  });
  return roots;
}
async function loadData() {
  try {
    const res = await menuApi.getList();
    menuList.value = res.code === 200 && Array.isArray(res.data) ? toTree(res.data) : [];
  } catch { menuList.value = []; ElMessage.error('读取菜单列表失败'); }
}
onMounted(loadData);

function handleCreate() {
  currentEditData.value = null;
  currentParentData.value = null;
  showModal.value = true;
}

function handleCreateChild(row: MenuItem) {
  currentEditData.value = null;
  currentParentData.value = row;
  showModal.value = true;
}

function handleEdit(row: MenuItem) {
  currentParentData.value = null;
  currentEditData.value = row;
  showModal.value = true;
}

function handleModalSuccess() {
  loadData();
}

function handleDelete(row: MenuItem) {
  ElMessageBox.confirm(`确定要删除菜单 "${row.name}" 吗？`, '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await menuApi.delete(row.id);
    ElMessage.success('删除成功');
    loadData();
  });
}
</script>
