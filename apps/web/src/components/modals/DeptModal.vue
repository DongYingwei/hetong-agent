<template>
  <el-dialog
    v-model="visible"
    :title="isSubDept ? '添加下级部门' : '新增部门配置'"
    width="520px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-width="90px" label-position="right" class="px-2">
      <!-- 部门名称 -->
      <el-form-item label="部门名称" required>
        <el-input v-model="form.name" placeholder="请输入部门名称" clearable />
      </el-form-item>

      <!-- 上级部门 (当添加下级时强制锁定当前选中的部门且禁止修改) -->
      <el-form-item label="上级部门" required>
        <el-select
          v-model="form.parent"
          placeholder="请选择上级部门"
          class="w-full"
          :disabled="isSubDept"
        >
          <el-option
            v-for="deptName in parentOptions"
            :key="deptName"
            :label="deptName"
            :value="deptName"
          />
        </el-select>
      </el-form-item>

      <!-- 联系电话 -->
      <el-form-item label="联系电话">
        <el-input v-model="form.phone" placeholder="请输入联系电话" clearable />
      </el-form-item>

      <!-- 邮箱 -->
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="请输入邮箱" clearable />
      </el-form-item>

      <!-- 显示排序 -->
      <el-form-item label="显示排序">
        <el-input-number v-model="form.sort" :min="1" :max="999" style="width: 140px" />
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  defaultParent?: string;
  isSubDept?: boolean;
  deptOptionsList?: string[];
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const loading = ref(false);

const form = reactive({
  name: '',
  parent: '顶级部门',
  phone: '',
  email: '',
  sort: 1,
  status: 1,
});

const parentOptions = computed(() => {
  if (props.deptOptionsList && props.deptOptionsList.length > 0) {
    return Array.from(new Set(['顶级部门', '总公司', ...props.deptOptionsList]));
  }
  return ['顶级部门', '总公司', '信息技术部', '法务部', '合同管理部', '运营管理部'];
});

watch(() => props.modelValue, (val) => {
  visible.value = val;
  if (val) {
    form.name = '';
    form.phone = '';
    form.email = '';
    form.sort = 1;
    form.status = 1;
    if (props.defaultParent) {
      form.parent = props.defaultParent;
    } else {
      form.parent = '顶级部门';
    }
  }
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

async function handleSubmit() {
  if (!form.name.trim()) {
    ElMessage.error('部门名称不能为空');
    return;
  }

  loading.value = true;
  try {
    ElMessage.success('新增成功');
    visible.value = false;
    emit('success', { ...form });
  } finally {
    loading.value = false;
  }
}
</script>
