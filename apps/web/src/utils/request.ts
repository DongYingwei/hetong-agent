import axios from 'axios';
import { ElMessage } from 'element-plus';

/**
 * 浏览器始终访问同源的 /api：开发环境由 Vite proxy 转发，生产环境由 Nginx 转发。
 * 不能让浏览器直接拼接 :3002，否则在仅开放 5174 的部署环境会绕过反向代理而失败。
 */
const getBaseUrl = () => import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 统一 Axios 网络请求实例封装
 */
const request = axios.create({
  baseURL: getBaseUrl(),
  // 比网关 CoreMind 代理预算多留 5s，避免浏览器抢先报 Axios 超时。
  timeout: 125000,
});

// 请求拦截器：自动注入 Authorization Token 报头
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('contract_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：统一根据 requirement #38 格式 {"code": 200|400|500, "msg": "...", "data": ...} 校验
request.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.code === 200) {
      return res;
    }

    if (res.code === 401) {
      ElMessage.error(res.msg || '登录失效，请重新登录');
      localStorage.removeItem('contract_token');
      localStorage.removeItem('contract_user');
      window.location.href = '/#/login';
      return Promise.reject(new Error(res.msg || '未授权'));
    }

    ElMessage.error(res.msg || '请求发生错误');
    return Promise.reject(new Error(res.msg || '操作失败'));
  },
  (error) => {
    const msg = error.response?.data?.msg || error.message || '网络连接失败';
    ElMessage.error(msg);
    return Promise.reject(error);
  }
);

export default request;
