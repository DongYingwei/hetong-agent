<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑用户' : '新增用户'"
    width="540px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-width="100px" label-position="right" class="px-2">
      <!-- 用户账号 -->
      <el-form-item label="用户账号" required>
        <el-input v-model="form.username" placeholder="请输入用户账号" :disabled="isEdit" clearable />
      </el-form-item>

      <!-- 登录密码 (新增置空，由用户自行填写) -->
      <el-form-item v-if="!isEdit" label="登录密码" required>
        <div class="w-full">
          <el-input v-model="form.password" type="password" placeholder="请输入登录密码" show-password clearable />
          <!-- 密码强度条 (1:1 还原 demo2.html) -->
          <div class="flex gap-1 mt-1.5">
            <div class="h-1 flex-1 rounded" :class="passwordStrength >= 1 ? 'bg-[#049667]' : 'bg-gray-200'"></div>
            <div class="h-1 flex-1 rounded" :class="passwordStrength >= 2 ? 'bg-[#049667]' : 'bg-gray-200'"></div>
            <div class="h-1 flex-1 rounded" :class="passwordStrength >= 3 ? 'bg-[#049667]' : 'bg-gray-200'"></div>
            <div class="h-1 flex-1 rounded" :class="passwordStrength >= 4 ? 'bg-[#049667]' : 'bg-gray-200'"></div>
          </div>
        </div>
      </el-form-item>

      <!-- 确认密码 -->
      <el-form-item v-if="!isEdit" label="确认密码" required>
        <el-input v-model="form.confirmPassword" type="password" placeholder="请输入确认密码" show-password clearable />
      </el-form-item>

      <!-- 用户姓名 -->
      <el-form-item label="用户姓名" required>
        <el-input v-model="form.realName" placeholder="请输入用户姓名" clearable />
      </el-form-item>

      <!-- 工号 -->
      <el-form-item label="工号">
        <el-input v-model="form.employeeId" placeholder="请输入工号" clearable />
      </el-form-item>

      <!-- 职务 -->
      <el-form-item label="职务">
        <el-select v-model="form.jobTitle" placeholder="请选择职务" class="w-full" clearable>
          <el-option label="部门负责人" value="部门负责人" />
          <el-option label="高级工程师" value="高级工程师" />
          <el-option label="工程师" value="工程师" />
          <el-option label="法务专员" value="法务专员" />
          <el-option label="合同专员" value="合同专员" />
        </el-select>
      </el-form-item>

      <!-- 角色 (仅展示系统启用状态的关联角色，禁用角色自动隐藏) -->
      <el-form-item label="角色">
        <el-select v-model="form.role" placeholder="请选择角色" class="w-full">
          <el-option
            v-for="r in enabledRoleOptions"
            :key="r.id"
            :label="r.name"
            :value="r.val"
          />
        </el-select>
      </el-form-item>

      <!-- 所属部门 (与部门管理完全一致的树形点选控件) -->
      <el-form-item label="所属部门">
        <div class="flex items-center gap-2 w-full">
          <el-input v-model="form.department" placeholder="请选择所属部门" readonly class="flex-1" />
          <el-button type="primary" style="background-color: #049667; border-color: #049667;" @click="showDeptPicker = true">
            选择部门
          </el-button>
        </div>
      </el-form-item>

      <!-- 身份 (普通用户 / 上级) -->
      <el-form-item label="身份">
        <el-radio-group v-model="form.identity">
          <el-radio value="normal">普通用户</el-radio>
          <el-radio value="superior">上级</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 负责部门 (当身份为 上级 时显示，采用树形级联选择控件) -->
      <el-form-item v-if="form.identity === 'superior'" label="负责部门">
        <el-tree-select
          v-model="form.respDepartment"
          :data="deptTreeData"
          check-strictly
          node-key="value"
          placeholder="请选择负责部门"
          class="w-full"
          clearable
        />
      </el-form-item>

      <!-- 排序 -->
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="1" :max="9999" style="width: 140px" />
      </el-form-item>

      <!-- 生日 -->
      <el-form-item label="生日">
        <el-date-picker v-model="form.birthday" type="date" placeholder="请选择生日" value-format="YYYY-MM-DD" class="w-full" />
      </el-form-item>

      <!-- 性别 -->
      <el-form-item label="性别">
        <el-select v-model="form.gender" placeholder="请选择性别" class="w-full" clearable>
          <el-option label="男" value="男" />
          <el-option label="女" value="女" />
        </el-select>
      </el-form-item>

      <!-- 邮箱 -->
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="请输入邮箱" clearable />
      </el-form-item>

      <!-- 手机号码 -->
      <el-form-item label="手机号码" required>
        <el-input v-model="form.phone" placeholder="请输入手机号码" clearable />
      </el-form-item>

      <!-- 座机 -->
      <el-form-item label="座机">
        <el-input v-model="form.telephone" placeholder="请输入座机" clearable />
      </el-form-item>

      <!-- 状态 -->
      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">禁用</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer flex justify-end gap-2">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          style="background-color: #049667; border-color: #049667;"
          :loading="loading"
          @click="handleSubmit"
        >
          保存
        </el-button>
      </div>
    </template>

    <!-- 选择所属部门 Tree 树形选择对话框 (1:1 还原部门管理多级树架构) -->
    <el-dialog v-model="showDeptPicker" title="选择所属部门" width="420px" append-to-body destroy-on-close>
      <div class="border border-gray-200 rounded-lg p-3 max-h-[360px] overflow-y-auto">
        <el-tree
          :data="deptTreeData"
          node-key="id"
          default-expand-all
          highlight-current
          @node-click="handleDeptNodeSelect"
        >
          <template #default="{ node, data }">
            <div class="flex items-center justify-between w-full pr-2 text-xs py-1 rounded hover:bg-[#E6F8F0] transition-colors cursor-pointer">
              <div class="flex items-center gap-1.5 truncate">
                <svg class="w-4 h-4 text-[#049667]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <span class="font-medium text-gray-800">{{ node.label }}</span>
              </div>
              <span class="text-[#049667] font-semibold text-xs ml-2">选择</span>
            </div>
          </template>
        </el-tree>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { userApi, roleApi, departmentApi } from '../../api';

