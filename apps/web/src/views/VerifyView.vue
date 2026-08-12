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
        <span v-else-if="isMultiMode" class="text-xs text-[#049667] font-semibold bg-[#E6F8F0] px-2 py-0.5 rounded-full">
          {{ activeTabIndex + 1 }} / {{ fileTabs.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <el-button v-if="isReadOnly" @click="goBack">关闭</el-button>
        <el-button
          v-else
          type="primary"
          style="background-color: #049667; border-color: #049667;"
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
          ? 'border-[#049667] text-[#049667] bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-800'"
        @click="switchFileTab(index)"
      >
        <span class="w-2 h-2 rounded-full" :class="tab.verified ? 'bg-[#049667]' : 'bg-orange-400'"></span>
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

        <!-- PDF 内容仿纸张渲染区 -->
        <div class="flex-1 overflow-y-auto p-4 flex justify-center bg-gray-100/60">
          <div class="bg-white shadow border border-gray-200 rounded-lg p-8 w-[420px] text-gray-700 leading-relaxed text-xs space-y-3">
            <div class="text-center mb-4 border-b border-gray-100 pb-3">
              <div class="w-14 h-14 mx-auto mb-2 bg-gray-100 rounded flex items-center justify-center text-[10px] text-gray-400">
                二维码/印章
              </div>
              <div class="text-[11px] text-gray-400 font-mono">合同编号：{{ currentForm.customerContractNo }}</div>
            </div>

            <h2 class="text-center text-base font-bold text-[#1A1A1A] mb-4">{{ currentForm.contractName }}</h2>

            <p><strong class="text-gray-900">甲方：</strong>{{ currentForm.customerName }}</p>
            <p><strong class="text-gray-900">乙方：</strong>{{ currentForm.signingEntity }}</p>
            <p><strong class="text-gray-900">签订地点：</strong>南京市江宁区软件园</p>
            <p><strong class="text-gray-900">签订日期：</strong>{{ currentForm.signDate }}</p>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第一条 服务内容</p>
              <p class="text-gray-600">乙方为甲方提供智能运维与算力服务，基于 AIOps 智能平台进行 7×24 小时监控与自动化故障预测修复...</p>
            </div>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第二条 服务期限</p>
              <p class="text-gray-600">本合同服务期限为一年，自 {{ currentForm.startDate }} 起至 {{ currentForm.endDate }} 止。</p>
            </div>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第三条 合同金额</p>
              <p class="text-gray-600">本合同总金额为人民币 {{ currentForm.amount }} 元（含税），适用税率为 {{ currentForm.taxRate }}。</p>
            </div>

            <div class="border-t border-gray-200 pt-3">
              <p class="font-bold text-gray-900 mb-1">第四条 技术要求</p>
              <p class="text-gray-600">乙方团队需具备机器学习、深度学习相关技术能力，项目人员资质符合考核线评定标准。</p>
            </div>
          </div>
        </div>

        <!-- PDF 分页指示 -->
        <div class="flex items-center justify-center gap-2 px-4 py-2 border-t border-gray-200 bg-white shrink-0 text-xs">
          <button class="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
          <span class="text-gray-600 font-medium">1 / 12 页</span>
          <button class="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
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
                  <span class="tag tag-green" style="font-size: 10px">命中 3 项</span>
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
                  <span class="tag tag-green" style="font-size: 10px">命中 2 项</span>
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

              <!-- 岗位说明 -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">岗位说明</div>
                  <span class="tag tag-gray" style="font-size: 10px">未命中</span>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span v-if="currentForm.keywords['岗位说明'].length === 0" class="text-gray-400">AI未识别到关键词</span>
                  <span
                    v-for="(kw, kIdx) in currentForm.keywords['岗位说明']"
                    :key="kIdx"
                    class="tag tag-green inline-flex items-center gap-1"
                    style="font-size: 11px"
                  >
                    {{ kw }}
                    <el-icon v-if="!isReadOnly" class="cursor-pointer hover:text-red-500" @click="removeKeyword('岗位说明', kIdx)"><Close /></el-icon>
                  </span>
                  <button
                    v-if="!isReadOnly"
                    class="inline-flex items-center gap-0.5 text-xs text-[#049667] border border-dashed border-[#049667] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                    @click="addKeywordPrompt('岗位说明')"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              <!-- 人员需求 -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-[#1A1A1A]">人员需求</div>
                  <span class="tag tag-gray" style="font-size: 10px">未命中</span>
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
import { contractApi } from '../api';

const route = useRoute();
const router = useRouter();

const isReadOnly = computed(() => route.query.readonly === 'true');
const isMultiMode = computed(() => route.query.mode === 'multi');
const activeTabIndex = ref(0);
const targetId = computed(() => (route.query.id ? Number(route.query.id) : null));

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
        岗位说明: [] as string[],
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
        岗位说明: ['数据标注员'],
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
        岗位说明: ['巡检专家'],
        人员需求: [] as string[],
      },
    },
  },
]);

onMounted(async () => {
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
      }
    } catch (e) {
      // 降级使用默认展示数据
    }
  }
});

const currentTab = computed(() => fileTabs.value[activeTabIndex.value] || fileTabs.value[0]);
const currentForm = computed(() => currentTab.value.form);

function switchFileTab(index: number) {
  activeTabIndex.value = index;
}

function removeKeyword(sectionKey: string, index: number) {
  if (isReadOnly.value) return;
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
      if (!kwList.includes(value.trim())) {
        kwList.push(value.trim());
        ElMessage.success(`已为【${sectionKey}】添加关键词: ${value.trim()}`);
      }
    }
  });
}

async function handleSaveCurrent() {
  if (isReadOnly.value) return;

  // 1. 调用后端 API，更新核对状态 verify_status = 1 (已核对)
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
