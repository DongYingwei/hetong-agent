<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑模块' : '新增模块'"
    width="520px"
    destroy-on-close
    class="section-modal"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-position="top">
      <el-form-item label="模块名称" prop="sectionTitle" required>
        <el-input v-model="form.sectionTitle" placeholder="请输入模块名称" size="large" />
      </el-form-item>

      <el-form-item label="适配范围" prop="scope" required>
        <el-radio-group v-model="form.scope" class="scope-radio-group">
          <el-radio value="contract">仅合同</el-radio>
          <el-radio value="order">仅订单</el-radio>
          <el-radio value="all">合同+订单</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="对应模块名称" prop="subNamesList" required>
        <div class="border border-gray-300 rounded-lg p-2.5 min-h-[44px] flex flex-wrap gap-2 items-center bg-white w-full">
          <span
            v-for="(tag, idx) in form.subNamesList"
            :key="idx"
            class="tag tag-blue flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md"
          >
            {{ tag }}
            <el-icon class="cursor-pointer hover:text-red-500 text-xs" @click="removeSubNameTag(idx)">
              <Close />
            </el-icon>
          </span>
          <input
            v-model="inputTagText"
            class="border-none outline-none flex-1 min-w-[120px] text-xs text-gray-700 bg-transparent"
            placeholder="输入内容项后回车添加"
            @keydown.enter.prevent="handleAddTag"
          />
        </div>
        <div class="text-xs text-gray-400 mt-1">输入内容项后按回车键添加，可添加多个</div>
      </el-form-item>

      <el-form-item label="识别规则">
        <el-input
          v-model="form.rulesDesc"
          type="textarea"
          :rows="3"
          placeholder="描述AI如何识别该模块，如按标题章节自动归类"
        />
      </el-form-item>

    </el-form>

    <template #footer>
      <div class="dialog-footer">
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
import { Close } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { sectionApi } from '../../api';
import type { ContractSection } from '../../types';

const props = defineProps<{
  modelValue: boolean;
  editData?: ContractSection | null;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const isEdit = ref(false);
const loading = ref(false);
const formRef = ref<FormInstance>();
const inputTagText = ref('');

const form = reactive({
  id: undefined as number | string | undefined,
  sectionTitle: '',
  subNamesList: ['服务内容'] as string[],
  rulesDesc: '',
  scope: 'all' as 'contract' | 'order' | 'all',
});

const rules: FormRules = {
  sectionTitle: [{ required: true, message: '请输入模块名称', trigger: 'blur' }],
  scope: [{ required: true, message: '请选择适配范围', trigger: 'change' }],
  subNamesList: [{ type: 'array', required: true, message: '请至少添加一个对应合同内模块名称', trigger: 'change' }],
};

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
    form.sectionTitle = val.section_title;
    form.subNamesList = val.sub_names ? val.sub_names.split(',').filter(Boolean) : [val.section_title];
    form.rulesDesc = val.rules_desc || '';
    form.scope = val.scope || 'all';
  } else {
    isEdit.value = false;
    form.id = undefined;
    form.sectionTitle = '';
    form.subNamesList = [];
    form.rulesDesc = '';
    form.scope = 'all';
  }
});

function handleAddTag() {
  const val = inputTagText.value.trim();
  if (val && !form.subNamesList.includes(val)) {
    form.subNamesList.push(val);
    inputTagText.value = '';
  }
}

function removeSubNameTag(index: number) {
  form.subNamesList.splice(index, 1);
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const subNamesStr = form.subNamesList.join(',');
      if (isEdit.value) {
        await sectionApi.update({
          id: form.id,
          sectionTitle: form.sectionTitle,
          subNames: subNamesStr,
          rulesDesc: form.rulesDesc,
          status: 1,
          scope: form.scope,
        });
        ElMessage.success('编辑成功');
      } else {
        await sectionApi.create({
          sectionTitle: form.sectionTitle,
          subNames: subNamesStr,
          rulesDesc: form.rulesDesc,
          status: 1,
          scope: form.scope,
        });
        ElMessage.success('新增成功');
      }
      visible.value = false;
      emit('success');
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style scoped>
.scope-radio-group :deep(.el-radio__input.is-checked .el-radio__inner) {
  background-color: #303133;
  border-color: #303133;
}
.scope-radio-group :deep(.el-radio__input.is-checked + .el-radio__label) {
  color: #303133;
  font-weight: 500;
}
</style>
