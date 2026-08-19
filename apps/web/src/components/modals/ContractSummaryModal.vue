<template>
  <el-dialog v-model="visible" title="合同核对信息" width="680px" destroy-on-close>
    <template v-if="contract">
      <section v-for="section in sections" :key="section.title" class="mb-5">
        <h3 class="font-semibold text-[#1f1f1f] border-b pb-2 mb-3">{{ section.title }}</h3>
        <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div v-for="item in section.items" :key="item.label" :class="'wide' in item && item.wide ? 'col-span-2' : ''">
            <div class="text-gray-400 text-xs mb-1">{{ item.label }}</div>
            <div class="text-[#1f1f1f] break-words">{{ item.value || '—' }}</div>
          </div>
        </div>
      </section>
      <section>
        <h3 class="font-semibold text-[#1f1f1f] border-b pb-2 mb-3">AI关键词解析结果</h3>
        <div class="grid grid-cols-4 gap-2 text-xs">
          <div v-for="m in modules" :key="m.module_key" class="border rounded-lg p-3">
            <div class="text-gray-500">{{ m.name }}</div>
            <span :class="hit(m.module_key) ? 'tag tag-green' : 'text-gray-400'">{{ hit(m.module_key) ? 'AI' : '未命中' }}</span>
          </div>
        </div>
      </section>
    </template>
    <template #footer><el-button @click="visible=false">关闭</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ContractLedger } from '../../types';
const props = defineProps<{ modelValue:boolean; contract: ContractLedger | null; modules: Array<{module_key:string;name:string}> }>();
const emit = defineEmits(['update:modelValue']);
const visible = computed({ get:()=>props.modelValue, set:(v)=>emit('update:modelValue',v) });
const hit=(key:string)=>!!props.contract?.module_hits?.some(x=>x.module_key===key && x.hit===1);
const sections = computed(()=>{ const c=props.contract; if(!c)return []; return [
  {title:'合同检索信息',items:[{label:'合同号',value:c.contract_no},{label:'客户名称',value:c.customer_name},{label:'合同名称',value:c.contract_name,wide:true},{label:'考核线',value:c.assessment_line},{label:'中标编号',value:c.bid_no},{label:'关联主合同号',value:c.related_main_no},{label:'框架简称',value:c.framework_alias}]},
  {title:'合同-概要信息',items:[{label:'客方合同号',value:c.customer_contract_no},{label:'签约法人体',value:c.signing_entity},{label:'合同类型',value:c.contract_type},{label:'签约时间',value:c.sign_date},{label:'开始时间',value:c.start_date},{label:'结束时间',value:c.end_date}]},
  {title:'合同-金额及结算',items:[{label:'金额属性',value:c.amount_type},{label:'合同金额(含税)',value:c.amount==null?'—':`¥${Number(c.amount).toLocaleString()}`},{label:'税率',value:c.tax_rate},{label:'结算条款',value:c.settlement_terms,wide:true}]},
  {title:'合同-商务条款',items:[{label:'是否涉及后评估',value:c.post_eval},{label:'履约保证金金额',value:c.deposit_amount==null?'—':`¥${Number(c.deposit_amount).toLocaleString()}`},{label:'履约保证金退还条件',value:c.deposit_refund,wide:true},{label:'仲裁方式',value:c.arbitration},{label:'授权人',value:c.authorizer}]},
  {title:'风控管理',items:[{label:'合同状态',value:c.status},{label:'合同临期预警',value:c.warning_status?'有预警':'无预警'}]}
]; });
</script>
