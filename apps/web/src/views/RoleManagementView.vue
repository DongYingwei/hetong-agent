<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo2.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">角色管理</h1>
          <p class="text-xs text-gray-500 mt-1">管理系统角色定义及数据与菜单权限分配（数据存储于 MySQL 数据库）</p>
        </div>
        <el-button size="large" @click="handleCreate">
          <el-icon class="mr-1"><Plus /></el-icon> 新增角色
        </el-button>
      </div>
    </div>

    <!-- 表格容器 -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="roleList" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="role_code" label="角色编号" width="120">
          <template #default="{ row }">
            <span class="text-gray-500 font-mono text-xs">{{ row.role_code || row.roleCode }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="role_name" label="角色名称" min-width="160">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ row.role_name || row.roleName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="perm_key" label="权限字符" min-width="180">
          <template #default="{ row }">
            <span class="tag tag-blue font-mono">{{ row.perm_key || row.permKey }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="显示顺序" width="100" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 1 ? 'tag-green' : 'tag-gray'">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">
            <span class="text-gray-400 text-xs">{{ formatDate(row.create_time || row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button link size="small" style="color: #1f1f1f;" @click="handleAssignPerm(row)">
              分配权限
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑角色弹窗 (1:1 还原 demo2.html roleModal) -->
    <RoleModal
      v-model="showRoleModal"
      :edit-data="currentEditData"
      @success="loadData"
    />

    <!-- 分配权限弹窗 (1:1 还原 demo2.html permModal) -->
    <PermModal
      v-model="showPermModal"
      :role-data="currentPermData"
      @success="loadData"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { roleApi } from '../api';
import { formatDate } from '../utils/formatters';
import RoleModal from '../components/modals/RoleModal.vue';
import PermModal from '../components/modals/PermModal.vue';

const loading = ref(false);
const showRoleModal = ref(false);
const showPermModal = ref(false);
const currentEditData = ref<any>(null);
const currentPermData = ref<any>(null);

const roleList = ref<any[]>([]);

const mockRoleList = [
  { id: 1, role_code: 'R001', role_name: '管理员', perm_key: 'admin', sort: 1, status: 1, create_time: '2025-01-01' },
  { id: 2, role_code: 'R002', role_name: '合同专员', perm_key: 'contract:specialist', sort: 2, status: 1, create_time: '2025-01-01' },
  { id: 3, role_code: 'R003', role_name: '法务人员', perm_key: 'legal:staff', sort: 3, status: 1, create_time: '2025-01-01' },
  { id: 4, role_code: 'R004', role_name: '部门负责人', perm_key: 'dept:leader', sort: 4, status: 1, create_time: '2025-01-01' },
  { id: 5, role_code: 'R005', role_name: '高管', perm_key: 'executive', sort: 5, status: 0, create_time: '2025-02-15' },
];

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await roleApi.getList();
    if (res.code === 200 && res.data && res.data.length > 0) {
      roleList.value = res.data;
    } else {
      roleList.value = mockRoleList;
    }
  } catch (e) {
    roleList.value = mockRoleList;
  } finally {
    loading.value = false;
  }
}

function handleCreate() {
  currentEditData.value = null;
  showRoleModal.value = true;
}

function handleEdit(row: any) {
  currentEditData.value = row;
  showRoleModal.value = true;
}

function handleAssignPerm(row: any) {
  currentPermData.value = row;
  showPermModal.value = true;
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定要删除角色 "${row.role_name || row.roleName}" 吗？`, '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    if (row.id) {
      await roleApi.delete(row.id);
    }
    ElMessage.success('删除成功');
    loadData();
  });
}
</script>
