<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑菜单' : (isChild ? '新增子菜单' : '新增菜单')"
    width="520px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-position="top">
      <div class="space-y-4 text-xs">
        <el-form-item label="菜单类型" required class="mb-0">
          <el-radio-group v-model="form.type">
            <el-radio value="目录">目录</el-radio>
            <el-radio value="菜单">菜单</el-radio>
            <el-radio value="按钮">按钮</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="菜单名称" required class="mb-0">
          <el-input v-model="form.name" placeholder="请输入菜单名称" />
        </el-form-item>

        <el-form-item label="上级菜单" class="mb-0">
          <el-select v-model="form.parentId" placeholder="主类目" class="w-full">
            <el-option label="主类目" :value="0" />
            <el-option label="合同管理" :value="1" />
            <el-option label="系统管理" :value="2" />
          </el-select>
        </el-form-item>

        <el-form-item label="路由地址 / 组件路径" class="mb-0">
          <el-input v-model="form.path" placeholder="如 /system/menu" />
        </el-form-item>

        <el-form-item label="权限标识" class="mb-0">
          <el-input v-model="form.permission" placeholder="如 system:menu" />
        </el-form-item>

        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="显示排序" class="mb-0">
            <el-input-number v-model="form.sort" :min="1" :max="99" class="w-full" />
          </el-form-item>
          <el-form-item label="菜单状态" class="mb-0">
            <el-select v-model="form.status" class="w-full">
              <el-option label="启用" :value="1" />
              <el-option label="禁用" :value="0" />
            </el-select>
          </el-form-item>
        </div>
      </div>
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  editData?: any;
  parentData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const isEdit = ref(false);
const isChild = ref(false);
const loading = ref(false);

const form = reactive({
  id: undefined as number | undefined,
  type: '菜单',
  name: '',
  parentId: 0,
  path: '',
  permission: '',
  sort: 1,
  status: 1,
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
    isChild.value = false;
    form.id = val.id;
    form.type = val.type || '菜单';
    form.name = val.name ? val.name.replace(/[├└\s]/g, '') : '';
    form.parentId = val.parentId || 0;
    form.path = val.path || '';
    form.permission = val.permission === '—' ? '' : val.permission;
    form.sort = val.sort || 1;
    form.status = val.status !== undefined ? val.status : 1;
  }
});

watch(() => props.parentData, (val) => {
  if (val) {
    isEdit.value = false;
    isChild.value = true;
    form.id = undefined;
    form.type = '菜单';
    form.name = '';
    form.parentId = val.id;
    form.path = '';
    form.permission = '';
    form.sort = 1;
    form.status = 1;
  }
});

async function handleSubmit() {
  if (!form.name.trim()) {
    ElMessage.error('菜单名称不能为空');
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
