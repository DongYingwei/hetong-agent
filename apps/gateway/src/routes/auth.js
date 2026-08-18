import Router from '@koa/router';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { config } from '../config/index.js';
import { verifyPassword } from '../utils/crypto.js';

const router = new Router({ prefix: '/api/auth' });

function getRoleName(roleNum) {
  if (roleNum === 0) return '管理员';
  if (roleNum === 2) return '合同管理员';
  if (roleNum === 3) return '部门负责人';
  return '合同专员';
}

/**
 * 用户登录接口（带解密/哈希校验）
 */
router.post('/login', async (ctx) => {
  const { username, password } = ctx.request.body;

  if (!username || !password) {
    return ctx.fail('用户名和密码不能为空');
  }

  const users = await query(
    'SELECT * FROM sys_user WHERE username = ? AND delete_status = 0',
    [username]
  );

  if (users.length === 0) {
    return ctx.fail('账号不存在或已被冻结');
  }

  const user = users[0];

  if (user.status !== 1) {
    return ctx.fail('该账号已被禁用，请联系管理员');
  }

  const isMatch = verifyPassword(password, user.password);
  if (!isMatch) {
    return ctx.fail('密码输入错误，请重新输入');
  }

  const roleName = getRoleName(user.role);

  // 签发 JWT 凭证
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      roleName: roleName,
      department: user.department,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  ctx.success({
    token,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      roleName: roleName,
      department: user.department,
      phone: user.phone,
    },
  }, '登录成功');
});

/**
 * 获取当前登录用户信息
 */
router.get('/info', async (ctx) => {
  const currentUser = ctx.state.user;
  const users = await query(
    'SELECT id, username, real_name, role, department, phone, status, create_time FROM sys_user WHERE id = ?',
    [currentUser.id]
  );

  if (users.length === 0) {
    return ctx.fail('用户未找到');
  }

  const u = users[0];
  u.roleName = getRoleName(u.role);
  ctx.success(u);
});

export default router;
