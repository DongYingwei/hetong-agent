import CryptoJS from 'crypto-js';

/**
 * 校验前端密码加密哈希 (后端统一对比加密串与存储串)
 * @param {string} rawPassword 原始密码
 * @returns {string} 加密存储哈希
 */
export function hashPassword(rawPassword) {
  if (!rawPassword) return '';
  return CryptoJS.MD5(rawPassword + '_contract_salt_2026').toString();
}

/**
 * 验证密码是否匹配
 * @param {string} inputPassword 用户输入的密码 (可能是前端传入的盐值密文或明文)
 * @param {string} storedPassword 数据库中存储的密文
 */
export function verifyPassword(inputPassword, storedPassword) {
  if (!inputPassword || !storedPassword) return false;

  // 1. 直连比对 (前端已经使用相同的 MD5+Salt 加密，且数据库存的也是 MD5+Salt)
  if (inputPassword === storedPassword) {
    return true;
  }

  // 2. 原明文转换哈希比对
  if (hashPassword(inputPassword) === storedPassword) {
    return true;
  }

  // 3. 兼容默认初始账号 admin123 哈希
  const adminSalted = hashPassword('admin123'); // 53801c1df9e41f90b77ae9756980732b
  const adminUnsalted = '0192023a7bbd73250516f069df18b500';

  if (
    (storedPassword === adminUnsalted || storedPassword === adminSalted) &&
    (inputPassword === adminSalted || inputPassword === adminUnsalted || inputPassword === 'admin123')
  ) {
    return true;
  }

  return false;
}
