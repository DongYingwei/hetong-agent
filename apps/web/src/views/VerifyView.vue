<template>
  <div class="h-[calc(100vh-64px)] flex flex-col -m-6 bg-white overflow-hidden">
    <!-- 核对页面顶栏 -->
    <div class="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <el-button @click="goBack">
          <el-icon class="mr-1"><Back /></el-icon> 返回
        </el-button>

        <span class="text-sm font-bold text-[#1A1A1A]">
          {{ isReadOnly ? '人工核对信息查看' : '人工核对' }}
        </span>

        <span v-if="isReadOnly" class="tag tag-gray">只读模式</span>
        <span v-else-if="isMultiMode" class="text-xs font-semibold bg-[#f3f4f6] px-2 py-0.5 rounded-full">
          {{ activeTabIndex + 1 }} / {{ fileTabs.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <el-button v-if="isReadOnly" @click="goBack">关闭</el-button>
        <el-button
          v-else
          @click="handleSaveCurrent"
        >
          保存已核对数据
        </el-button>
      </div>
    </div>

    <!-- 多合同标签栏（导入多合同模式显示） -->
    <div v-if="isMultiMode && !isReadOnly" class="bg-gray-50/80 border-b border-gray-200 px-6 py-0 flex items-center gap-1 shrink-0 overflow-x-auto">
      <div
        v-for="(tab, index) in fileTabs"
        :key="index"
        class="flex items-center gap-2 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors select-none"
        :class="activeTabIndex === index
          ? 'border-gray-300 text-[#303133] bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-800'"
        @click="switchFileTab(index)"
      >
        <span class="w-2 h-2 rounded-full" :class="tab.verified ? 'bg-[#303133]' : 'bg-orange-400'"></span>
        <span>{{ tab.fileName }}</span>
      </div>
    </div>

    <!-- 左右分栏核对区 -->
    <div class="flex-1 flex min-h-0 overflow-hidden">
      <!-- 左侧：PDF 预览与合同原文 (42% 宽度) -->
      <div class="w-[42%] bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">
        <!-- PDF 工具栏 -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <span class="text-xs font-medium text-gray-700 truncate">{{ currentTab.fileName }}</span>
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

        <!-- 优先原始 PDF；草稿上传尚无持久化源文件时才回退 MinerU Markdown。 -->
        <div class="flex-1 overflow-y-auto p-4 bg-gray-100/60">
          <div v-if="originalPdfUrl" class="h-full bg-white shadow border border-gray-200 rounded-lg overflow-hidden">
            <iframe :src="originalPdfUrl" class="w-full h-full border-0" title="合同原始 PDF" />
          </div>
          <div v-else class="bg-white shadow border border-gray-200 rounded-lg p-6 text-gray-700 leading-relaxed text-[13px]">
            <div v-if="mineruMd" class="markdown-body" v-html="renderMarkdown(mineruMd)"></div>
            <div v-else class="text-gray-400 text-center py-16">暂无已关联的合同原始 PDF</div>
          </div>
        </div>
      </div>

      <!-- 右侧：字段核对表单与 AI 关键词 (58% 宽度) -->
      <div class="flex-1 flex flex-col overflow-hidden bg-white">
        <div class="flex-1 overflow-y-auto p-5 space-y-6">
          <!-- 1. 合同检索信息 -->
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h3 class="text-sm font-bold text-[#1A1A1A]">合同检索信息</h3>
              <span class="text-xs text-gray-400 font-medium">AI 识别 7 项</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-0.5">
                  合同号 <span class="text-red-500">*</span>
                </label>
                <el-input v-model="currentForm.contractNo" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  客户名称 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.customerName" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  合同名称 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.contractName" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0">考核线</label>
                <el-input v-model="currentForm.assessmentLine" size="small" placeholder="请输入考核线" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0">中标编号</label>
                <el-input v-model="currentForm.bidNo" size="small" placeholder="请输入中标编号" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0">关联主合同号</label>
                <el-input v-model="currentForm.mainContractNo" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0">框架简称</label>
                <el-input v-model="currentForm.frameworkShortName" size="small" placeholder="单项合同填 /" :disabled="isReadOnly" />
              </div>
            </div>
          </div>

          <!-- 2. 合同-概要信息 -->
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h3 class="text-sm font-bold text-[#1A1A1A]">合同-概要信息</h3>
              <span class="text-xs text-gray-400 font-medium">AI 识别 6 项</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  客方合同号 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.customerContractNo" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  签约法人体 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.signingEntity" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  合同类型 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-select v-model="currentForm.contractType" size="small" class="w-full" :disabled="isReadOnly">
                  <el-option label="单项合同" :value="2" />
                  <el-option label="框架协议" :value="1" />
                  <el-option label="补充协议" :value="3" />
                </el-select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  签约时间 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.signDate" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  开始时间 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.startDate" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  结束时间 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.endDate" size="small" :disabled="isReadOnly" />
              </div>
            </div>
          </div>

          <!-- 3. 合同-金额及结算 -->
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h3 class="text-sm font-bold text-[#1A1A1A]">合同-金额及结算</h3>
              <span class="text-xs text-gray-400 font-medium">AI 识别 4 项</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  金额属性 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-select v-model="currentForm.amountAttr" size="small" class="w-full" :disabled="isReadOnly">
                  <el-option label="固定金额" value="固定金额" />
                  <el-option label="上限金额" value="上限金额" />
                  <el-option label="预估金额" value="预估金额" />
                </el-select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  合同金额(含税) <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.amount" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  税率 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.taxRate" size="small" :disabled="isReadOnly" />
              </div>
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0 flex items-center gap-1">
                  结算条款 <span class="tag tag-green" style="font-size: 10px; padding: 0 4px;">AI</span>
                </label>
                <el-input v-model="currentForm.settlementTerms" size="small" :disabled="isReadOnly" />
              </div>
            </div>
          </div>

          <!-- 4. 风控管理 -->
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h3 class="text-sm font-bold text-[#1A1A1A]">风控管理</h3>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div class="flex items-center gap-2">
                <label class="text-gray-500 w-24 shrink-0">合同状态 <span class="text-red-500">*</span></label>
                <el-select v-model="currentForm.contractStatus" size="small" class="w-full" :disabled="isReadOnly">
                  <el-option label="流水中" :value="1" />
                  <el-option label="已签约" :value="2" />
                  <el-option label="已闭环" :value="3" />
                  <el-option label="已作废" :value="4" />
                </el-select>
              </div>
            </div>
          </div>

          <!-- 5. 关键词解析结果 -->
          <div>
            <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h3 class="text-sm font-bold text-[#1A1A1A]">关键词解析结果</h3>
              <span class="tag tag-green">包含AI关键词</span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs">
              <!-- 服务内容 -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">服务内容<span class="text-gray-400 font-normal">（服务标的）</span></div>
                  <span class="tag" :class="keywordCount('服务内容') ? 'tag-green' : 'tag-gray'" style="font-size: 10px">{{ keywordCount('服务内容') ? `命中 ${keywordCount('服务内容')} 项` : '未命中' }}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span
                    v-for="(kw, kIdx) in currentForm.keywords['服务内容']"
                    :key="kIdx"
                    class="tag tag-green inline-flex items-center gap-1"
                    style="font-size: 11px"
                  >
                    {{ kw }}
                    <el-icon v-if="!isReadOnly" class="cursor-pointer hover:text-red-500" @click="removeKeyword('服务内容', kIdx)"><Close /></el-icon>
                  </span>
                  <button
                    v-if="!isReadOnly"
                    class="inline-flex items-center gap-0.5 text-xs text-[#049667] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                    @click="addKeywordPrompt('服务内容')"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              <!-- 技术要求 -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">技术要求<span class="text-gray-400 font-normal">（技术储备）</span></div>
                  <span class="tag" :class="keywordCount('技术要求') ? 'tag-green' : 'tag-gray'" style="font-size: 10px">{{ keywordCount('技术要求') ? `命中 ${keywordCount('技术要求')} 项` : '未命中' }}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span
                    v-for="(kw, kIdx) in currentForm.keywords['技术要求']"
                    :key="kIdx"
                    class="tag tag-green inline-flex items-center gap-1"
                    style="font-size: 11px"
                  >
                    {{ kw }}
                    <el-icon v-if="!isReadOnly" class="cursor-pointer hover:text-red-500" @click="removeKeyword('技术要求', kIdx)"><Close /></el-icon>
                  </span>
                  <button
                    v-if="!isReadOnly"
                    class="inline-flex items-center gap-0.5 text-xs text-[#049667] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                    @click="addKeywordPrompt('技术要求')"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              <!-- 项目名称（module_key 沿用 role，保证历史外键稳定） -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">项目名称</div>
                  <span class="tag" :class="keywordCount('项目名称') ? 'tag-green' : 'tag-gray'" style="font-size: 10px">{{ keywordCount('项目名称') ? `命中 ${keywordCount('项目名称')} 项` : '未命中' }}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span v-if="currentForm.keywords['项目名称'].length === 0" class="text-gray-400">AI未识别到关键词</span>
                  <span
                    v-for="(kw, kIdx) in currentForm.keywords['项目名称']"
                    :key="kIdx"
                    class="tag tag-green inline-flex items-center gap-1"
                    style="font-size: 11px"
                  >
                    {{ kw }}
                    <el-icon v-if="!isReadOnly" class="cursor-pointer hover:text-red-500" @click="removeKeyword('项目名称', kIdx)"><Close /></el-icon>
                  </span>
                  <button
                    v-if="!isReadOnly"
                    class="inline-flex items-center gap-0.5 text-xs text-[#049667] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                    @click="addKeywordPrompt('项目名称')"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              <!-- 人员需求 -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">人员需求</div>
                  <span class="tag" :class="keywordCount('人员需求') ? 'tag-green' : 'tag-gray'" style="font-size: 10px">{{ keywordCount('人员需求') ? `命中 ${keywordCount('人员需求')} 项` : '未命中' }}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span v-if="currentForm.keywords['人员需求'].length === 0" class="text-gray-400">AI未识别到关键词</span>
                  <span
                    v-for="(kw, kIdx) in currentForm.keywords['人员需求']"
                    :key="kIdx"
                    class="tag tag-green inline-flex items-center gap-1"
                    style="font-size: 11px"
                  >
                    {{ kw }}
                    <el-icon v-if="!isReadOnly" class="cursor-pointer hover:text-red-500" @click="removeKeyword('人员需求', kIdx)"><Close /></el-icon>
                  </span>
                  <button
                    v-if="!isReadOnly"
                    class="inline-flex items-center gap-0.5 text-xs text-[#049667] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                    @click="addKeywordPrompt('人员需求')"
                  >
                    + 添加
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white shrink-0">
          <el-button v-if="isReadOnly" type="primary" style="background-color: #049667; border-color: #049667;" @click="goBack">
            关闭只读查看
          </el-button>
          <template v-else>
            <el-button @click="goBack">取消</el-button>
            <el-button
              type="primary"
              style="background-color: #049667; border-color: #049667;"
              @click="handleSaveCurrent"
            >
              {{ isMultiMode && activeTabIndex < fileTabs.length - 1 ? '保存并核对下一份' : '保存已核对数据' }}
            </el-button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Back, Search, ZoomIn, ZoomOut, Close } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { contractApi, keywordApi, parseApi } from '../api';
import type { ContractKeywordHit } from '../api/contractApi';
import { renderMarkdown } from '../utils/markdown';

const route = useRoute();
const router = useRouter();

const isReadOnly = computed(() => route.query.readonly === 'true');
const isMultiMode = computed(() => route.query.mode === 'multi');
const activeTabIndex = ref(0);
const targetId = computed(() => (route.query.id ? Number(route.query.id) : null));
// 解析草稿模式：?draftId=N（对接 /api/parse/draft，人工核对入正式库+建向量）。
const draftId = computed(() => (route.query.draftId ? Number(route.query.draftId) : null));
// 合同原文（MinerU 解析的 Markdown，草稿模式渲染到左栏）。
const mineruMd = ref('');
const originalPdfUrl = ref('');
const keywordHits = ref<ContractKeywordHit[]>([]);
const keywordIdByName = ref<Record<string, number>>({});

// 多合同核对 Tab 视图数据
const fileTabs = ref([
  {
    id: 1,
    fileName: '兴晟泽合同.pdf',
    verified: false,
    form: {
      contractNo: 'HT-2026-0892',
      customerName: '兴晟泽科技有限公司',
      contractName: '智能运维服务合同',
      assessmentLine: '电力',
      bidNo: 'ZB-2026-0419',
      mainContractNo: '/',
      frameworkShortName: '/',
      customerContractNo: 'XSZ-2026-OM-001',
      signingEntity: '华苏科技有限公司',
      contractType: 2,
      signDate: '2026-07-15',
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      amountAttr: '固定金额',
      amount: '860000',
      taxRate: '6%',
      settlementTerms: '签约后10个工作日内付30%预付款，运维满6个月支付50%...',
      contractStatus: 2,
      keywords: {
        服务内容: ['智能运维', 'AIOps', '智能算法'],
        技术要求: ['机器学习', '深度学习'],
        项目名称: [] as string[],
        人员需求: [] as string[],
      },
    },
  },
  {
    id: 2,
    fileName: '华苏开发协议.pdf',
    verified: false,
    form: {
      contractNo: 'HT-2026-0891',
      customerName: '华苏科技有限公司',
      contractName: '数据标注平台开发协议',
      assessmentLine: '软件',
      bidNo: 'ZB-2026-0388',
      mainContractNo: '/',
      customerContractNo: 'HS-2026-DEV-008',
      signingEntity: '华南电力工程集团',
      contractType: 2,
      signDate: '2026-06-20',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      amountAttr: '固定金额',
      amount: '1200000',
      taxRate: '6%',
      settlementTerms: '项目上线验收合格后30日内全额结清...',
      contractStatus: 2,
      keywords: {
        服务内容: ['数据标注', '模型训练'],
        技术要求: ['Python', 'PyTorch'],
        项目名称: ['数据标注员'],
        人员需求: ['算法工程师'],
      },
    },
  },
  {
    id: 3,
    fileName: '电网巡检合同.pdf',
    verified: false,
    form: {
      contractNo: 'HT-2026-0887',
      customerName: '国家电网江苏省电力公司',
      contractName: '无人机巡检AI识别建设合同',
      assessmentLine: '电力',
      bidNo: 'SG-2026-9021',
      mainContractNo: '/',
      customerContractNo: 'SG-2026-AI-102',
      signingEntity: '远东通信股份有限公司',
      contractType: 1,
      signDate: '2026-05-12',
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      amountAttr: '上限金额',
      amount: '4600000',
      taxRate: '6%',
      settlementTerms: '按季度根据实际巡检识别工单结算...',
      contractStatus: 2,
      keywords: {
        服务内容: ['无人机巡检', '图像识别'],
        技术要求: ['计算机视觉', 'CV算法'],
        项目名称: ['巡检专家'],
        人员需求: [] as string[],
      },
    },
  },
]);

onMounted(async () => {
  // 解析草稿模式：从 /api/parse/draft 读抽取字段供人工核对（优先于运营库模式）。
  if (draftId.value) {
    try {
      const res = await parseApi.getDraft(draftId.value);
      const tab = fileTabs.value[0];
      if (res.code === 200 && res.data && tab) {
        const f = res.data.form || {};
        const form = tab.form as any;
        // 草稿模式只核对这一份，去掉剩余的 mock tab（兴晟泽/华苏/电网巡检那批假数据）。
        fileTabs.value = [tab];
        tab.id = res.data.draft_id;
        tab.fileName = (f.contract_name || f.contract_no || '待核对合同') + '.pdf';
        // 合同原文：MinerU 解析的 Markdown（左栏渲染，替代旧的假纸张）。
        mineruMd.value = res.data.mineru_md_preview || '';
        form.contractNo = f.contract_no || '';
        form.customerName = f.customer_name || '';
        form.contractName = f.contract_name || '';
        form.assessmentLine = f.assessment_line || '';
        form.signingEntity = f.signing_entity || '';
        form.customerContractNo = f.customer_contract_no || '';
        form.signDate = f.sign_date || '';
        form.startDate = f.start_date || '';
        form.endDate = f.end_date || '';
        form.amountAttr = f.amount_type || '';
        form.amount = f.amount != null ? String(f.amount) : '';
        form.taxRate = f.tax_rate || '';
        form.settlementTerms = f.settlement_terms || '';
        // 模块命中 → 核对页关键词区（keywords 是逗号分隔字符串）
        const modMap: Record<string, string> = { service: '服务内容', tech: '技术要求', role: '项目名称', staff: '人员需求' };
        const kw: Record<string, string[]> = { 服务内容: [], 技术要求: [], 项目名称: [], 人员需求: [] };
        for (const h of res.data.module_hits || []) {
          const name = modMap[h.module_key];
          if (name && h.keywords) kw[name] = String(h.keywords).split(',').filter(Boolean);
        }
        form.keywords = kw;
      }
    } catch (e) {
      ElMessage.error('读取解析草稿失败');
    }
    return;
  }
  // 运营库模式（旧）：从 contractApi 读已入库合同。
  if (targetId.value) {
    try {
      const res = await contractApi.getDetail(targetId.value);
      if (res.code === 200 && res.data.contract) {
        const item = res.data.contract;
        fileTabs.value[0].id = item.id;
        fileTabs.value[0].fileName = item.contract_name + '.pdf';
        fileTabs.value[0].form.contractNo = item.contract_no;
        fileTabs.value[0].form.customerName = item.customer_name;
        fileTabs.value[0].form.contractName = item.contract_name;
        fileTabs.value[0].form.contractType = item.contract_type;
        fileTabs.value[0].form.signDate = item.sign_date ? item.sign_date.substring(0, 10) : '2026-07-15';
        fileTabs.value[0].form.amount = String(item.amount);
        fileTabs.value[0].form.assessmentLine = item.assessment_line || '通用';
        fileTabs.value[0].form.contractStatus = item.contract_status;
        fileTabs.value[0].verified = item.verify_status === 1;
        const [hitRes, keywordRes] = await Promise.all([
          contractApi.getKeywordHits(item.id),
          keywordApi.getList({ page: 1, pageSize: 100 }),
        ]);
        if (hitRes.code === 200) {
          keywordHits.value = hitRes.data.list || [];
          const modMap: Record<string, string> = { service: '服务内容', tech: '技术要求', role: '项目名称', staff: '人员需求', project: '项目名称' };
          const grouped: Record<string, string[]> = { 服务内容: [], 技术要求: [], 项目名称: [], 人员需求: [] };
          for (const hit of keywordHits.value) {
            const section = hit.module_key ? modMap[hit.module_key] : undefined;
            if (section && grouped[section] && !grouped[section].includes(hit.keyword_name)) grouped[section].push(hit.keyword_name);
          }
          fileTabs.value[0].form.keywords = grouped;
        }
        if (keywordRes.code === 200) {
          keywordIdByName.value = Object.fromEntries((keywordRes.data.list || []).map((x: any) => [x.keyword_name, x.id]));
        }
        await loadOriginalPdf(item.id);
      }
    } catch (e) {
      // 降级使用默认展示数据
    }
  }
});

async function loadOriginalPdf(contractId: number) {
  try {
    const response = await fetch(contractApi.getOriginalPdfUrl(contractId), {
      headers: { Authorization: `Bearer ${localStorage.getItem('contract_token') || ''}` },
    });
    if (!response.ok) return;
    const blob = await response.blob();
    originalPdfUrl.value = URL.createObjectURL(blob);
  } catch {
    // 原始文件缺失时自然回退 MinerU Markdown / 空状态，不影响右侧台账信息。
  }
}

const currentTab = computed(() => fileTabs.value[activeTabIndex.value] || fileTabs.value[0]);
const currentForm = computed(() => currentTab.value.form);

function keywordCount(section: '服务内容' | '技术要求' | '项目名称' | '人员需求') {
  return currentForm.value.keywords[section]?.length || 0;
}

function switchFileTab(index: number) {
  activeTabIndex.value = index;
}

async function removeKeyword(sectionKey: string, index: number) {
  if (isReadOnly.value) return;
  const keyword = currentForm.value.keywords[sectionKey as keyof typeof currentForm.value.keywords][index];
  const moduleMap: Record<string, string> = { 服务内容: 'service', 技术要求: 'tech', 项目名称: 'role', 人员需求: 'staff' };
  const keywordId = keywordIdByName.value[keyword];
  if (targetId.value && keywordId && moduleMap[sectionKey]) {
    await contractApi.saveKeywordOverride(targetId.value, { module_key: moduleMap[sectionKey], keyword_id: keywordId, action: 'exclude' });
  }
  currentForm.value.keywords[sectionKey as keyof typeof currentForm.value.keywords].splice(index, 1);
}

function addKeywordPrompt(sectionKey: string) {
  if (isReadOnly.value) return;
  ElMessageBox.prompt(`为【${sectionKey}】手动添加关键词`, '添加关键词', {
    confirmButtonText: '确定添加',
    cancelButtonText: '取消',
    inputPlaceholder: '请输入关键词名称（如：AI预测）',
  }).then(({ value }) => {
    if (value && value.trim()) {
      const kwList = currentForm.value.keywords[sectionKey as keyof typeof currentForm.value.keywords];
      const keyword = value.trim();
      const moduleMap: Record<string, string> = { 服务内容: 'service', 技术要求: 'tech', 项目名称: 'role', 人员需求: 'staff' };
      const keywordId = keywordIdByName.value[keyword];
      if (targetId.value && (!keywordId || !moduleMap[sectionKey])) {
        ElMessage.error('只能添加关键词管理中已启用的父关键词');
        return;
      }
      if (!kwList.includes(keyword)) {
        if (targetId.value && keywordId) {
          contractApi.saveKeywordOverride(targetId.value, { module_key: moduleMap[sectionKey], keyword_id: keywordId, action: 'include' })
            .catch(() => ElMessage.error('保存关键词核对失败'));
        }
        kwList.push(keyword);
        ElMessage.success(`已为【${sectionKey}】添加关键词: ${keyword}`);
      }
    }
  });
}

async function handleSaveCurrent() {
  if (isReadOnly.value) return;

  // 解析草稿模式：把人工编辑后的字段作为 overrides 提交 → 入正式库 + 建向量。
  if (draftId.value) {
    const f = currentForm.value;
    const overrides: Record<string, unknown> = {
      contract_no: f.contractNo,
      customer_name: f.customerName,
      contract_name: f.contractName,
      assessment_line: f.assessmentLine,
      signing_entity: f.signingEntity,
      customer_contract_no: f.customerContractNo,
      sign_date: f.signDate || null,
      start_date: f.startDate || null,
      end_date: f.endDate || null,
      amount_type: f.amountAttr || null,
      amount: f.amount ? Number(String(f.amount).replace(/[^\d.]/g, '')) : null,
      tax_rate: f.taxRate || null,
      settlement_terms: f.settlementTerms || null,
    };
    try {
      const res = await parseApi.confirm(draftId.value, overrides);
      if (res.code === 200) {
        currentTab.value.verified = true;
        ElMessage.success(`核对入库成功！已建向量 ${res.data.chunks} 个片段，合同 id=${res.data.contract_id}`);
        router.push('/ledger');
      } else {
        ElMessage.error(res.msg || '核对入库失败');
      }
    } catch (e: any) {
      ElMessage.error(`核对入库失败：${e?.response?.data?.msg || e?.message || '未知错误'}`);
    }
    return;
  }

  // 运营库模式（旧）：更新核对状态 verify_status = 1。
  const idToVerify = currentTab.value.id || targetId.value;
  if (idToVerify) {
    try {
      await contractApi.verify(idToVerify);
    } catch (e) {}
  }

  currentTab.value.verified = true;

  if (isMultiMode.value && activeTabIndex.value < fileTabs.value.length - 1) {
    ElMessage.success(`《${currentTab.value.fileName}》人工核对保存完成，自动进入下一份`);
    activeTabIndex.value++;
  } else {
    ElMessage.success('合同人工核对保存完成！台账状态已同步更新为【已核对】');
    router.push('/ledger');
  }
}

function goBack() {
  router.push('/ledger');
}
</script>
