import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '../api';
import { encryptPassword } from '../utils/crypto';
import type { User } from '../types';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('contract_token') || '');
  const user = ref<User | null>(
    localStorage.getItem('contract_user')
      ? JSON.parse(localStorage.getItem('contract_user')!)
      : null
  );

  async function login(username: string, rawPassword: string): Promise<boolean> {
    // 采用前端算法处理密码 (满足 requirement #29)
    const encPassword = encryptPassword(rawPassword);
    const res = await authApi.login({ username, password: encPassword });

    if (res.code === 200) {
      token.value = res.data.token;
      user.value = res.data.user;
      localStorage.setItem('contract_token', res.data.token);
      localStorage.setItem('contract_user', JSON.stringify(res.data.user));
      return true;
    }
    return false;
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('contract_token');
    localStorage.removeItem('contract_user');
  }

  return {
    token,
    user,
    login,
    logout,
  };
});
