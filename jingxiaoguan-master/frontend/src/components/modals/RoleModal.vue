<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑角色' : '新增角色'"
    width="520px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-width="90px" label-position="right" class="px-2">
      <!-- 角色名称 -->
      <el-form-item label="角色名称" required>
        <el-input v-model="form.roleName" placeholder="请输入角色名称" clearable />
      </el-form-item>

      <!-- 权限字符 -->
      <el-form-item label="权限字符" required>
        <el-input v-model="form.permKey" placeholder="如 admin、contract:specialist" clearable />
      </el-form-item>

      <!-- 显示顺序 -->
      <el-form-item label="显示顺序">
        <el-input-number v-model="form.sort" :min="1" :max="99" style="width: 140px" />
      </el-form-item>

      <!-- 状态 -->
      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">禁用</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 备注 -->
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
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
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { roleApi } from '../../api';

const props = defineProps<{
  modelValue: boolean;
  editData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const isEdit = ref(false);
const loading = ref(false);

const form = reactive({
  id: undefined as number | undefined,
  roleCode: '',
  roleName: '',
  permKey: '',
  sort: 1,
  status: 1,
  remark: '',
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
    form.roleCode = val.roleCode || val.role_code || ('R00' + val.id);
    form.roleName = val.roleName || val.role_name || '';
    form.permKey = val.permKey || val.perm_key || '';
    form.sort = val.sort !== undefined ? val.sort : 1;
    form.status = val.status !== undefined ? val.status : 1;
    form.remark = val.remark || '';
  } else {
    isEdit.value = false;
    form.id = undefined;
    form.roleCode = 'R00' + Math.floor(Math.random() * 90 + 10);
    form.roleName = '';
    form.permKey = '';
    form.sort = 1;
    form.status = 1;
    form.remark = '';
  }
});

async function handleSubmit() {
  if (!form.roleName.trim()) {
    ElMessage.error('角色名称不能为空');
    return;
  }
  if (!form.permKey.trim()) {
    ElMessage.error('权限字符不能为空');
    return;
  }

  loading.value = true;
  try {
    const payload = {
      id: form.id,
      roleCode: form.roleCode,
      roleName: form.roleName,
      permKey: form.permKey,
      sort: form.sort,
      status: form.status,
    };

    if (isEdit.value) {
      const res = await roleApi.update(payload);
      if (res.code === 200) {
        ElMessage.success('编辑成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.message || '编辑失败');
      }
    } else {
      const res = await roleApi.create(payload);
      if (res.code === 200) {
        ElMessage.success('新增成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.message || '新增失败');
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>
