import Router from '@koa/router';
import { query } from '../config/db.js';
import { hashPassword } from '../utils/crypto.js';

const router = new Router({ prefix: '/api/user' });

/**
 * 分页获取用户列表 (满足 requirement #31)
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const keyword = ctx.query.keyword || '';
  const phone = ctx.query.phone || '';
  const status = ctx.query.status;
  const offset = (page - 1) * pageSize;

  let whereSql = 'WHERE delete_status = 0';
  const params = [];

  if (keyword) {
    whereSql += ' AND (username LIKE ? OR real_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (phone) {
    whereSql += ' AND phone LIKE ?';
    params.push(`%${phone}%`);
  }

  if (status !== undefined && status !== '') {
    whereSql += ' AND status = ?';
    params.push(parseInt(status, 10));
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM sys_user ${whereSql}`,
    params
  );
  const total = countResult[0].total;

  const listSql = `
    SELECT id, username, real_name, role, status, department, phone, job_title, employee_id, gender, email, telephone, birthday, identity, resp_department, sort, create_time, update_time 
    FROM sys_user ${whereSql} 
    ORDER BY id DESC 
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const list = await query(listSql, params);

  ctx.success({
    list,
    total,
    page,
    pageSize,
  });
});

/**
 * 创建新用户
 */
router.post('/create', async (ctx) => {
  const {
    username,
    password,
    realName,
    role = 1,
    status = 1,
    department = '信息技术部',
    phone = '',
    jobTitle = '',
    employeeId = '',
    gender = '男',
    email = '',
    telephone = '',
    birthday = '',
    identity = 'normal',
    respDepartment = '',
    sort = 1000,
  } = ctx.request.body;

  if (!username || !password || !realName) {
    return ctx.fail('账号、密码与真实姓名不能为空');
  }

  const exist = await query('SELECT id FROM sys_user WHERE username = ? AND delete_status = 0', [username]);
  if (exist.length > 0) {
    return ctx.fail('该用户名已存在');
  }

  const encPassword = hashPassword(password);
  await query(
    `INSERT INTO sys_user 
    (username, password, real_name, role, status, department, phone, job_title, employee_id, gender, email, telephone, birthday, identity, resp_department, sort) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      username,
      encPassword,
      realName,
      role,
      status,
      department,
      phone,
      jobTitle,
      employeeId,
      gender,
      email,
      telephone,
      birthday,
      identity,
      respDepartment,
      sort,
    ]
  );

  ctx.success(null, '用户创建成功');
});

/**
 * 修改用户信息与状态
 */
router.put('/update', async (ctx) => {
  const {
    id,
    realName,
    role,
    status,
    password,
    department,
    phone,
    jobTitle,
    employeeId,
    gender,
    email,
    telephone,
    birthday,
    identity,
    respDepartment,
    sort,
  } = ctx.request.body;

  if (!id) {
    return ctx.fail('用户ID不能为空');
  }

  let sql = `UPDATE sys_user SET 
    real_name = ?, 
    role = ?, 
    status = ?, 
    department = ?, 
    phone = ?, 
    job_title = ?, 
    employee_id = ?, 
    gender = ?, 
    email = ?, 
    telephone = ?, 
    birthday = ?, 
    identity = ?, 
    resp_department = ?, 
    sort = ?`;
  
  const params = [
    realName,
    role,
    status,
    department,
    phone,
    jobTitle,
    employeeId,
    gender,
    email,
    telephone,
    birthday,
    identity,
    respDepartment,
    sort,
  ];

  if (password) {
    sql += ', password = ?';
    params.push(hashPassword(password));
  }

  sql += ' WHERE id = ?';
  params.push(id);

  await query(sql, params);
  ctx.success(null, '用户更新成功');
});

/**
 * 重置用户密码为 howso123
 */
router.put('/reset-password', async (ctx) => {
  const { id } = ctx.request.body;
  if (!id) {
    return ctx.fail('用户ID不能为空');
  }

  const encPassword = hashPassword('howso123');
  await query('UPDATE sys_user SET password = ? WHERE id = ?', [encPassword, id]);
  ctx.success(null, '密码重置成功，新初始密码为 howso123');
});

/**
 * 软删除用户
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE sys_user SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '用户已软删除');
});

export default router;
