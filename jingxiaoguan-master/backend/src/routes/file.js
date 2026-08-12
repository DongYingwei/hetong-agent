import Router from '@koa/router';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { cleanExpiredFiles } from '../services/cleanupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const router = new Router({ prefix: '/api/file' });

/**
 * 分页获取上传文件列表及生命周期状态 (满足 requirement #31 & #39)
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const keyword = ctx.query.keyword || '';
  const offset = (page - 1) * pageSize;

  let whereSql = 'WHERE delete_status = 0';
  const params = [];

  if (keyword) {
    whereSql += ' AND file_name LIKE ?';
    params.push(`%${keyword}%`);
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM sys_file ${whereSql}`,
    params
  );
  const total = countResult[0].total;

  const listSql = `
    SELECT id, file_name, file_url, file_size, file_type, upload_time, expire_time 
    FROM sys_file ${whereSql} 
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
 * 上传文件接口 (支持计算 3 个月保留期限，物理保存及数据库持久化) (满足 requirement #39, #40, #41)
 */
router.post('/upload', async (ctx) => {
  const files = ctx.request.files;
  const file = files ? (files.file || files.upload) : null;

  if (!file) {
    return ctx.fail('未接收到上传的文件');
  }

  const originalName = file.originalFilename || file.newFilename || 'uploaded_file';
  const ext = path.extname(originalName);
  const newFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, newFileName);

  // 移动物理文件到 uploads 目录
  fs.copyFileSync(file.filepath, targetPath);
  fs.unlinkSync(file.filepath);

  const fileUrl = `/uploads/${newFileName}`;
  const fileSize = file.size || 0;
  const uploaderId = ctx.state.user?.id || 1;

  // 计算 3 个月保留期限到期时间
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + 90);

  const res = await query(
    `INSERT INTO sys_file (file_name, file_path, file_url, file_size, file_type, uploader_id, expire_time) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [originalName, targetPath, fileUrl, fileSize, ext, uploaderId, expireDate]
  );

  ctx.success({
    id: res.insertId,
    fileName: originalName,
    fileUrl,
    fileSize,
    expireTime: expireDate,
  }, '文件上传并持久化成功');
});

/**
 * 物理删除文件及对应数据库记录 (满足 requirement #40)
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  const files = await query('SELECT * FROM sys_file WHERE id = ?', [id]);

  if (files.length === 0) {
    return ctx.fail('文件不存在');
  }

  const file = files[0];

  // 物理删除服务器磁盘上的对应文件
  if (fs.existsSync(file.file_path)) {
    try {
      fs.unlinkSync(file.file_path);
    } catch (e) {
      console.error('物理删除文件失败:', e);
    }
  }

  // 从数据库彻底物理删除对应记录
  await query('DELETE FROM sys_file WHERE id = ?', [id]);

  ctx.success(null, '文件已物理删除并清理数据库记录');
});

/**
 * 手动触发/清理达到3个月有效期的过期文件 (满足 requirement #41)
 */
router.post('/cleanup', async (ctx) => {
  const count = await cleanExpiredFiles();
  ctx.success({ cleanedCount: count }, `清理完成，共移除 ${count} 个超过 3 个月保留期限的文件`);
});

export default router;
