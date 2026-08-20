import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 开发者本机默认走本地 Gateway；协作开发时可改为服务器 Nginx 的 5174，
  // 由它继续反代 Gateway。浏览器不直接接触 PostgreSQL 或 :3002。
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3002';
  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0', // 允许内网/局域网其他电脑通过 IP 访问
      port: 5174,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
