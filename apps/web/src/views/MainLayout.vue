<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gray-100">
    <!-- 侧边栏 (1:1 还原 demo3.html 菜单结构与样式) -->
    <aside class="fixed left-3 top-3 bottom-3 w-[240px] bg-[#1C1C1C] flex flex-col z-50 overflow-hidden" style="border-radius: 21px;">
      <!-- 设计稿头像 -->
      <div class="flex items-center gap-2.5 px-[26px] pt-6 pb-3 border-b border-white/5">
        <img :src="designerAvatar" alt="经小管智能体" class="w-8 h-8 rounded-lg object-cover shrink-0" />
        <div class="flex-1 min-w-0">
          <span class="text-white text-base font-semibold block truncate">经小管智能体</span>
        </div>
      </div>

      <!-- 导航菜单 (1:1 还原 demo3.html 扁平化一级菜单 + 系统管理折叠组) -->
      <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1.5 text-sm text-[#BFBFBF]">
        <!-- 一级 1：合同台账 -->
        <router-link
          v-if="permissionStore.hasPermission(currentRole, '/ledger')"
          to="/ledger"
          class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
          :class="{ 'bg-[#049667] text-white font-semibold': isContractLedgerActive }"
        >
          <el-icon class="text-lg"><Document /></el-icon>
          <span>合同台账</span>
        </router-link>

        <!-- 一级 2：订单台账 (demo3.html 新增) -->
        <router-link
          v-if="permissionStore.hasPermission(currentRole, '/orders')"
          to="/orders"
          class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
          :class="{ 'bg-[#049667] text-white font-semibold': $route.path === '/orders' }"
        >
          <el-icon class="text-lg"><Tickets /></el-icon>
          <span>订单台账</span>
        </router-link>

        <!-- 一级 3：综合检索 (demo3.html 原智能体检索升级) -->
        <router-link
          v-if="permissionStore.hasPermission(currentRole, '/agent-search')"
          to="/agent-search"
          class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
          :class="{ 'bg-[#049667] text-white font-semibold': $route.path === '/agent-search' }"
        >
          <el-icon class="text-lg"><ChatDotSquare /></el-icon>
          <span>综合检索</span>
        </router-link>

        <!-- 一级 4：关键词管理 -->
        <router-link
          v-if="permissionStore.hasPermission(currentRole, '/keywords')"
          to="/keywords"
          class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
          :class="{ 'bg-[#049667] text-white font-semibold': $route.path === '/keywords' }"
        >
          <el-icon class="text-lg"><PriceTag /></el-icon>
          <span>关键词管理</span>
        </router-link>

        <!-- 一级 5：合同模块 -->
        <router-link
          v-if="permissionStore.hasPermission(currentRole, '/sections')"
          to="/sections"
          class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
          :class="{ 'bg-[#049667] text-white font-semibold': $route.path === '/sections' }"
        >
          <el-icon class="text-lg"><Collection /></el-icon>
          <span>合同模块</span>
        </router-link>

        <!-- 一级 6：系统管理 (折叠分组) -->
        <div v-if="hasAnySystemMenu" class="pt-1">
          <div
            class="flex items-center gap-3 px-3 h-10 rounded-lg cursor-pointer transition-colors hover:bg-white/10 text-white font-medium select-none"
            @click="systemExpanded = !systemExpanded"
          >
            <el-icon class="text-lg"><Setting /></el-icon>
            <span>系统管理</span>
            <el-icon class="ml-auto transition-transform duration-200" :class="{ 'rotate-180': !systemExpanded }">
              <ArrowDown />
            </el-icon>
          </div>

          <!-- 子菜单展开区域 -->
          <div v-show="systemExpanded" class="mt-2 ml-4 space-y-1.5 border-l border-white/10 pl-3">
            <router-link
              v-if="permissionStore.hasPermission(currentRole, '/menu')"
              to="/menu"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/menu' }"
            >
              <el-icon><MenuIcon /></el-icon>
              <span>菜单管理</span>
            </router-link>

            <router-link
              v-if="permissionStore.hasPermission(currentRole, '/homepage')"
              to="/homepage"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/homepage' }"
            >
              <el-icon><HomeFilled /></el-icon>
              <span>首页配置</span>
            </router-link>

            <router-link
              v-if="permissionStore.hasPermission(currentRole, '/users')"
              to="/users"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/users' }"
            >
              <el-icon><UserIcon /></el-icon>
              <span>用户管理</span>
            </router-link>

            <router-link
              v-if="permissionStore.hasPermission(currentRole, '/roles')"
              to="/roles"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/roles' }"
            >
              <el-icon><UserFilled /></el-icon>
              <span>角色管理</span>
            </router-link>

            <!-- 隐藏部门管理与我的部门菜单 -->
            <router-link
              v-if="false && permissionStore.hasPermission(currentRole, '/departments')"
              to="/departments"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/departments' }"
            >
              <el-icon><OfficeBuilding /></el-icon>
              <span>部门管理</span>
            </router-link>

            <router-link
              v-if="false && permissionStore.hasPermission(currentRole, '/my-department')"
              to="/my-department"
              class="flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-white/10 hover:text-white"
              :class="{ 'bg-[#049667] text-white font-medium': $route.path === '/my-department' }"
            >
              <el-icon><User /></el-icon>
              <span>我的部门</span>
            </router-link>
          </div>
        </div>
      </nav>

      <!-- 登录用户信息 -->
      <div class="border-t border-white/5 px-[22px] pb-6 pt-3 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-full bg-[#049667] flex items-center justify-center text-white text-sm font-medium">
          {{ userStore.user?.realName?.[0] || '张' }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-white text-sm font-medium truncate">{{ userStore.user?.realName || '张三' }}</div>
          <div class="text-gray-500 text-xs">{{ currentRole }}</div>
        </div>
        <el-dropdown trigger="click">
          <span class="text-gray-400 cursor-pointer hover:text-white">
            <el-icon><MoreFilled /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="ml-[264px] mr-3 my-3 flex-1 bg-white overflow-y-auto rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[calc(100vh-24px)]">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import designerAvatar from '../assets/designerAvatar';
import { useRoute, useRouter } from 'vue-router';
import {
  Setting,
  ArrowDown,
  Document,
  Tickets,
  ChatDotSquare,
  PriceTag,
  Collection,
  Menu as MenuIcon,
  HomeFilled,
  User as UserIcon,
  UserFilled,
  OfficeBuilding,
  User,
  MoreFilled,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../stores/userStore';
import { useDictStore } from '../stores/dictStore';
import { usePermissionStore } from '../stores/permissionStore';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const dictStore = useDictStore();
const permissionStore = usePermissionStore();

// 动态读取当前登录用户的实际角色名称
const currentRole = computed(() => {
  const u = userStore.user;
  if (!u) return '管理员';
  if ((u as any).roleName) return (u as any).roleName;
  if (u.role === 0) return '管理员';
  if (u.role === 1) return '合同专员';
  if (u.role === 2) return '法务人员';
  if (u.role === 3) return '部门负责人';
  return '普通用户';
});

// 折叠展开状态
const systemExpanded = ref(true);

const isContractLedgerActive = computed(() => {
  return route.path === '/ledger' || route.path.startsWith('/detail') || route.path.startsWith('/verify') || route.path.startsWith('/compare');
});

const hasAnySystemMenu = computed(() => {
  const paths = ['/menu', '/homepage', '/users', '/roles', '/departments', '/my-department'];
  return paths.some(p => permissionStore.hasPermission(currentRole.value, p));
});

onMounted(() => {
  dictStore.fetchDictInit();
});

function handleLogout() {
  userStore.logout();
  ElMessage.success('已安全退出登录');
  router.push('/login');
}
</script>
