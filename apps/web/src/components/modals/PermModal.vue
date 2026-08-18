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
import { menuApi, roleApi } from '../../api';

const props = defineProps<{
  modelValue: boolean;
  roleData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const loading = ref(false);
const treeRef = ref<any>(null);

const checkedKeys = ref<number[]>([1, 11, 12, 13, 14, 2, 26]);

const menuTreeData = ref<any[]>([]);
function buildTree(list: any[]) {
  const map = new Map<number, any>(); const roots: any[] = [];
  list.forEach((item) => map.set(item.id, { id: item.id, label: item.name, children: [] }));
  list.forEach((item) => { const node = map.get(item.id); if (item.parent_id && map.has(item.parent_id)) map.get(item.parent_id).children.push(node); else roots.push(node); });
  return roots;
}
async function loadRolePermissions() {
  if (!props.roleData?.id) return;
  const [menus, permissions] = await Promise.all([menuApi.getList(), roleApi.getMenus(props.roleData.id)]);
  if (menus.code === 200) menuTreeData.value = buildTree(menus.data || []);
  if (permissions.code === 200) checkedKeys.value = permissions.data.menuIds || [];
}

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.roleData, (val) => {
  if (val) {
    checkedKeys.value = [];
    void loadRolePermissions();
  }
});

async function handleSubmit() {
  loading.value = true;
  try {
    const checked = treeRef.value ? treeRef.value.getCheckedKeys() : [];
    const halfChecked = treeRef.value ? treeRef.value.getHalfCheckedKeys() : [];
    const allSelectedKeys = Array.from(new Set([...checked, ...halfChecked]));

    if (!props.roleData?.id) return;
    await roleApi.saveMenus(props.roleData.id, allSelectedKeys.map(Number));

    ElMessage.success('保存成功');
    visible.value = false;
    emit('success');
  } finally {
    loading.value = false;
  }
}
</script>
