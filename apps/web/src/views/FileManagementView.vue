<template>
  <div>
    <!-- 页头卡片 -->
    <div class="page-header-card mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1A1A1A]">文件存储与生命周期管理</h1>
          <p class="text-xs text-gray-500 mt-1">管理持久化上传文件，支持查看、下载、物理删除与 3 个月保留期限自动清理</p>
        </div>
        <div class="flex items-center gap-3">
          <el-upload
            action=""
            :auto-upload="true"
            :show-file-list="false"
            accept=".pdf"
            :http-request="handleParseUpload"
          >
            <el-button type="primary" size="large" style="background-color: #049667; border-color: #049667;" :loading="parsing">
              <el-icon class="mr-1"><Upload /></el-icon> 上传合同并解析
            </el-button>
          </el-upload>
          <el-upload
            action=""
            :auto-upload="true"
            :show-file-list="false"
            :http-request="handleUpload"
          >
            <el-button size="large" :loading="uploading">
              <el-icon class="mr-1"><Upload /></el-icon> 仅上传文件
            </el-button>
          </el-upload>
          <el-button type="warning" plain size="large" @click="handleTriggerCleanup">
            <el-icon class="mr-1"><Delete /></el-icon> 清理超3个月文件
          </el-button>
        </div>
      </div>
    </div>

    <!-- 说明提示框 (满足 requirement #41) -->
    <div class="content-card bg-amber-50/60 border border-amber-200/80 mb-4 p-4">
      <div class="flex items-start gap-3">
        <el-icon class="text-amber-600 text-lg mt-0.5"><WarningFilled /></el-icon>
        <div class="text-xs text-amber-900 leading-relaxed">
          <strong>系统文件持久化 3 个月规则说明：</strong><br/>
          根据系统架构规范，为防止磁盘与数据库无节制增长，所有上传文件自上传日起计有 <strong>90天 (3个月)</strong> 的保留限制。系统后台将自动对到期文件进行磁盘物理文件及数据库持久记录的安全清理。
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="content-card mb-4">
      <div class="flex items-center gap-3">
        <el-input
          v-model="keyword"
          placeholder="搜索文件名"
          clearable
          style="width: 260px"
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button @click="loadData">搜索</el-button>
      </div>
    </div>

    <!-- 文件表格 -->
    <div class="content-card p-0 overflow-hidden">
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="file_name" label="文件名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-medium text-[#1A1A1A]">{{ row.file_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="文件大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column label="上传时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        <el-table-column label="到期自动清理时间 (3个月)" width="180">
          <template #default="{ row }">
            <span class="tag tag-orange">{{ formatDate(row.expire_time) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" style="color: #049667;" @click="handleDownload(row)">
              下载
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row.id)">
              物理删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 (满足 requirement #31) -->
      <div class="p-4 flex items-center justify-between border-t border-gray-100">
        <span class="text-xs text-gray-500">共 {{ total }} 个持久化文件</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          layout="prev, pager, next, sizes"
          :total="total"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Upload, Search, Delete, WarningFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fileApi, parseApi } from '../api';
import { formatDate, formatFileSize } from '../utils/formatters';
import type { SysFile } from '../types';

const router = useRouter();
const loading = ref(false);
const uploading = ref(false);
const parsing = ref(false);
const keyword = ref('');
const tableData = ref<SysFile[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await fileApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
    });
    if (res.code === 200) {
      tableData.value = res.data.list;
      total.value = res.data.total;
    }
  } finally {
    loading.value = false;
  }
}

// F1：上传合同 PDF → 同步解析入草稿 → 拿 draft_id → 跳人工核对页。
function handleParseUpload(options: any) {
  const file = options.file as File;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.warning('合同解析仅支持 PDF 文件');
    return;
  }
  doParse(file, false);
}

async function doParse(file: File, force: boolean) {
  const formData = new FormData();
  formData.append('file', file);
  parsing.value = true;
  const tip = ElMessage({
    message: `正在解析《${file.name}》，大文件可能需要数分钟，请稍候…`,
    type: 'info',
    duration: 0,
  });
  try {
    const res = await parseApi.upload(formData, force);
    tip.close();
    if (res.code === 200 && res.data.draft_id) {
      ElMessage.success('解析完成，进入人工核对');
      router.push({ path: '/verify', query: { draftId: res.data.draft_id } });
      return;
    }
    if (res.data?.status === 'skipped_duplicate') {
      // 指纹去重：该合同此前已解析。问用户是否强制重新解析。
      parsing.value = false;
      try {
        await ElMessageBox.confirm(
          '该合同此前已解析过（内容指纹相同）。是否重新解析一遍？',
          '合同已存在',
          { confirmButtonText: '重新解析', cancelButtonText: '取消', type: 'warning' }
        );
        await doParse(file, true); // 强制重解析
      } catch {
        /* 用户取消 */
      }
      return;
    }
    ElMessage.error('解析未返回草稿，请检查解析服务');
  } catch (e: any) {
    tip.close();
    ElMessage.error(`解析失败：${e?.response?.data?.msg || e?.message || '未知错误'}`);
  } finally {
    parsing.value = false;
  }
}

async function handleUpload(options: any) {
  const formData = new FormData();
  formData.append('file', options.file);
  uploading.value = true;
  try {
    const res = await fileApi.upload(formData);
    if (res.code === 200) {
      ElMessage.success('文件上传成功，可访问路径: ' + res.data.file_url);
      loadData();
    }
  } finally {
    uploading.value = false;
  }
}

function handleDownload(row: SysFile) {
  const downloadUrl = `http://localhost:3001${row.file_url}`;
  window.open(downloadUrl, '_blank');
}

function handleDelete(id: number) {
  ElMessageBox.confirm('确定要物理删除该文件及其在数据库中的持久化记录吗？', '警告', {
    confirmButtonText: '确定物理删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await fileApi.delete(id);
    ElMessage.success('物理文件与持久化记录已安全擦除');
    loadData();
  });
}

async function handleTriggerCleanup() {
  const res = await fileApi.cleanup();
  if (res.code === 200) {
    ElMessage.success(`清理完成！共擦除 ${res.data.cleanedCount} 个满足 3 个月保留期限的过期文件`);
    loadData();
  }
}
</script>
