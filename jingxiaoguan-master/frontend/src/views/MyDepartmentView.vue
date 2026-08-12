<template>
  <div>
    <!-- 头部卡片 (1:1 还原 demo2.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">我的部门</h1>
          <p class="text-xs text-gray-500 mt-1">查看与管理个人所属部门信息及相关同事架构</p>
        </div>
      </div>
    </div>

    <!-- 主体2栏分栏 -->
    <div class="flex gap-4 h-[calc(100vh-220px)]">
      <!-- 左侧：部门组织树 (340px 宽度) -->
      <div class="content-card w-[340px] shrink-0 flex flex-col overflow-hidden mb-0 p-0">
        <!-- 选中状态提示 -->
        <div class="px-3 py-2 bg-[#E6F8F0] text-xs text-[#049667] flex items-center gap-1.5 border-b border-gray-100">
          <el-icon><InfoFilled /></el-icon>
          <span>当前所属部门：信息技术部</span>
        </div>

        <!-- 搜索框 -->
        <div class="p-3 border-b border-gray-100">
          <el-input v-model="searchKey" placeholder="搜索同事姓名或岗位..." size="small" clearable>
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <!-- 部门树结构 -->
        <div class="flex-1 overflow-y-auto p-2">
          <el-tree
            :data="deptTreeData"
            node-key="id"
            default-expand-all
            highlight-current
          >
            <template #default="{ node, data }">
              <div class="flex items-center gap-2 text-xs" :class="data.name === '信息技术部' ? 'text-[#049667] font-bold' : 'text-gray-700'">
                <el-icon class="text-[#049667]"><OfficeBuilding /></el-icon>
                <span>{{ node.label }}</span>
                <span class="text-[10px] text-gray-400 font-normal">({{ data.count || 0 }}人)</span>
              </div>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 右侧：部门详情与 Tabs 成员列表 (flex-1 宽度) -->
      <div class="flex-1 content-card flex flex-col overflow-hidden mb-0 p-5">
        <!-- 标签页选卡 -->
        <el-tabs v-model="activeTab" class="flex-1 flex flex-col overflow-hidden">
          <!-- Tab 1: 部门信息 -->
          <el-tab-pane label="部门信息" name="info">
            <div class="space-y-4 text-xs pt-3">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-gray-400">部门名称</label>
                  <div class="text-sm font-semibold text-[#1A1A1A] mt-1">信息技术部</div>
                </div>
                <div>
                  <label class="text-gray-400">部门编码</label>
                  <div class="text-sm font-mono text-gray-700 mt-1">DEPT_IT_001</div>
                </div>
                <div>
                  <label class="text-gray-400">上级部门</label>
                  <div class="text-sm text-gray-700 mt-1">华苏科技总公司</div>
                </div>
                <div>
                  <label class="text-gray-400">部门负责人</label>
                  <div class="text-sm text-gray-700 mt-1">张三</div>
                </div>
                <div>
                  <label class="text-gray-400">部门主要职责</label>
                  <div class="text-sm text-gray-700 mt-1 col-span-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    负责公司经小管智能体平台维护、合同大数据解析引擎以及网络安全与IT资产保障。
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- Tab 2: 部门成员 -->
          <el-tab-pane label="部门成员" name="members">
            <div class="pt-2">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-gray-400">信息技术部共 5 名同事</span>
              </div>

              <el-table :data="memberList" stripe style="width: 100%">
                <el-table-column prop="username" label="账号" width="140" />
                <el-table-column prop="realName" label="姓名" width="140">
                  <template #default="{ row }">
                    <span class="font-medium text-[#1A1A1A]">{{ row.realName }}</span>
                    <span v-if="row.realName === '张三'" class="tag tag-green ml-2">我</span>
                  </template>
                </el-table-column>
                <el-table-column prop="gender" label="性别" width="80" align="center" />
                <el-table-column prop="dept" label="所属部门" width="160" />
                <el-table-column prop="phone" label="手机号码" width="160" />
              </el-table>
            </div>
          </el-tab-pane>

          <!-- Tab 3: 部门角色 -->
          <el-tab-pane label="部门角色" name="roles">
            <div class="pt-2">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-gray-400">信息技术部包含的角色职责</span>
              </div>

              <el-table :data="deptRoleList" stripe style="width: 100%">
                <el-table-column prop="roleName" label="部门角色名称" min-width="160">
                  <template #default="{ row }">
                    <span class="font-medium text-[#1A1A1A]">{{ row.roleName }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="roleCode" label="部门角色编码" width="160" />
                <el-table-column prop="dept" label="所属部门" width="160" />
                <el-table-column prop="remark" label="备注" min-width="200" />
              </el-table>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Search, InfoFilled, OfficeBuilding } from '@element-plus/icons-vue';

const activeTab = ref('members');
const searchKey = ref('');

const deptTreeData = ref([
  {
    id: 1,
    label: '华苏科技总公司',
    name: '华苏科技总公司',
    count: 28,
    children: [
      { id: 2, label: '信息技术部', name: '信息技术部', count: 5 },
      { id: 3, label: '研发中心', name: '研发中心', count: 12 },
      { id: 4, label: '市场运维部', name: '市场运维部', count: 6 },
      { id: 5, label: '财务部', name: '财务部', count: 3 },
      { id: 6, label: '人力资源部', name: '人力资源部', count: 2 },
    ],
  },
]);

const memberList = ref([
  { username: 'zhangsan', realName: '张三', gender: '男', dept: '信息技术部', phone: '138****8888' },
  { username: 'lisi', realName: '李四', gender: '男', dept: '信息技术部', phone: '139****9999' },
  { username: 'wangwu', realName: '王五', gender: '男', dept: '信息技术部', phone: '137****7777' },
  { username: 'zhaoliu', realName: '赵六', gender: '女', dept: '信息技术部', phone: '135****6666' },
  { username: 'zhengshi', realName: '郑十', gender: '女', dept: '信息技术部', phone: '136****1111' },
]);

const deptRoleList = ref([
  { roleName: '技术部管理员', roleCode: 'jsb_admin', dept: '信息技术部', remark: '具备管理部门成员权限' },
  { roleName: '技术部审核员', roleCode: 'jsb_auditor', dept: '信息技术部', remark: '负责合同技术条款审核' },
]);
</script>
