<template>
  <div class="h-[calc(100vh-64px)] flex flex-col -m-6 bg-white overflow-hidden">
    <!-- 顶栏 (1:1 还原 demo.html page-compare) -->
    <div class="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <el-button @click="goBack">
          <el-icon class="mr-1"><Back /></el-icon> 返回
        </el-button>
        <span class="text-sm font-bold text-[#1A1A1A]">原文件对比</span>
        <span class="tag tag-gray">只读模式</span>
      </div>
      <div class="flex items-center gap-2">
        <el-button @click="goBack">关闭</el-button>
      </div>
    </div>

    <!-- 左右分栏 (1:1 还原 demo.html) -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- 左侧：PDF 原文件预览 (42% 宽度) -->
      <div class="w-[42%] bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <span class="text-xs font-medium text-gray-700 truncate">{{ contractDetail.contract_name || '智能客服系统建设合同' }}.pdf</span>
          <div class="flex items-center gap-1">
            <button class="w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-500 border-none bg-transparent">
              <el-icon><Search /></el-icon>
            </button>
            <button class="w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-500 border-none bg-transparent">
              <el-icon><ZoomOut /></el-icon>
            </button>
            <button class="w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-500 border-none bg-transparent">
              <el-icon><ZoomIn /></el-icon>
            </button>
          </div>
        </div>

        <!-- 仿纸张 PDF 扫描文本渲染 -->
        <div class="flex-1 overflow-y-auto p-4 flex justify-center bg-gray-100/60">
          <div class="bg-white shadow border border-gray-200 rounded-lg p-8 w-[420px] text-gray-700 leading-relaxed text-xs space-y-3">
            <div class="text-center mb-4 border-b border-gray-100 pb-3">
              <div class="w-14 h-14 mx-auto mb-2 bg-gray-100 rounded flex items-center justify-center text-[10px] text-gray-400">
                二维码/加盖公章
              </div>
              <div class="text-[11px] text-gray-400 font-mono">客方编号：CMCC-2026-AI-003</div>
            </div>

            <h2 class="text-center text-base font-bold text-[#1A1A1A] mb-4">{{ contractDetail.contract_name || '智能客服系统建设合同' }}</h2>

            <p><strong class="text-gray-900">甲方：</strong>{{ contractDetail.customer_name || '中国移动通信集团' }}</p>
            <p><strong class="text-gray-900">乙方：</strong>华苏科技有限公司</p>
            <p><strong class="text-gray-900">签订地点：</strong>北京</p>
            <p><strong class="text-gray-900">签订日期：</strong>{{ contractDetail.sign_date || '2026-06-15' }}</p>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第一条 项目内容</p>
              <p class="text-gray-600">乙方为甲方建设智能客服系统，包含 NLP 大模型引擎、知识图谱与多模态语音交互模块...</p>
            </div>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第二条 服务期限</p>
              <p class="text-gray-600">本合同服务期限为一年，自 2026 年 7 月 1 日起至 2027 年 6 月 30 日止。</p>
            </div>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第三条 合同金额</p>
              <p class="text-gray-600">本合同总金额为人民币 {{ formatCurrency(contractDetail.amount || 5800000) }} 元（含税），适用税率为 6%。</p>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-center gap-2 px-4 py-2 border-t border-gray-200 bg-white shrink-0 text-xs">
          <button class="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
          <span class="text-gray-600 font-medium">1 / 18 页</span>
          <button class="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
        </div>
      </div>

      <!-- 右侧：台账录入信息对比 (只读 58% 宽度) -->
      <div class="flex-1 flex flex-col overflow-hidden bg-white">
        <div class="flex-1 overflow-y-auto p-5 space-y-6">
          <div class="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 class="text-sm font-bold text-[#1A1A1A]">台账录入信息对比</h3>
            <span class="text-xs text-gray-400">只读模式 · 不可编辑</span>
          </div>

          <!-- 合同检索信息 -->
          <div class="mb-5">
            <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-2 border-b border-gray-100">合同检索信息</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <label class="text-gray-400">合同号</label>
                <div class="text-sm text-[#1A1A1A] font-mono mt-0.5">{{ contractDetail.contract_no || 'HT-2026-0889' }}</div>
              </div>
              <div>
                <label class="text-gray-400">客户名称</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractDetail.customer_name || '中国移动通信集团' }}</div>
              </div>
              <div>
                <label class="text-gray-400">合同名称</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractDetail.contract_name || '智能客服系统建设合同' }}</div>
              </div>
              <div>
                <label class="text-gray-400">考核线</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractDetail.assessment_line || '通信' }}</div>
              </div>
              <div>
                <label class="text-gray-400">中标编号</label>
                <div class="text-sm text-gray-400 mt-0.5">—</div>
              </div>
              <div>
                <label class="text-gray-400">关联主合同号</label>
                <div class="text-sm text-gray-400 mt-0.5">/</div>
              </div>
              <div>
                <label class="text-gray-400">框架简称</label>
                <div class="text-sm text-gray-400 mt-0.5">—</div>
              </div>
            </div>
          </div>

          <!-- 合同-概要信息 -->
          <div class="mb-5">
            <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-2 border-b border-gray-100">合同-概要信息</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <label class="text-gray-400">客方合同号</label>
                <div class="text-sm text-[#1A1A1A] font-mono mt-0.5">CMCC-2026-AI-003</div>
              </div>
              <div>
                <label class="text-gray-400">签约法人体</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">华苏科技有限公司</div>
              </div>
              <div>
                <label class="text-gray-400">合同类型</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">单项合同</div>
              </div>
              <div>
                <label class="text-gray-400">签约时间</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">{{ contractDetail.sign_date ? contractDetail.sign_date.substring(0,10) : '2026-06-15' }}</div>
              </div>
              <div>
                <label class="text-gray-400">开始时间</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">2026-07-01</div>
              </div>
              <div>
                <label class="text-gray-400">结束时间</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">2027-06-30</div>
              </div>
            </div>
          </div>

          <!-- 合同-金额及结算 -->
          <div class="mb-5">
            <h4 class="text-xs font-semibold text-gray-400 mb-3 pb-2 border-b border-gray-100">合同-金额及结算</h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <label class="text-gray-400">金额属性</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">固定金额</div>
              </div>
              <div>
                <label class="text-gray-400">合同金额(含税)</label>
                <div class="text-sm font-bold text-[#049667] mt-0.5">{{ formatCurrency(contractDetail.amount || 5800000) }}</div>
              </div>
              <div>
                <label class="text-gray-400">税率</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">6%</div>
              </div>
              <div>
                <label class="text-gray-400">结算条款</label>
                <div class="text-sm text-[#1A1A1A] mt-0.5">预付款付 30%，开发完成验收付 70%</div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end px-5 py-3 border-t border-gray-200 bg-white shrink-0">
          <el-button @click="goBack">关闭比对</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Back, Search, ZoomIn, ZoomOut } from '@element-plus/icons-vue';
import { contractApi } from '../api';
import { formatCurrency } from '../utils/formatters';
import type { ContractLedger } from '../types';

const route = useRoute();
const router = useRouter();

const contractDetail = ref<Partial<ContractLedger>>({});

onMounted(async () => {
  const id = route.query.id;
  if (id) {
    try {
      const res = await contractApi.getDetail(Number(id));
      if (res.code === 200 && res.data.contract) {
        contractDetail.value = res.data.contract;
      }
    } catch (e) {}
  }
});

function goBack() {
  router.push('/ledger');
}
</script>
