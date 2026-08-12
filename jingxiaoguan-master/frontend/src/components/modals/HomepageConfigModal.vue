<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑首页配置' : '新增首页配置'"
    width="540px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-width="100px" label-position="right" class="px-2">
      <!-- 关联类型 (角色 / 用户 / 全局默认) -->
      <el-form-item label="关联类型" required>
        <div class="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white text-xs select-none">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors border-none cursor-pointer"
            :class="form.relationType === '角色' ? 'bg-[#049667] text-white' : 'bg-transparent text-gray-700 hover:text-[#049667]'"
            @click="handleTypeChange('角色')"
          >
            角色
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors border-none cursor-pointer"
            :class="form.relationType === '用户' ? 'bg-[#049667] text-white' : 'bg-transparent text-gray-700 hover:text-[#049667]'"
            @click="handleTypeChange('用户')"
          >
            用户
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md font-medium transition-colors border-none cursor-pointer"
            :class="form.relationType === '全局默认' ? 'bg-[#049667] text-white' : 'bg-transparent text-gray-700 hover:text-[#049667]'"
            @click="handleTypeChange('全局默认')"
          >
            全局默认
          </button>
        </div>
      </el-form-item>

      <!-- 角色编码 (关联类型为 角色 时显示) -->
      <el-form-item v-if="form.relationType === '角色'" label="角色编码" required>
        <div class="flex items-center gap-2 w-full">
          <div class="flex-1 flex items-center border border-gray-200 rounded-lg px-3 py-1 bg-white min-h-[36px]">
            <span v-if="form.targetName" class="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
              {{ form.targetName }}
              <el-icon class="cursor-pointer text-gray-400 hover:text-red-500" @click="form.targetName = ''"><Close /></el-icon>
            </span>
            <span v-else class="text-xs text-gray-400">请选择角色</span>
          </div>
          <el-button type="primary" style="background-color: #049667; border-color: #049667;" @click="openRolePicker">
            选择
          </el-button>
        </div>
      </el-form-item>

      <!-- 用户账号 (关联类型为 用户 时显示) -->
      <el-form-item v-if="form.relationType === '用户'" label="用户账号" required>
        <div class="flex items-center gap-2 w-full">
          <div class="flex-1 flex items-center border border-gray-200 rounded-lg px-3 py-1 bg-white min-h-[36px]">
            <span v-if="form.targetName" class="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
              {{ form.targetName }}
              <el-icon class="cursor-pointer text-gray-400 hover:text-red-500" @click="form.targetName = ''"><Close /></el-icon>
            </span>
            <span v-else class="text-xs text-gray-400">请选择用户（动态获取用户表数据）</span>
          </div>
          <el-button type="primary" style="background-color: #049667; border-color: #049667;" @click="openUserPicker">
            选择
          </el-button>
        </div>
      </el-form-item>

      <!-- 全局默认提示 -->
      <el-form-item v-if="form.relationType === '全局默认'" label="分配说明">
        <span class="text-xs text-gray-500">全局默认模式无需指定特定角色或用户，适用于所有未单独配置的主账号。</span>
      </el-form-item>

      <!-- 首页路由 -->
      <el-form-item label="首页路由" required>
        <el-input v-model="form.route" placeholder="如 /contract/ledger 或 /attendance/dashboard" clearable />
      </el-form-item>

      <!-- 组件地址 -->
      <el-form-item label="组件地址" required>
        <el-input v-model="form.component" placeholder="如 contract/Ledger 或 attendance/dashboard/index" clearable />
      </el-form-item>

      <!-- 优先级 -->
      <el-form-item label="优先级">
        <el-input-number v-model="form.priority" :min="0" :max="99" style="width: 140px" />
      </el-form-item>

      <!-- 是否开启 -->
      <el-form-item label="是否开启">
        <el-switch v-model="form.enabled" style="--el-switch-on-color: #049667;" />
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
          确认
        </el-button>
      </div>
    </template>

    <!-- 选择角色 Picker 对话框 (来源于角色数据表) -->
    <el-dialog v-model="showRolePicker" title="选择角色（角色表）" width="460px" append-to-body>
      <div class="space-y-2 max-h-[320px] overflow-y-auto">
        <div
          v-for="role in roleList"
          :key="role.id"
          class="p-3 rounded-lg border border-gray-200 hover:border-[#049667] hover:bg-[#E6F8F0] cursor-pointer text-xs flex justify-between items-center transition-colors"
          @click="selectRole(role)"
        >
          <div>
            <span class="font-bold text-gray-800 mr-2">{{ role.name }}</span>
            <span class="tag tag-blue font-mono text-[10px]">{{ role.code }}</span>
          </div>
          <el-button type="primary" size="small" style="background-color: #049667; border-color: #049667;">选择</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 选择用户 Picker 对话框 (动态调取 sys_user 用户表) -->
    <el-dialog v-model="showUserPicker" title="选择用户（sys_user 用户表）" width="460px" append-to-body>
      <div v-loading="loadingUsers" class="space-y-2 max-h-[320px] overflow-y-auto">
        <div
          v-for="u in userList"
          :key="u.id"
          class="p-3 rounded-lg border border-gray-200 hover:border-[#049667] hover:bg-[#E6F8F0] cursor-pointer text-xs flex justify-between items-center transition-colors"
          @click="selectUser(u)"
        >
          <div>
            <span class="font-bold text-gray-800 mr-2">{{ u.real_name }}</span>
            <span class="text-gray-500 font-mono">({{ u.username }})</span>
          </div>
          <el-button type="primary" size="small" style="background-color: #049667; border-color: #049667;">选择</el-button>
        </div>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { userApi } from '../../api';

