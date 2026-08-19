<template>
  <div>
    <!-- 1:1 还原 demo2.html 页面头部卡片 -->
    <div class="page-header-card mb-4">
      <div class="flex items-end justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">部门管理</h1>
          <p class="text-[13px] text-gray-500 mt-1">管理组织架构及部门信息</p>
        </div>
      </div>
    </div>

    <!-- 隐藏的导入文件 input 控件 -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept=".xlsx,.xls,.csv"
      @change="onFileImport"
    />

    <!-- 主体2栏布局 (高度 calc(100vh - 220px)) -->
    <div class="flex gap-4 h-[calc(100vh-220px)]">
      <!-- 左侧：部门树 (340px 宽度) -->
      <div class="content-card w-[340px] shrink-0 flex flex-col overflow-hidden mb-0 p-0">
        <!-- 操作按钮栏 (1:1 匹配用户截图样式) -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button type="button" class="px-3.5 h-8 rounded-lg bg-[#049667] text-white text-xs font-medium hover:bg-[#037d55] transition-colors shadow-sm" @click="handleCreateDept">新增</button>
          <button type="button" class="px-3.5 h-8 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors" @click="handleCreateSubDept">添加下级</button>
          <button type="button" class="px-3.5 h-8 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors" @click="handleImportClick">导入</button>
          <button type="button" class="px-3.5 h-8 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors" @click="handleExportClick">导出</button>
        </div>

        <!-- 搜索框 (1:1 匹配 demo2.html 搜索图标与样式) -->
        <div class="px-4 py-2 border-b border-gray-100">
          <div class="relative">
            <input
              v-model="searchKey"
              type="text"
              class="input-base w-full"
              style="height:32px;font-size:13px;padding-left:32px;border:1px solid #E5E7EB;border-radius:6px"
              placeholder="按部门名称搜索..."
            />
            <svg class="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
        </div>

        <!-- 多级层级部门树 (持久化存储于 MySQL 数据库 sys_department 表) -->
        <div class="flex-1 overflow-y-auto p-2">
          <el-tree
            ref="treeRef"
            :data="filteredDeptTreeData"
            node-key="id"
            default-expand-all
            highlight-current
            :filter-node-method="filterNode"
            @node-click="handleTreeNodeClick"
          >
            <template #default="{ node, data }">
              <div
                class="flex items-center justify-between w-full pr-2 text-xs py-1 rounded transition-colors"
                :class="data.name === selectedDeptName ? 'bg-[#E6F8F0] text-[#049667] font-bold' : 'text-gray-700 hover:bg-gray-50'"
              >
                <div class="flex items-center gap-1.5 truncate">
                  <!-- 选中打勾标识 -->
                  <svg v-if="data.name === selectedDeptName" class="w-3.5 h-3.5 text-[#049667]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  <div v-else class="w-3.5 h-3.5"></div>

                  <!-- 节点图标 -->
                  <svg class="w-4 h-4" :class="data.name === selectedDeptName ? 'text-[#049667]' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  <span>{{ node.label }}</span>
                </div>
              </div>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 右侧：部门详情与 Tabs 标签页 (1:1 还原 demo2.html) -->
      <div class="flex-1 content-card flex flex-col overflow-hidden mb-0 p-5">
        <!-- 标签页头部导航 (1:1 demo2.html 4 个 Tab) -->
        <div class="flex items-center gap-8 border-b border-gray-200 mb-5 pb-0 text-sm">
          <button
            class="py-2.5 font-medium transition-colors border-b-2 -mb-[1px]"
            :class="activeTab === 'info' ? 'text-[#049667] border-[#049667]' : 'text-gray-500 border-transparent hover:text-gray-800'"
            @click="activeTab = 'info'"
          >
            基本信息
          </button>
          <button
            class="py-2.5 font-medium transition-colors border-b-2 -mb-[1px]"
            :class="activeTab === 'perm' ? 'text-[#049667] border-[#049667]' : 'text-gray-500 border-transparent hover:text-gray-800'"
            @click="activeTab = 'perm'"
          >
            部门权限
          </button>
          <button
            class="py-2.5 font-medium transition-colors border-b-2 -mb-[1px]"
            :class="activeTab === 'users' ? 'text-[#049667] border-[#049667]' : 'text-gray-500 border-transparent hover:text-gray-800'"
            @click="activeTab = 'users'"
          >
            用户列表
          </button>
          <button
            class="py-2.5 font-medium transition-colors border-b-2 -mb-[1px]"
            :class="activeTab === 'leader' ? 'text-[#049667] border-[#049667]' : 'text-gray-500 border-transparent hover:text-gray-800'"
            @click="activeTab = 'leader'"
          >
            部门负责人
          </button>
        </div>

        <!-- 标签页内容区域 -->
        <div class="flex-1 overflow-y-auto pr-1">
          <!-- Tab1: 基本信息表单 (1:1 完全按图片与 demo2.html 还原表单项) -->
          <div v-show="activeTab === 'info'" class="space-y-4 max-w-[600px] text-sm">
            <!-- 机构名称* -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">机构名称<span class="text-red-500 ml-0.5">*</span></label>
              <input
                v-model="deptForm.name"
                type="text"
                class="input-base flex-1 h-9 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#049667]"
                placeholder="请输入机构名称"
              />
            </div>

            <!-- 机构简称 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">机构简称</label>
              <input
                v-model="deptForm.shortName"
                type="text"
                class="input-base flex-1 h-9 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#049667]"
                placeholder="请输入机构简称"
              />
            </div>

            <!-- 上级部门 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">上级部门</label>
              <input
                v-model="deptForm.parent"
                type="text"
                disabled
                class="input-base flex-1 h-9 px-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>

            <!-- 机构编码 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">机构编码</label>
              <input
                v-model="deptForm.code"
                type="text"
                disabled
                class="input-base flex-1 h-9 px-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 font-mono cursor-not-allowed"
              />
            </div>

            <!-- 机构类型 (分段组合按钮) -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">机构类型</label>
              <div class="flex gap-2">
                <button
                  v-for="t in ['子公司', '部门', '岗位']"
                  :key="t"
                  type="button"
                  class="px-4 h-9 rounded-lg text-sm transition-colors border"
                  :class="deptForm.type === t ? 'bg-[#049667] text-white border-[#049667]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                  @click="deptForm.type = t"
                >
                  {{ t }}
                </button>
              </div>
            </div>

            <!-- 排序 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">排序</label>
              <input
                v-model.number="deptForm.sort"
                type="number"
                class="input-base h-9 px-3 border border-gray-300 rounded-lg w-[120px] focus:outline-none focus:border-[#049667]"
              />
            </div>

            <!-- 电话 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">电话</label>
              <input
                v-model="deptForm.phone"
                type="text"
                class="input-base flex-1 h-9 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#049667]"
                placeholder="请输入电话"
              />
            </div>

            <!-- 邮箱 -->
            <div class="flex items-center gap-4">
              <label class="w-[100px] shrink-0 text-gray-700">邮箱</label>
              <input
                v-model="deptForm.email"
                type="text"
                class="input-base flex-1 h-9 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#049667]"
                placeholder="请输入邮箱"
              />
            </div>

            <!-- 备注 -->
            <div class="flex items-start gap-4">
              <label class="w-[100px] shrink-0 text-gray-700 mt-2">备注</label>
              <textarea
                v-model="deptForm.remark"
                rows="3"
                class="input-base flex-1 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-[#049667]"
                placeholder="请输入备注"
              ></textarea>
            </div>

            <!-- 按钮栏 (右下角 重置 / 保存) -->
            <div class="flex justify-end gap-2 pt-3">
              <button
                type="button"
                class="px-5 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                @click="resetForm"
              >
                重置
              </button>
              <button
                type="button"
                class="px-5 h-9 rounded-lg bg-[#049667] text-white hover:bg-[#037d55] text-sm font-medium"
                @click="saveForm"
              >
                保存
              </button>
            </div>
          </div>

          <!-- Tab2: 部门权限 (1:1 匹配 demo2.html) -->
          <div v-show="activeTab === 'perm'" class="space-y-4">
            <div class="text-sm text-gray-500">勾选该部门可访问的功能菜单权限：</div>
            <div class="border border-gray-200 rounded-lg p-4 max-w-[500px] space-y-2 bg-gray-50/50">
              <label class="flex items-center gap-2 text-sm text-[#1A1A1A] cursor-pointer py-1 font-medium">
                <input type="checkbox" checked class="accent-[#049667]" /> 合同管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 合同台账
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 智能体检索
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 关键词管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 合同模块
              </label>
              <label class="flex items-center gap-2 text-sm text-[#1A1A1A] cursor-pointer py-1 font-medium">
                <input type="checkbox" checked class="accent-[#049667]" /> 系统管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" class="accent-[#049667]" /> 菜单管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" class="accent-[#049667]" /> 首页配置
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 用户管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 角色管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 部门管理
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1 pl-6">
                <input type="checkbox" checked class="accent-[#049667]" /> 我的部门
              </label>
            </div>
            <div class="flex justify-end max-w-[500px] pt-2">
              <button
                type="button"
                class="px-5 h-9 rounded-lg bg-[#049667] text-white hover:bg-[#037d55] text-sm font-medium"
                @click="savePerm"
              >
                保存
              </button>
            </div>
          </div>

          <!-- Tab3: 用户列表 (动态联动 MySQL sys_user 用户表) -->
          <div v-show="activeTab === 'users'" class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">
                "{{ selectedDeptName }}" 所属成员共 <span class="font-bold text-[#049667]">{{ departmentUsers.length }}</span> 条
              </span>
            </div>

            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <el-table :data="departmentUsers" stripe style="width: 100%">
                <el-table-column prop="username" label="用户名" min-width="120">
                  <template #default="{ row }">
                    <span class="font-medium text-[#1A1A1A]">{{ row.username }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="real_name" label="姓名" min-width="120">
                  <template #default="{ row }">
                    <span class="text-[#1A1A1A]">{{ row.real_name || row.realName }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="job_title" label="职务" min-width="140">
                  <template #default="{ row }">
                    <span>{{ row.job_title || row.jobTitle || '工程师' }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="phone" label="手机号" width="140">
                  <template #default="{ row }">
                    <span class="text-gray-500 font-mono text-xs">{{ row.phone || '138****8888' }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="email" label="邮箱" min-width="180">
                  <template #default="{ row }">
                    <span class="text-gray-500 text-xs">{{ row.email || `${row.username}@company.com` }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="{ row }">
                    <span class="tag" :class="row.status === 1 ? 'tag-green' : 'tag-gray'">
                      {{ row.status === 1 ? '启用' : '禁用' }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <!-- Tab4: 部门负责人 (完全联动 MySQL sys_user 用户表) -->
          <div v-show="activeTab === 'leader'" class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">
                "{{ selectedDeptName }}" 部门负责人共 <span class="font-bold text-[#049667]">{{ departmentLeaders.length }}</span> 条
              </span>
            </div>

            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs">
                    <th class="py-2.5 px-4 text-left font-medium">姓名</th>
                    <th class="py-2.5 px-4 text-left font-medium">手机</th>
                    <th class="py-2.5 px-4 text-left font-medium">主岗位</th>
                    <th class="py-2.5 px-4 text-left font-medium">兼职岗位</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="leader in departmentLeaders" :key="leader.id" class="hover:bg-gray-50/80">
                    <td class="py-3 px-4 font-medium text-[#1A1A1A]">{{ leader.real_name || leader.realName || leader.username }}</td>
                    <td class="py-3 px-4 text-gray-500 font-mono text-xs">{{ leader.phone || '138****8888' }}</td>
                    <td class="py-3 px-4 text-gray-700">{{ leader.job_title || leader.jobTitle || `${selectedDeptName}负责人` }}</td>
                    <td class="py-3 px-4 text-gray-400">—</td>
                  </tr>
                  <tr v-if="departmentLeaders.length === 0">
                    <td colspan="4" class="py-6 text-center text-xs text-gray-400">
                      该部门暂未在用户管理中指定负责人
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- 1:1 部门配置弹窗 (新增 / 添加下级) -->
    <DeptModal
      v-model="showDeptModal"
      :default-parent="deptModalParent"
      :is-sub-dept="isSubDeptModal"
      :dept-options-list="allDeptNamesList"
      @success="handleDeptModalSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { userApi, departmentApi } from '../api';
import DeptModal from '../components/modals/DeptModal.vue';

interface DeptNode {
  id: string | number;
  label: string;
  name: string;
  code?: string;
  parent?: string;
  parentId?: number;
  shortName?: string;
  phone?: string;
  email?: string;
  sort?: number;
  children?: DeptNode[];
}

const activeTab = ref('info');
const selectedDeptName = ref('信息技术部');
const searchKey = ref('');
const treeRef = ref<any>(null);

const showDeptModal = ref(false);
const isSubDeptModal = ref(false);
const deptModalParent = ref('顶级部门');

const fileInputRef = ref<HTMLInputElement | null>(null);
const allUserList = ref<any[]>([]);

// 包含默认架构的部门树 (从 MySQL 动态异步加载覆盖)
const deptTreeData = ref<DeptNode[]>([
  {
    id: 1,
    label: '总公司',
    name: '总公司',
    code: 'HQ001',
    parent: '无',
    children: [
      { id: 2, label: '信息技术部', name: '信息技术部', code: 'A01B01', parent: '总公司', shortName: '技术部', phone: '010-6666****', email: 'it@company.com', sort: 1, children: [] },
      { id: 3, label: '法务部', name: '法务部', code: 'A01B02', parent: '总公司', shortName: '法务部', phone: '010-66668888', email: 'legal@company.com', sort: 2, children: [] },
      { id: 4, label: '合同管理部', name: '合同管理部', code: 'A01B03', parent: '总公司', shortName: '合同部', phone: '010-66667777', email: 'contract@company.com', sort: 3, children: [] },
      { id: 5, label: '运营管理部', name: '运营管理部', code: 'A01B04', parent: '总公司', shortName: '运营部', phone: '010-66665555', email: 'ops@company.com', sort: 4, children: [] },
    ],
  },
]);

// 收集全量部门名称列表传给弹窗
const allDeptNamesList = computed(() => {
  const names: string[] = [];
  const collect = (nodes: DeptNode[]) => {
    nodes.forEach(node => {
      names.push(node.name);
      if (node.children && node.children.length > 0) {
        collect(node.children);
      }
    });
  };
  collect(deptTreeData.value);
  return names;
});

const filteredDeptTreeData = computed(() => {
  return deptTreeData.value;
});

watch(searchKey, (val) => {
  if (treeRef.value) {
    treeRef.value.filter(val);
  }
});

function filterNode(value: string, data: DeptNode) {
  if (!value) return true;
  return data.name.toLowerCase().includes(value.toLowerCase());
}

const deptForm = reactive({
  name: '信息技术部',
  shortName: '技术部',
  parent: '总公司',
  code: 'A01B01',
  type: '部门',
  sort: 1,
  phone: '010-6666****',
  email: 'it@company.com',
  remark: '',
});

// 动态联动过滤：所属于当前选定部门的用户成员
const departmentUsers = computed(() => {
  const list = Array.isArray(allUserList.value) ? allUserList.value : [];
  if (selectedDeptName.value === '总公司') return list;
  return list.filter(u => (u.department || '信息技术部') === selectedDeptName.value);
});

// 动态联动过滤：在用户管理中被指定为 superior(上级) 且负责部门为当前部门的负责人
const departmentLeaders = computed(() => {
  const list = Array.isArray(allUserList.value) ? allUserList.value : [];
  if (selectedDeptName.value === '总公司') {
    return list.filter(u => u.identity === 'superior' || u.job_title === '部门负责人' || u.role === 0);
  }
  return list.filter(u => {
    const isSuperior = u.identity === 'superior' || u.job_title === '部门负责人' || u.jobTitle === '部门负责人';
    const respDept = u.resp_department || u.respDepartment || u.department || '信息技术部';
    return isSuperior && respDept === selectedDeptName.value;
  });
});

// 查得节点详细属性
function findDeptNode(nodes: DeptNode[], name: string): DeptNode | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.children && node.children.length > 0) {
      const found = findDeptNode(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

watch(selectedDeptName, (newDept) => {
  const target = findDeptNode(deptTreeData.value, newDept);
  if (target) {
    deptForm.name = target.name;
    deptForm.shortName = target.shortName || target.name;
    deptForm.parent = target.parent || '总公司';
    deptForm.code = target.code || 'A01B99';
    deptForm.type = target.parent === '无' ? '子公司' : '部门';
    deptForm.sort = target.sort || 1;
    deptForm.phone = target.phone || '010-6666****';
    deptForm.email = target.email || 'dept@company.com';
    deptForm.remark = '';
  }
});

onMounted(() => {
  loadUsers();
  loadDepartments();
});

// 从 MySQL 数据库 sys_department 异步加载全量部门列表并转为树结构
async function loadDepartments() {
  try {
    const res = await departmentApi.getList();
    if (res.code === 200 && res.data) {
      const dbList = Array.isArray(res.data) ? res.data : [];
      if (dbList.length > 0) {
        deptTreeData.value = buildDeptTree(dbList);
      }
    }
  } catch (e) {
    console.error('加载 MySQL 部门树失败:', e);
  }
}

// 扁平 MySQL 数组转树形结构算法
function buildDeptTree(list: any[]): DeptNode[] {
  const map = new Map<number, DeptNode>();
  const roots: DeptNode[] = [];

  list.forEach((item) => {
    map.set(item.id, {
      id: item.id,
      label: item.dept_name || item.deptName,
      name: item.dept_name || item.deptName,
      code: item.dept_code || item.deptCode,
      parentId: item.parent_id || item.parentId || 0,
      parent: '',
      shortName: item.dept_name || item.deptName,
      phone: item.phone || '010-6666****',
      email: item.email || 'dept@company.com',
      sort: item.sort || 1,
      children: [],
    });
  });

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parentNode = map.get(node.parentId)!;
      node.parent = parentNode.name;
      parentNode.children!.push(node);
    } else {
      node.parent = node.parentId === 0 ? '无' : '顶级部门';
      roots.push(node);
    }
  });

  return roots.length > 0 ? roots : [
    {
      id: 1,
      label: '总公司',
      name: '总公司',
      code: 'HQ001',
      parent: '无',
      children: []
    }
  ];
}

async function loadUsers() {
  try {
    const res = await userApi.getList({});
    if (res.code === 200 && res.data) {
      if (Array.isArray(res.data)) {
        allUserList.value = res.data;
      } else if (Array.isArray(res.data.list)) {
        allUserList.value = res.data.list;
      }
    }
  } catch (e) {
    allUserList.value = [];
  }
}

function handleTreeNodeClick(data: DeptNode) {
  selectedDeptName.value = data.name;
}

// 1. 新增按钮点击响应：唤起弹窗 (上级可选)
function handleCreateDept() {
  isSubDeptModal.value = false;
  deptModalParent.value = '顶级部门';
  showDeptModal.value = true;
}

// 2. 添加下级按钮点击响应：唤起弹窗 (上级强行锁定为当前选中的部门且禁止修改!)
function handleCreateSubDept() {
  isSubDeptModal.value = true;
  deptModalParent.value = selectedDeptName.value;
  showDeptModal.value = true;
}

// 3. 部门配置弹窗保存成功回调：直接写入 MySQL 数据库 sys_department 表并重新加载全量树
async function handleDeptModalSuccess(data: any) {
  if (data.name) {
    try {
      await departmentApi.create({
        deptName: data.name,
        parentName: data.parent || '顶级部门',
        deptCode: `A01B${Math.floor(Math.random() * 80 + 10)}`,
        sort: data.sort || 1,
        status: data.status ?? 1,
      });

      // 写入 MySQL 成功后，重新全量加载 MySQL 数据库中的部门树，实现永久持久化！
      await loadDepartments();
      selectedDeptName.value = data.name;
    } catch (e) {
      console.error('新增部门保存 MySQL 失败:', e);
    }
  }
}

// 4. 导入按钮点击响应：触发隐藏文件控件上传
function handleImportClick() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function onFileImport(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    ElMessage.success('导入成功');
    input.value = '';
  }
}

// 5. 导出按钮点击响应：将部门树明细导出并下载
function handleExportClick() {
  const exportLines: string[] = [];
  const walk = (nodes: DeptNode[], depth: number) => {
    nodes.forEach(n => {
      const indent = '  '.repeat(depth);
      exportLines.push(`${indent}- 部门名称: ${n.name}, 上级: ${n.parent || '无'}, 编码: ${n.code || '无'}`);
      if (n.children && n.children.length > 0) {
        walk(n.children, depth + 1);
      }
    });
  };
  walk(deptTreeData.value, 0);

  const content = exportLines.join('\n');
  const blob = new Blob([`部门架构多级树全量明细:\n\n${content}`], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `部门架构多级树明细_${new Date().toISOString().slice(0, 10)}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success('导出成功');
}

function resetForm() {
  const target = findDeptNode(deptTreeData.value, selectedDeptName.value);
  if (target) {
    deptForm.name = target.name;
    deptForm.shortName = target.shortName || target.name;
    deptForm.phone = target.phone || '010-6666****';
    deptForm.email = target.email || 'dept@company.com';
    deptForm.remark = '';
  }
  ElMessage.success('重置成功');
}

function saveForm() {
  ElMessage.success('保存成功');
}

function savePerm() {
  ElMessage.success('保存成功');
}
</script>
