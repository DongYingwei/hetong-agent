<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑关键词' : '新增关键词'"
    width="500px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-width="90px" label-position="right" class="px-2">
      <el-form-item label="关键词" required>
        <el-input v-model="form.keyword_name" placeholder="请输入关键词名称（如 AI）" clearable />
      </el-form-item>

      <el-form-item label="匹配规则">
        <el-input
          v-model="form.match_rules"
          type="textarea"
          :rows="3"
          placeholder="请输入匹配/排除规则（如：排除Email、域名中的ai）"
        />
        <div class="text-xs text-gray-400 mt-1">定义匹配规则或排除条件，辅助 AI 进行精准识别</div>
      </el-form-item>

      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">停用</el-radio>
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
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { keywordApi } from '../../api';

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
  keyword_name: '',
  match_rules: '',
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
    form.id = val.id;
    form.keyword_name = val.keyword_name || '';
    form.match_rules = val.match_rules || val.description || '';
    form.status = val.status !== undefined ? val.status : 1;
  } else {
    isEdit.value = false;
    form.id = undefined;
    form.keyword_name = '';
    form.match_rules = '';
    form.status = 1;
  }
}, { immediate: true });

async function handleSubmit() {
  if (!form.keyword_name.trim()) {
    ElMessage.error('关键词名称不能为空');
    return;
  }

  loading.value = true;
  try {
    if (isEdit.value && form.id) {
      const res = await keywordApi.update({
        id: form.id,
        keyword_name: form.keyword_name.trim(),
        match_rules: form.match_rules.trim(),
        status: form.status,
      });
      if (res.code === 200) {
        ElMessage.success('更新成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.msg || '更新失败');
      }
    } else {
      const res = await keywordApi.create({
        keyword_name: form.keyword_name.trim(),
        match_rules: form.match_rules.trim(),
        status: form.status,
      });
      if (res.code === 200) {
        ElMessage.success('新增成功');
        visible.value = false;
        emit('success');
      } else {
        ElMessage.error(res.msg || '新增失败');
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    loading.value = false;
  }
}
</script>