const props = defineProps<{
  modelValue: boolean;
  editData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const isEdit = ref(false);
const loading = ref(false);
const loadingUsers = ref(false);
const showRolePicker = ref(false);
const showUserPicker = ref(false);

// 角色表数据 (来自于系统角色管理列表数据)
const roleList = ref([
  { id: 1, name: '中兴管理员', code: 'zx_admin' },
  { id: 2, name: '管理员', code: 'admin' },
  { id: 3, name: '合同专员', code: 'contract:specialist' },
  { id: 4, name: '法务人员', code: 'legal:staff' },
  { id: 5, name: '部门负责人', code: 'dept:leader' },
  { id: 6, name: '高管', code: 'executive' },
]);

// 动态调取的 sys_user 用户表数据
const userList = ref<any[]>([]);

const form = reactive({
  id: undefined as number | undefined,
  relationType: '角色' as '角色' | '用户' | '全局默认',
  targetName: '中兴管理员',
  route: '/contract/ledger',
  component: 'contract/Ledger/index',
  priority: 0,
  enabled: true,
});

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.editData, (val) => {
  if (val) {
    isEdit.value = true;
    form.id = val.id;
    form.relationType = val.relationType || '角色';
    form.targetName = val.roleName || val.targetName || '';
    form.route = val.route || '/contract/ledger';
    form.component = val.component || 'contract/Ledger/index';
    form.priority = val.priority !== undefined ? val.priority : 0;
    form.enabled = val.status === 1;
  } else {
    isEdit.value = false;
    form.id = undefined;
    form.relationType = '角色';
    form.targetName = '中兴管理员';
    form.route = '/contract/ledger';
    form.component = 'contract/Ledger/index';
    form.priority = 0;
    form.enabled = true;
  }
});

/**
 * 切换 关联类型 (角色 / 用户 / 全局默认) 时自动清空已选择的目标表单值
 */
function handleTypeChange(type: '角色' | '用户' | '全局默认') {
  if (form.relationType !== type) {
    form.relationType = type;
    form.targetName = ''; // 切换类型自动清空
  }
}

function openRolePicker() {
  showRolePicker.value = true;
}

async function openUserPicker() {
  showUserPicker.value = true;
  loadingUsers.value = true;
  try {
    const res = await userApi.getList({ page: 1, pageSize: 100 });
    if (res.code === 200 && res.data.list) {
      userList.value = res.data.list;
    }
  } catch (e) {
    // fallback test users if backend disconnected
    userList.value = [
      { id: 1, username: 'admin', real_name: '张三' },
      { id: 2, username: 'user', real_name: '李四' },
      { id: 3, username: 'wangwu', real_name: '王五' },
      { id: 4, username: 'zhaoliu', real_name: '赵六' },
    ];
  } finally {
    loadingUsers.value = false;
  }
}

function selectRole(role: any) {
  form.targetName = role.name;
  showRolePicker.value = false;
}

function selectUser(user: any) {
  form.targetName = `${user.real_name} (${user.username})`;
  showUserPicker.value = false;
}

async function handleSubmit() {
  if (form.relationType !== '全局默认' && !form.targetName) {
    ElMessage.error(`请选择对应的${form.relationType}`);
    return;
  }
  if (!form.route.trim()) {
    ElMessage.error('首页路由不能为空');
    return;
  }
  if (!form.component.trim()) {
    ElMessage.error('组件地址不能为空');
    return;
  }

  loading.value = true;
  try {
    ElMessage.success(isEdit.value ? '编辑成功' : '新增成功');
    visible.value = false;
    emit('success');
  } finally {
    loading.value = false;
  }
}
</script>
