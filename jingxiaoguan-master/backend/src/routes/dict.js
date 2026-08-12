import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/dict' });

/**
 * 统一初始化返回字典 Map 与常量映射，供前端项目启动渲染
 */
router.get('/init', async (ctx) => {
  const dicts = await query(
    'SELECT dict_type, dict_label, dict_value, sort_order FROM sys_dict ORDER BY sort_order ASC'
  );

  const dictMap = {};
  dicts.forEach((item) => {
    if (!dictMap[item.dict_type]) {
      dictMap[item.dict_type] = [];
    }
    dictMap[item.dict_type].push({
      label: item.dict_label,
      value: parseInt(item.dict_value, 10) || item.dict_value,
    });
  });

  ctx.success(dictMap, '字典数据初始化成功');
});

export default router;
