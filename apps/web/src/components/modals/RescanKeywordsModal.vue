<template>
  <el-dialog v-model="visible" title="重新扫描关键词" width="500px" destroy-on-close>
    <el-form label-width="110px" label-position="right" class="px-2">
      <el-form-item label="扫描范围">
        <div class="text-sm text-[#303133]">全部已入库合同</div>
        <div class="text-xs text-gray-400 mt-1">按当前启用的模块、关键词和子词重新计算命中结果。</div>
      </el-form-item>
      <el-form-item label="处理内容">
        <div class="text-sm text-[#303133]">关键词命中、四模块 AI 标记、合同 AI 标记</div>
        <div class="text-xs text-gray-400 mt-1">不会重新解析 PDF、重新切片或重建向量库。</div>
      </el-form-item>
      <el-form-item label="人工核对">
        <el-checkbox v-model="overwriteManual">覆盖人工包含/排除结果</el-checkbox>
        <div class="text-xs text-gray-400 mt-1">默认保留人工核对；勾选后将以当前关键词规则重新计算。</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button :disabled="loading" @click="visible = false">取消</el-button>
        <el-button type="primary" style="background-color: #049667; border-color: #049667;" :loading="loading" @click="submit">开始扫描</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { keywordApi } from '../../api';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; success: [contracts: number] }>();
const visible = ref(false);
const overwriteManual = ref(false);
const loading = ref(false);

watch(() => props.modelValue, (value) => { visible.value = value; if (value) overwriteManual.value = false; });
watch(visible, (value) => emit('update:modelValue', value));

async function submit() {
  loading.value = true;
  try {
    const res = await keywordApi.rescan(overwriteManual.value);
    if (res.code !== 200) return ElMessage.error(res.msg || '重新扫描失败');
    ElMessage.success(`已扫描 ${res.data.contracts} 份合同`);
    visible.value = false;
    emit('success', res.data.contracts);
  } catch (error: any) {
    ElMessage.error(error?.message || '重新扫描失败');
  } finally {
    loading.value = false;
  }
}
</script>