interface DeptTreeNode {
  id: number | string;
  label: string;
  value: string;
  parentId?: number;
  children?: DeptTreeNode[];
}

const props = defineProps<{
  modelValue: boolean;
  editData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const isEdit = ref(false);
const loading = ref(false);
const showDeptPicker = ref(false);

// 从 MySQL sys_department 动态构建的多级树形架构数据
const deptTreeData = ref<DeptTreeNode[]>([
  {
    id: 1,
    label: '总公司',
    value: '总公司',
    children: [
      { id: 2, label: '信息技术部', value: '信息技术部', children: [] },
      { id: 3, label: '法务部', value: '法务部', children: [] },
      { id: 4, label: '合同管理部', value: '合同管理部', children: [] },
      { id: 5, label: '运营管理部', value: '运营管理部', children: [] },
    ],
  },
]);

// 动态解析且仅保留系统启用状态 (status === 1) 的角色列表
const enabledRoleOptions = ref<Array<{ id: number; name: string; val: number }>>([
  { id: 1, name: '管理员', val: 0 },
  { id: 2, name: '合同专员', val: 1 },
  { id: 3, name: '法务人员', val: 2 },
  { id: 4, name: '部门负责人', val: 3 },
]);

const form = reactive({
  id: undefined as number | undefined,
  username: '',
  password: '',
  confirmPassword: '',
  realName: '',
  employeeId: '',
  jobTitle: '',
  role: 1,
  department: '',
  identity: 'normal',
  respDepartment: '',
  sort: 1000,
  birthday: '',
  gender: '',
  email: '',
  phone: '',
  telephone: '',
  status: 1,
});

const passwordStrength = computed(() => {
  if (!form.password) return 0;
  let score = 0;
  if (form.password.length >= 6) score++;
  if (/[a-zA-Z]/.test(form.password)) score++;
  if (/[0-9]/.test(form.password)) score++;
  if (/[^a-zA-Z0-9]/.test(form.password)) score++;
  return Math.min(score, 4);
});

// 从 MySQL 数据库 sys_department 抓取全量部门表，并转化为 1:1 多级树形结构
async function fetchDepartmentsTree() {
  try {
    const res = await departmentApi.getList();
    if (res.code === 200 && res.data && res.data.length > 0) {
      deptTreeData.value = buildDeptTree(res.data);
    }
  } catch (e) {
    // keep default fallback tree
  }
}

function buildDeptTree(list: any[]): DeptTreeNode[] {
  const map = new Map<number, DeptTreeNode>();
  const roots: DeptTreeNode[] = [];

  list.forEach((item) => {
    map.set(item.id, {
      id: item.id,
      label: item.dept_name || item.deptName,
      value: item.dept_name || item.deptName,
      parentId: item.parent_id || item.parentId || 0,
      children: [],
    });
  });

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots.length > 0 ? roots : [
    { id: 1, label: '总公司', value: '总公司', children: [] }
  ];
}

async function fetchEnabledRoles() {
  try {
    const res = await roleApi.getList();
    if (res.code === 200 && res.data && res.data.length > 0) {
      // 过滤出 status === 1 (开启) 的角色
      const activeRoles = res.data.filter((r: any) => r.status === 1);
      enabledRoleOptions.value = activeRoles.map((r: any, index: number) => {
        const name = r.role_name || r.roleName;
        let val = r.id;
        if (name === '管理员') val = 0;
        else if (name === '合同专员') val = 1;
        else if (name === '法务人员') val = 2;
        else if (name === '部门负责人') val = 3;
        return {
          id: r.id || (index + 1),
          name: name,
          val: val,
        };
      });
    }
  } catch (e) {
    // keep default fallback active roles
  }
}

function resetAddForm() {
  isEdit.value = false;
  form.id = undefined;
  form.username = '';
  form.password = '';
  form.confirmPassword = '';
  form.realName = '';
  form.employeeId = '';
  form.jobTitle = '';
  form.role = enabledRoleOptions.value[0]?.val ?? 1;
  form.department = '';
  form.identity = 'normal';
  form.respDepartment = '';
  form.sort = 1000;
  form.birthday = '';
  form.gender = '';
  form.email = '';
  form.phone = '';
  form.telephone = '';
  form.status = 1;
}

watch(() => props.modelValue, (val) => {
  visible.value = val;
  if (val) {
    fetchEnabledRoles();
    fetchDepartmentsTree();
    if (!props.editData) {
      resetAddForm();
    }
  }
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.editData, (val) => {
  if (val) {
    isEdit.value = true;
    form.id = val.id;
    form.username = val.username || '';
    form.password = '';
    form.confirmPassword = '';
    form.realName = val.real_name || val.realName || '';
    form.employeeId = val.employee_id || val.employeeId || ('EMP' + val.id);
    form.jobTitle = val.job_title || val.jobTitle || '';
    form.role = val.role !== undefined ? val.role : 1;
    form.department = val.department || '';
    form.identity = val.identity || 'normal';
    form.respDepartment = val.resp_department || val.respDepartment || '';
    form.sort = val.sort || 1000;
    form.birthday = val.birthday || '';
    form.gender = val.gender || '';
    form.email = val.email || '';
    form.phone = val.phone || '';
    form.telephone = val.telephone || '';
    form.status = val.status !== undefined ? val.status : 1;
  } else {
    resetAddForm();
  }
}, { immediate: true });

function handleDeptNodeSelect(data: DeptTreeNode) {
  if (data.value) {
    form.department = data.value;
    showDeptPicker.value = false;
  }
}

async function handleSubmit() {
  if (!form.username.trim()) {
    ElMessage.error('用户账号不能为空');
    return;
  }
  if (!isEdit.value) {
    if (!form.password) {
      ElMessage.error('登录密码不能为空');
      return;
    }
    if (form.password !== form.confirmPassword) {
      ElMessage.error('两次输入的密码不一致');
      return;
    }
  }
  if (!form.realName.trim()) {
    ElMessage.error('用户姓名不能为空');
    return;
  }
  if (!form.phone.trim()) {
    ElMessage.error('手机号码不能为空');
    return;
  }

  loading.value = true;
  try {
    const payload = {
      id: form.id,
      username: form.username,
      password: form.password,
      realName: form.realName,
      role: form.role,
      status: form.status,
      department: form.department,
      phone: form.phone,
      jobTitle: form.jobTitle,
      employeeId: form.employeeId,
      gender: form.gender,
      email: form.email,
      telephone: form.telephone,
      birthday: form.birthday,
      identity: form.identity,
      respDepartment: form.respDepartment,
      sort: form.sort,
    };

    if (isEdit.value) {
      const res = await userApi.update(payload);
      if (res.code === 200) {
        ElMessage.success('编辑成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.message || '编辑失败');
      }
    } else {
      const res = await userApi.create(payload);
      if (res.code === 200) {
        ElMessage.success('新增成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.message || '新增失败');
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>
