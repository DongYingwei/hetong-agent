<template>
  <div v-loading="loading">
    <div class="flex items-center justify-between mb-4"><div class="text-sm text-gray-500"><span class="cursor-pointer hover:text-[#049667]" @click="router.push('/ledger')">合同台账</span> / <span class="text-gray-800">合同详情</span></div><el-button @click="router.push('/ledger')"><el-icon class="mr-1"><Back /></el-icon>返回台账列表</el-button></div>
    <template v-if="contract">
      <div class="page-header-card mb-4 flex items-center justify-between"><div><h1 class="text-2xl font-bold text-[#1A1A1A]">{{ contract.contract_name || '—' }}</h1><p class="mt-2 text-xs text-gray-500">合同编号：<span class="font-mono text-gray-800">{{ contract.contract_no }}</span>　客户：{{ contract.customer_name || '—' }}</p></div><el-button type="primary" style="background:#049667;border-color:#049667" @click="goToVerify">{{ contract.verify_status === 1 ? '查看核对' : '去核对' }}</el-button></div>
      <div class="content-card p-5"><el-tabs v-model="tab">
        <el-tab-pane label="基本信息" name="basic"><InfoGrid :items="basic" /></el-tab-pane>
        <el-tab-pane label="合同-金额及结算" name="money"><InfoGrid :items="money" /></el-tab-pane>
        <el-tab-pane label="合同-商务条款" name="commercial"><InfoGrid :items="commercial" /></el-tab-pane>
        <el-tab-pane label="风控管理" name="risk"><InfoGrid :items="risk" /></el-tab-pane>
        <el-tab-pane label="关键词解析" name="keywords"><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div v-for="item in modules" :key="item.key" class="rounded-lg border border-gray-200 p-4"><div class="flex justify-between"><span class="font-medium">{{ item.name }}</span><span class="tag" :class="hit(item.key) ? 'tag-green' : 'tag-gray'">{{ hit(item.key) ? 'AI' : '—' }}</span></div><p class="mt-2 text-xs text-gray-500">{{ keywords(item.key) || '未命中 AI 关键词' }}</p></div></div></el-tab-pane>
        <el-tab-pane label="原文件预览" name="file"><div v-if="files.length" class="mb-3 flex items-center gap-3"><span class="text-sm text-gray-500">附件：</span><el-select v-model="sourceId" class="w-96" @change="loadPdf"><el-option v-for="file in files" :key="file.id" :label="`${file.role === 'primary' ? '主文件 · ' : ''}${file.name}`" :value="file.id" /></el-select></div><el-empty v-if="!files.length && !fileLoading" description="暂无可预览的 PDF 原文件" /><div v-loading="fileLoading" class="h-[70vh] border rounded" v-if="files.length"><iframe v-if="pdfUrl" :src="pdfUrl" class="w-full h-full" title="合同原文件预览" /></div></el-tab-pane>
      </el-tabs></div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { Back } from '@element-plus/icons-vue'; import { useRoute, useRouter } from 'vue-router';
import { contractApi } from '../api'; import { formatCurrency, formatDate } from '../utils/formatters'; import type { ContractLedger } from '../types';
const route=useRoute(), router=useRouter(), loading=ref(false), fileLoading=ref(false), contract=ref<ContractLedger|null>(null), tab=ref('basic'), files=ref<Array<{id:number;name:string;role:string}>>([]), sourceId=ref<number>(), pdfUrl=ref('');
const modules=[{key:'role',name:'项目名称'},{key:'service',name:'服务内容'},{key:'tech',name:'技术要求'},{key:'staff',name:'人员要求'}];
const mk=(items:Array<[string,any]>)=>items.map(([label,value])=>({label,value:value===null||value===undefined||value===''?'—':value}));
const basic=computed(()=>mk([['合同编号',contract.value?.contract_no],['合同名称',contract.value?.contract_name],['客户名称',contract.value?.customer_name],['签约主体',contract.value?.signing_entity],['合同类型',contract.value?.contract_type],['考核线',contract.value?.assessment_line],['签订日期',formatDate(contract.value?.sign_date ?? undefined)],['起止日期',`${formatDate(contract.value?.start_date ?? undefined)||'—'} 至 ${formatDate(contract.value?.end_date ?? undefined)||'—'}`]]));
const money=computed(()=>mk([['金额口径',contract.value?.amount_type],['合同金额',formatCurrency(contract.value?.amount ?? 0)],['税率',contract.value?.tax_rate],['结算方式',contract.value?.settlement_terms]]));
const commercial=computed(()=>mk([['后评估',contract.value?.post_eval],['保证金金额',formatCurrency(contract.value?.deposit_amount ?? 0)],['保证金退还',contract.value?.deposit_refund],['争议解决',contract.value?.arbitration],['授权人',contract.value?.authorizer]]));
const risk=computed(()=>mk([['核对状态',contract.value?.verify_status===1?'已核对':'待核对'],['到期预警',contract.value?.warning_status?'预警':'正常'],['AI 关键词',contract.value?.has_ai_keyword?'AI':'—'],['合同金额',formatCurrency(contract.value?.amount ?? 0)]]));
const InfoGrid=defineComponent({props:{items:{type:Array,required:true}},setup(props){return()=>h('div',{class:'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm'},(props.items as any[]).map(i=>h('div',{class:'border-b border-gray-100 pb-3'},[h('span',{class:'text-gray-400'},`${i.label}：`),h('span',{class:'ml-2 text-gray-800 break-all'},String(i.value))])));}});
function hit(key:string){return !!contract.value?.module_hits?.some(x=>x.module_key===key&&x.hit===1)} function keywords(key:string){return contract.value?.module_hits?.find(x=>x.module_key===key&&x.hit===1)?.keywords||''}
async function loadPdf(){if(!contract.value||!sourceId.value)return;fileLoading.value=true;if(pdfUrl.value)URL.revokeObjectURL(pdfUrl.value);try{const token=localStorage.getItem('contract_token')||'';const res=await fetch(contractApi.getOriginalPdfUrl(contract.value.id,sourceId.value),{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!res.ok)throw new Error('PDF 不可用');pdfUrl.value=URL.createObjectURL(await res.blob())}finally{fileLoading.value=false}}
async function load(){loading.value=true;try{const res=await contractApi.getDetail(Number(route.params.id));if(res.code===200){contract.value=res.data.contract;const sourceRes=await contractApi.getSourceFiles(contract.value.id);files.value=sourceRes.data?.list||[];sourceId.value=files.value[0]?.id;if(sourceId.value)loadPdf()}}finally{loading.value=false}} function goToVerify(){if(contract.value)router.push(`/verify?id=${contract.value.id}`)} onMounted(load);onBeforeUnmount(()=>{if(pdfUrl.value)URL.revokeObjectURL(pdfUrl.value)});
</script>
