<template>
  <div>
    <!-- 头部渐变卡片 (1:1 还原 demo.html) -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">模块配置</h1>
          <p class="text-xs text-gray-500 mt-1">管理模块定义，配置合同与订单模块归类及关键词检索范围</p>
        </div>
        <el-button
          size="large"
          @click="handleCreate"
        >
          <el-icon class="mr-1"><Plus /></el-icon> 新增模块
        </el-button>
      </div>
    </div>

    <!-- 2列卡片网格布局 (1:1 还原 demo.html) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4" v-loading="loading">
      <div
        v-for="item in sectionList"
        :key="item.id"
        class="content-card p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
      >
        <div>
          <!-- 卡片头部标题与图标 -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-[#f3f4f6] flex items-center justify-center shrink-0">
                <el-icon class="text-[#303133] text-xl"><Collection /></el-icon>
              </div>
              <h3 class="text-base font-semibold text-[#1A1A1A]">{{ item.section_title }}</h3>
            </div>
            <div class="flex items-center gap-2">
              <span :class="scopeTagClass(item.scope)">{{ scopeLabel(item.scope) }}</span>
              <span class="tag tag-green">启用</span>
            </div>
          </div>

          <!-- 对应合同内模块名称 Tags List -->
          <div class="mb-4">
            <div class="text-xs text-gray-400 mb-1.5 font-medium">对应模块名称</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="(sub, sIdx) in parseSubNames(item.sub_names)"
                :key="sIdx"
                class="tag tag-blue"
                style="font-size: 12px"
              >
                {{ sub }}
              </span>
            </div>
          </div>

          <!-- 统计指标数据 -->
          <!-- <div class="space-y-2 text-sm bg-gray-50/60 p-3 rounded-lg border border-gray-100 mb-4">
            <div class="flex justify-between">
              <span class="text-gray-400">关联关键词</span>
              <span class="text-[#1A1A1A] font-semibold">{{ item.keyword_count || 0 }} 个</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">命中合同</span>
              <span class="text-[#1A1A1A] font-semibold">{{ item.hit_count || 0 }} 份</span>
            </div>
          </div> -->
        </div>

        <!-- 底部操作按钮 (只留编辑，没有删除) -->
        <div class="flex items-center gap-3 pt-3 border-t border-gray-100">
          <el-button link size="small" style="color: #1f1f1f;" @click="handleEdit(item)">
            编辑
          </el-button>
        </div>
      </div>
    </div>

    <!-- 1:1 还原的合同模块 Modal 弹框组件 -->
    <SectionModal v-model="showModal" :edit-data="currentEditData" @success="loadData" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Collection } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { sectionApi } from '../api';
import type { ContractSection } from '../types';
import SectionModal from '../components/modals/SectionModal.vue';

const loading = ref(false);
const showModal = ref(false);
const currentEditData = ref<ContractSection | null>(null);
const sectionList = ref<ContractSection[]>([]);

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await sectionApi.getList({ page: 1, pageSize: 50 });
    if (res.code === 200) {
      sectionList.value = res.data.list;
    }
  } finally {
    loading.value = false;
  }
}

function parseSubNames(subNamesStr?: string): string[] {
  if (!subNamesStr) return [];
  return subNamesStr.split(',').filter(Boolean);
}

function scopeLabel(scope?: string) {
  return ({ contract: '仅合同', order: '仅订单', all: '合同+订单' } as Record<string, string>)[scope || 'all'];
}

function scopeTagClass(scope?: string) {
  if (scope === 'contract') return 'tag tag-blue';
  if (scope === 'order') return 'tag tag-purple';
  return 'tag tag-green';
}

function handleCreate() {
  currentEditData.value = null;
  showModal.value = true;
}

function handleEdit(item: ContractSection) {
  currentEditData.value = item;
  showModal.value = true;
}

function handleDelete(id: number) {
  ElMessageBox.confirm('确定要删除该合同范本模块吗？', '提示', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await sectionApi.delete(id);
    ElMessage.success('删除成功');
    loadData();
  });
}
</script>
