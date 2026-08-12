import fs from 'fs';
import { query } from '../config/db.js';

/**
 * 自动清理超过3个月（90天）保存限制的过期文件及其数据库持久化记录
 */
export async function cleanExpiredFiles() {
  try {
    const sql = `
      SELECT id, file_path FROM sys_file 
      WHERE expire_time <= NOW() AND delete_status = 0
    `;
    const expiredFiles = await query(sql);

    if (expiredFiles.length === 0) {
      return 0;
    }

    console.log(`🧹 正在检查过期文件，找到 ${expiredFiles.length} 个达到 3 个月保留期限的文件...`);

    let cleanedCount = 0;
    for (const file of expiredFiles) {
      // 物理删除磁盘上的文件
      if (fs.existsSync(file.file_path)) {
        try {
          fs.unlinkSync(file.file_path);
        } catch (e) {
          console.error(`删除物理文件失败: ${file.file_path}`, e);
        }
      }
      // 数据库状态标记为物理软/硬清理
      await query('UPDATE sys_file SET delete_status = 1 WHERE id = ?', [file.id]);
      cleanedCount++;
    }

    console.log(`✅ 自动清理完成，已安全删除 ${cleanedCount} 个满 3 个月的持久化文件。`);
    return cleanedCount;
  } catch (error) {
    console.error('❌ 执行文件生命周期清理失败:', error);
  }
}
