<template>
  <el-dialog
    v-model="visible"
    title="添加子词"
    width="480px"
    destroy-on-close
  >
    <el-form ref="formRef" label-position="top">
      <el-form-item label="主关键词">
        <div class="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-[#1A1A1A]">
          {{ keywordName }}
        </div>
      </el-form-item>

      <!-- 1:1 还原合同模块【对应合同内模块名称】样式的子词输入区域 -->
      <el-form-item label="包含子词" required>
        <div class="border border-gray-300 rounded-lg p-2.5 min-h-[44px] flex flex-wrap gap-2 items-center bg-white w-full focus-within:border-[#049667] focus-within:ring-1 focus-within:ring-[#049667] transition-all">
          <span
            v-for="(tag, idx) in subWordsList"
            :key="idx"
            class="tag tag-blue flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md"
          >
            {{ tag }}
            <el-icon class="cursor-pointer hover:text-red-500 text-xs" @click="removeSubWordTag(idx)">
              <Close />
            </el-icon>
          </span>
          <input
            v-model="inputTagText"
            class="border-none outline-none flex-1 min-w-[140px] text-xs text-gray-700 bg-transparent"
            placeholder="输入内容项后按回车键添加"
            @keydown.enter.prevent="handleAddTag"
          />
        </div>
        <div class="text-xs text-gray-400 mt-1">输入内容项后按回车键添加，可添加多个</div>
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
import { ref, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { keywordApi } from '../../api';

const props = defineProps<{
  modelValue: boolean;
  keywordId: number | null;
  keywordName: string;
  existingSubWords?: string[];
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const loading = ref(false);
const inputTagText = ref('');
const subWordsList = ref<string[]>([]);

watch(() => props.modelValue, (val) => {
  visible.value = val;
  if (val) {
    inputTagText.value = '';
    subWordsList.value = [];
  }
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

function handleAddTag() {
  const val = inputTagText.value.trim();
  if (val && !subWordsList.value.includes(val)) {
    subWordsList.value.push(val);
    inputTagText.value = '';
  }
}

function removeSubWordTag(index: number) {
  subWordsList.value.splice(index, 1);
}

async function handleSubmit() {
  const val = inputTagText.value.trim();
  if (val && !subWordsList.value.includes(val)) {
    subWordsList.value.push(val);
    inputTagTagTextReset();
  }

  if (subWordsList.value.length === 0) {
    ElMessage.error('请至少添加一个包含子词');
    return;
  }
  if (!props.keywordId) return;

  loading.value = true;
  try {
    const res = await keywordApi.addSubWord(props.keywordId, subWordsList.value);
    if (res.code === 200) {
      ElMessage.success('子词添加成功');
      subWordsList.value = [];
      visible.value = false;
      emit('success');
    } else {
      ElMessage.error(res.msg || '添加失败');
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '添加失败');
  } finally {
    loading.value = false;
  }
}

function inputTagTagTextReset() {
  inputTagText.value = '';
}
</script>
