import CryptoJS from 'crypto-js';

/**
 * 前端登录密码安全加密方法
 * @param password 原始明文密码
 * @returns 加密处理后的密文
 */
export function encryptPassword(password: string): string {
  if (!password) return '';
  return CryptoJS.MD5(password + '_contract_salt_2026').toString();
}
