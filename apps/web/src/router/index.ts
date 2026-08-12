import { createRouter, createWebHashHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import MainLayout from '../views/MainLayout.vue';
import LedgerView from '../views/LedgerView.vue';
import DetailView from '../views/DetailView.vue';
import VerifyView from '../views/VerifyView.vue';
import CompareView from '../views/CompareView.vue';
import KeywordsView from '../views/KeywordsView.vue';
import SectionsView from '../views/SectionsView.vue';
import AgentSearchView from '../views/AgentSearchView.vue';
import MenuView from '../views/MenuView.vue';
import HomepageConfigView from '../views/HomepageConfigView.vue';
import UserManagementView from '../views/UserManagementView.vue';
import RoleManagementView from '../views/RoleManagementView.vue';
import DepartmentManagementView from '../views/DepartmentManagementView.vue';
import MyDepartmentView from '../views/MyDepartmentView.vue';
import FileManagementView from '../views/FileManagementView.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/ledger',
    meta: { requiresAuth: true },
    children: [
      { path: 'ledger', name: 'ledger', component: LedgerView },
      { path: 'orders', name: 'orders', component: () => import('../views/OrdersView.vue') },
      { path: 'detail/:id', name: 'detail', component: DetailView },
      { path: 'verify', name: 'verify', component: VerifyView },
      { path: 'compare', name: 'compare', component: CompareView },
      { path: 'keywords', name: 'keywords', component: KeywordsView },
      { path: 'sections', name: 'sections', component: SectionsView },
      { path: 'agent-search', name: 'agent-search', component: AgentSearchView },

      // 系统管理 7 个二级页面 (1:1 匹配 demo2.html)
      { path: 'menu', name: 'menu', component: MenuView },
      { path: 'homepage', name: 'homepage', component: HomepageConfigView },
      { path: 'users', name: 'users', component: UserManagementView },
      { path: 'roles', name: 'roles', component: RoleManagementView },
      { path: 'departments', name: 'departments', component: DepartmentManagementView },
      { path: 'my-department', name: 'my-department', component: MyDepartmentView },
      { path: 'files', name: 'files', component: FileManagementView },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/ledger',
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('contract_token');
  if (to.meta.requiresAuth !== false && !token) {
    next('/login');
  } else if (to.path === '/login' && token) {
    next('/ledger');
  } else {
    next();
  }
});

export default router;
