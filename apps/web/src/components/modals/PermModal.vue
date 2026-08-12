<template>
  <el-dialog
    v-model="visible"
    title="分配权限"
    width="480px"
    destroy-on-close
  >
    <div class="px-2">
      <div class="text-xs text-gray-500 mb-3">
        勾选角色 <span class="font-bold text-[#1A1A1A]">"{{ roleData?.roleName || roleData?.role_name || '该角色' }}"</span> 可访问的菜单及功能权限：
      </div>

      <!-- 1:1 还原 demo2.html 权限勾选树 -->
      <div class="border border-gray-200 rounded-lg p-3 max-h-[380px] overflow-y-auto space-y-1.5 bg-gray-50/50">
        <el-tree
          ref="treeRef"
          :data="menuTreeData"
          show-checkbox
          node-key="id"
          default-expand-all
          :default-checked-keys="checkedKeys"
          :props="{ label: 'label', children: 'children' }"
        />
      </div>
    </div>

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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { usePermissionStore } from '../../stores/permissionStore';

const props = defineProps<{
  modelValue: boolean;
  roleData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const permissionStore = usePermissionStore();

const visible = ref(false);
const loading = ref(false);
const treeRef = ref<any>(null);

const checkedKeys = ref<number[]>([1, 11, 12, 13, 14, 2, 26]);

const menuTreeData = [
  {
    id: 1,
    label: '合同管理',
    children: [
      { id: 11, label: '合同台账' },
      { id: 12, label: '智能体检索' },
      { id: 13, label: '关键词管理' },
      { id: 14, label: '合同模块' },
    ],
  },
  {
    id: 2,
    label: '系统管理',
    children: [
      { id: 21, label: '菜单管理' },
      { id: 22, label: '首页配置' },
      { id: 23, label: '用户管理' },
      { id: 24, label: '角色管理' },
      { id: 25, label: '部门管理' },
      { id: 26, label: '我的部门' },
      { id: 27, label: '文件管理' },
    ],
  },
];

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.roleData, (val) => {
  if (val) {
    const roleName = val.roleName || val.role_name;
    const permKey = val.permKey || val.perm_key;
    
    if (roleName && permissionStore.rolePermissions[roleName]) {
      checkedKeys.value = permissionStore.rolePermissions[roleName];
    } else if (permKey && permissionStore.rolePermissions[permKey]) {
      checkedKeys.value = permissionStore.rolePermissions[permKey];
    } else if (permKey === 'admin' || roleName === '管理员') {
      checkedKeys.value = [1, 11, 12, 13, 14, 2, 21, 22, 23, 24, 25, 26, 27];
    } else {
      checkedKeys.value = [1, 11, 12, 13, 14, 2, 26];
    }
  }
});

async function handleSubmit() {
  loading.value = true;
  try {
    const checked = treeRef.value ? treeRef.value.getCheckedKeys() : [];
    const halfChecked = treeRef.value ? treeRef.value.getHalfCheckedKeys() : [];
    const allSelectedKeys = Array.from(new Set([...checked, ...halfChecked]));

    const roleName = props.roleData?.roleName || props.roleData?.role_name;
    const permKey = props.roleData?.permKey || props.roleData?.perm_key;

    if (roleName) {
      permissionStore.setRolePermissions(roleName, allSelectedKeys);
    }
    if (permKey) {
      permissionStore.setRolePermissions(permKey, allSelectedKeys);
    }

    ElMessage.success('保存成功');
    visible.value = false;
    emit('success');
  } finally {
    loading.value = false;
  }
}
</script>
