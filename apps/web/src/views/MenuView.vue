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
import { ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MenuModal from '../components/modals/MenuModal.vue';

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

const menuList = ref<MenuItem[]>([
  {
    id: 1,
    name: '合同管理',
    type: '目录',
    path: '/contract',
    permission: '—',
    sort: 1,
    status: 1,
    children: [
      { id: 11, name: '├ 合同台账', type: '菜单', path: '/contract/ledger', permission: 'contract:ledger', sort: 1, status: 1 },
      { id: 12, name: '├ 智能体检索', type: '菜单', path: '/contract/search', permission: 'contract:search', sort: 2, status: 1 },
      { id: 13, name: '├ 关键词管理', type: '菜单', path: '/contract/keywords', permission: 'contract:keywords', sort: 3, status: 1 },
      { id: 14, name: '└ 模块配置', type: '菜单', path: '/contract/sections', permission: 'contract:sections', sort: 4, status: 1 },
    ],
  },
  {
    id: 2,
    name: '系统管理',
    type: '目录',
    path: '/system',
    permission: '—',
    sort: 2,
    status: 1,
    children: [
      { id: 21, name: '├ 菜单管理', type: '菜单', path: '/system/menu', permission: 'system:menu', sort: 1, status: 1 },
      { id: 22, name: '├ 首页配置', type: '菜单', path: '/system/homepage', permission: 'system:homepage', sort: 2, status: 1 },
      { id: 23, name: '├ 用户管理', type: '菜单', path: '/system/users', permission: 'system:users', sort: 3, status: 1 },
      { id: 24, name: '├ 角色管理', type: '菜单', path: '/system/roles', permission: 'system:roles', sort: 4, status: 1 },
      { id: 25, name: '├ 部门管理', type: '菜单', path: '/system/departments', permission: 'system:departments', sort: 5, status: 1 },
      { id: 26, name: '└ 我的部门', type: '菜单', path: '/system/my-department', permission: 'system:myDepartment', sort: 6, status: 1 },
    ],
  },
]);

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
  // refresh menu list if needed
}

function handleDelete(row: MenuItem) {
  ElMessageBox.confirm(`确定要删除菜单 "${row.name}" 吗？`, '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    ElMessage.success('删除成功');
  });
}
</script>
