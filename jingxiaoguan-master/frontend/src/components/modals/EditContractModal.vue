<template>
  <el-dialog
    v-model="visible"
    title="编辑合同"
    width="520px"
    destroy-on-close
  >
    <el-form :model="form" ref="formRef" label-position="top">
      <div class="space-y-5 text-xs">
        <div>
          <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">合同检索信息</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <el-form-item label="合同号" required class="mb-0">
              <el-input v-model="form.contractNo" placeholder="请输入合同号" />
            </el-form-item>
            <el-form-item label="客户名称" class="mb-0">
              <el-input v-model="form.customerName" placeholder="请输入客户名称" />
            </el-form-item>
            <el-form-item label="合同名称" class="col-span-2 mb-0">
              <el-input v-model="form.contractName" placeholder="请输入合同名称" />
            </el-form-item>
            <el-form-item label="考核线" class="mb-0">
              <el-input v-model="form.assessmentLine" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="中标编号" class="mb-0">
              <el-input v-model="form.bidNo" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="关联主合同号" class="mb-0">
              <el-input v-model="form.mainContractNo" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="框架简称" class="mb-0">
              <el-input v-model="form.frameworkShortName" placeholder="单项合同填 /" />
            </el-form-item>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-1.5 border-b border-gray-100">合同-商务条款</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <el-form-item label="是否涉及后评估" class="mb-0">
              <el-select v-model="form.hasPostAssessment" class="w-full">
                <el-option label="是" value="是" />
                <el-option label="否" value="否" />
              </el-select>
            </el-form-item>
            <el-form-item label="履约保证金金额" class="mb-0">
              <el-input v-model="form.depositAmount" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="授权人" class="mb-0">
              <el-input v-model="form.authorizer" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="履约保证金退还条件" class="col-span-2 mb-0">
              <el-input v-model="form.depositRefundCondition" placeholder="请输入退还条件" />
            </el-form-item>
          </div>
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
import { contractApi } from '../../api';
import type { ContractLedger } from '../../types';

const props = defineProps<{
  modelValue: boolean;
  editData?: ContractLedger | null;
}>();

const emit = defineEmits(['update:modelValue', 'success']);

const visible = ref(false);
const loading = ref(false);

const form = reactive({
  id: undefined as number | undefined,
  contractNo: '',
  customerName: '',
  contractName: '',
  assessmentLine: '',
  bidNo: '',
  mainContractNo: '/',
  frameworkShortName: '/',
  hasPostAssessment: '是',
  depositAmount: '86000',
  authorizer: '张明',
  depositRefundCondition: '合同履约完毕且无违约行为后15个工作日内无息退还',
});

watch(() => props.modelValue, (val) => {
  visible.value = val;
});

watch(visible, (val) => {
  emit('update:modelValue', val);
});

watch(() => props.editData, (val) => {
  if (val) {
    form.id = val.id;
    form.contractNo = val.contract_no || '';
    form.customerName = val.customer_name || '';
    form.contractName = val.contract_name || '';
    form.assessmentLine = val.assessment_line || '电力';
  }
});

async function handleSubmit() {
  if (!form.contractNo) {
    ElMessage.error('合同号不能为空');
    return;
  }
  loading.value = true;
  try {
    if (form.id) {
      await contractApi.create({
        contract_no: form.contractNo,
        customer_name: form.customerName,
        contract_name: form.contractName,
        assessment_line: form.assessmentLine,
      });
    }
    ElMessage.success('编辑成功');
    visible.value = false;
    emit('success');
  } finally {
    loading.value = false;
  }
}
</script>
