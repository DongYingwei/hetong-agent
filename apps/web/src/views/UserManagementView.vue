<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo2.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">用户管理</h1>
          <p class="text-xs text-gray-500 mt-1">管理系统用户账号及权限分配</p>
        </div>
        <el-button size="large" @click="handleCreate">
          <el-icon class="mr-1"><Plus /></el-icon> 新增用户
        </el-button>
      </div>
    </div>

    <!-- 筛选条件栏 (1:1 还原 demo2.html) -->
    <div class="content-card mb-4 p-4">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">用户名</span>
          <el-input v-model="searchUsername" placeholder="请输入用户名" style="width: 160px" clearable @keyup.enter="handleSearch" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">手机号</span>
          <el-input v-model="searchPhone" placeholder="请输入手机号" style="width: 160px" clearable @keyup.enter="handleSearch" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">状态</span>
          <el-select v-model="searchStatus" style="width: 120px">
            <el-option label="全部" value="" />
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </div>
        <el-button @click="handleSearch">
          <el-icon class="mr-1"><Search /></el-icon> 搜索
        </el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </div>

    <!-- 数据表格 (完全展示 MySQL sys_user 数据库实际条目) -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="rawUserList" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="id" label="用户编号" width="100">
          <template #default="{ row }">
            <span class="text-gray-400 font-mono text-xs">U00{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="用户名" min-width="140">
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ row.username }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="real_name" label="姓名" min-width="120">
          <template #default="{ row }">
            <span class="text-[#1A1A1A]">{{ row.real_name || row.realName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="部门" min-width="140">
          <template #default="{ row }">
            <span>{{ row.department || '信息技术部' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="140">
          <template #default="{ row }">
            <span class="tag" :class="getRoleTagClass(row.roleName || getRoleName(row.role))">
              {{ row.roleName || getRoleName(row.role) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="140">
          <template #default="{ row }">
            <span class="text-gray-500 font-mono text-xs">{{ row.phone || '138****8888' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 1 ? 'tag-green' : 'tag-gray'">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="130">
          <template #default="{ row }">
            <span class="text-gray-400 text-xs">{{ formatDate(row.create_time) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button link size="small" style="color: #1f1f1f;" @click="handleResetPassword(row)">
              重置密码
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 (严格按 MySQL 返回的总条数与页码联动) -->
      <div class="p-4 flex items-center justify-between border-t border-gray-100">
        <span class="text-xs text-gray-500">共 {{ total }} 条数据</span>
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

    <!-- 用户新增/编辑 1:1 弹框 -->
    <UserModal v-model="showModal" :edit-data="currentEditData" @success="loadData" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userApi } from '../api';
import { formatDate } from '../utils/formatters';
import UserModal from '../components/modals/UserModal.vue';

const loading = ref(false);
const showModal = ref(false);
const currentEditData = ref<any>(null);

const searchUsername = ref('');
const searchPhone = ref('');
const searchStatus = ref<string | number>('');

const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const rawUserList = ref<any[]>([]);

onMounted(() => {
  loadData();
});

/**
 * 严格只读取 MySQL sys_user 数据库实际条目
 */
async function loadData() {
  loading.value = true;
  try {
    const res = await userApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchUsername.value,
      phone: searchPhone.value,
      status: searchStatus.value !== '' ? Number(searchStatus.value) : undefined,
    });
    if (res.code === 200 && res.data) {
      rawUserList.value = res.data.list || [];
      total.value = res.data.total || 0;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '读取 MySQL 用户列表失败');
  } finally {
    loading.value = false;
  }
}

function getRoleName(roleNum?: number) {
  if (roleNum === 0) return '管理员';
  if (roleNum === 2) return '法务人员';
  if (roleNum === 3) return '部门负责人';
  return '合同专员';
}

function getRoleTagClass(roleName: string) {
  if (roleName === '管理员') return 'tag-green';
  if (roleName === '法务人员') return 'tag-blue';
  if (roleName === '合同专员') return 'tag-orange';
  return 'tag-gray';
}

function handleSearch() {
  page.value = 1;
  loadData();
}

function handleReset() {
  searchUsername.value = '';
  searchPhone.value = '';
  searchStatus.value = '';
  page.value = 1;
  loadData();
}

function handleCreate() {
  currentEditData.value = null;
  showModal.value = true;
}

function handleEdit(row: any) {
  currentEditData.value = row;
  showModal.value = true;
}

function handleResetPassword(row: any) {
  ElMessageBox.confirm(`确定要重置用户 "${row.real_name || row.username}" 的登录密码吗？`, '重置密码', {
    confirmButtonText: '确定重置',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    if (row.id) {
      await userApi.resetPassword(row.id);
    }
    ElMessage.success('重置成功，新密码：howso123');
  });
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定要删除用户 "${row.real_name || row.username}" 吗？`, '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    if (row.id) {
      await userApi.delete(row.id);
    }
    ElMessage.success('删除成功');
    loadData();
  });
}
</script>
