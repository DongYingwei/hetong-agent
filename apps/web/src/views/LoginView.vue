<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 px-4">
    <div class="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <!-- Header / Logo -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 rounded-xl bg-[#f8a42b] flex items-center justify-center shadow-lg mb-3">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-[#1A1A1A]">经小管智能体系统</h2>
        <p class="text-xs text-gray-500 mt-1">合同智能风控与AI审核协同平台</p>
      </div>

      <!-- Login Form -->
      <el-form :model="loginForm" :rules="rules" ref="formRef" size="large" @keyup.enter="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="loginForm.username" placeholder="请输入用户名 (测试账号: admin)">
            <template #prefix>
              <el-icon><UserIcon /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item prop="password">
          <el-input v-model="loginForm.password" type="password" show-password placeholder="请输入密码 (默认密码: howso123)">
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <div class="flex items-center justify-between text-xs text-gray-500 mb-6">
          <el-checkbox v-model="rememberMe">记住密码</el-checkbox>
          <span class="text-[#e5931a] cursor-pointer hover:underline">联系管理员重置密码</span>
        </div>

        <el-button
          type="primary"
          class="w-full h-11 text-base rounded-lg"
          style="background-color: #f8a42b; border-color: #f8a42b;"
          :loading="loading"
          @click="handleLogin"
        >
          安全登录
        </el-button>
      </el-form>

      <div class="mt-6 text-center text-xs text-gray-400">
        © 2026 经小管合同智能体平台 · 版权所有
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { User as UserIcon, Lock } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../stores/userStore';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const rememberMe = ref(true);

const loginForm = reactive({
  username: 'admin',
  password: 'howso123',
});

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function handleLogin() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const success = await userStore.login(loginForm.username, loginForm.password);
      if (success) {
        ElMessage.success('登录成功');
        router.push('/ledger');
      }
    } finally {
      loading.value = false;
    }
  });
}
</script>
