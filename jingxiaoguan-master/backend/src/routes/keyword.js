import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/keyword' });

// 内存预置主关键词与子词列表 (1:1 还原 demo3.html)
let mockKeywords = [
  {
    id: 1,
    keyword_name: 'AI',
    sub_count: 10,
    match_rules: '排除Email、域名中的ai',
    sub_words: ['人工智能', '智能体', '大模型', 'NLP', 'OCR', '机器学习', '深度学习', '算法模型', '神经网络', '大语言模型'],
    status: 1,
  },
  {
    id: 2,
    keyword_name: '云计算',
    sub_count: 7,
    match_rules: '匹配云原生、IaaS、PaaS、SaaS等',
    sub_words: ['云原生', 'IaaS', 'PaaS', 'SaaS', '微服务', 'K8s', 'Docker'],
    status: 1,
  },
  {
    id: 3,
    keyword_name: '大数据',
    sub_count: 5,
    match_rules: '包含数据分析、数据挖掘',
    sub_words: ['数据湖', '数据仓库', 'Hadoop', 'Spark', '数据标注'],
    status: 1,
  },
];

// 全局内存子词映射表（防数据库缺少 sub_words 字段导致的字段错误）
const subWordsMap = new Map([
  [1, ['人工智能', '智能体', '大模型', 'NLP', 'OCR', '机器学习', '深度学习', '算法模型', '神经网络', '大语言模型']],
  [2, ['云原生', 'IaaS', 'PaaS', 'SaaS', '微服务', 'K8s', 'Docker']],
  [3, ['数据湖', '数据仓库', 'Hadoop', 'Spark', '数据标注']],
]);

function parseSubWords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch (e) {}
    return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 分页获取 AI 关键词列表 (1:1 还原 demo3.html 结构)
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const keyword = ctx.query.keyword || '';
  const status = ctx.query.status !== undefined && ctx.query.status !== '' ? parseInt(ctx.query.status, 10) : undefined;

  try {
    const listSql = `SELECT * FROM contract_keyword WHERE delete_status = 0 ORDER BY id DESC`;
    const dbList = await query(listSql);
    if (dbList && dbList.length > 0) {
      let filtered = dbList.map((item) => {
        let subs = subWordsMap.get(item.id);
        if (!subs) {
          subs = parseSubWords(item.sub_words);
          subWordsMap.set(item.id, subs);
        }
        return {
          id: item.id,
          keyword_name: item.keyword_name,
          sub_count: subs.length,
          match_rules: item.rules_desc || item.match_rules || item.description || '—',
          sub_words: subs,
          status: item.status,
        };
      });

      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        filtered = filtered.filter((i) => i.keyword_name.toLowerCase().includes(kw));
      }
      if (status !== undefined) {
        filtered = filtered.filter((i) => i.status === status);
      }

      ctx.success({
        list: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
      });
      return;
    }
  } catch (e) {}

  // 兜底使用 mockKeywords
  let filtered = mockKeywords.map((item) => {
    const subs = subWordsMap.get(item.id) || item.sub_words || [];
    return {
      ...item,
      sub_words: subs,
      sub_count: subs.length,
    };
  });
  if (keyword.trim()) {
    const kw = keyword.trim().toLowerCase();
    filtered = filtered.filter((i) => i.keyword_name.toLowerCase().includes(kw));
  }
  if (status !== undefined) {
    filtered = filtered.filter((i) => i.status === status);
  }

  ctx.success({
    list: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  });
});

/**
 * 新增主关键词
 */
router.post('/create', async (ctx) => {
  const { keyword_name, match_rules, status } = ctx.request.body;

  if (!keyword_name) {
    return ctx.fail('关键词名称不能为空');
  }

  const newId = Date.now();
  const newItem = {
    id: newId,
    keyword_name,
    sub_count: 0,
    match_rules: match_rules || '无描述',
    sub_words: [],
    status: status !== undefined ? status : 1,
  };

  subWordsMap.set(newId, []);
  mockKeywords.unshift(newItem);

  try {
    await query(
      'INSERT INTO contract_keyword (keyword_name, description, status, sub_count, delete_status) VALUES (?, ?, ?, 0, 0)',
      [keyword_name, match_rules || '', status !== undefined ? status : 1]
    );
  } catch (e) {}

  ctx.success(newItem, '关键词新增成功');
});

/**
 * 编辑更新主关键词
 */
router.put('/update', async (ctx) => {
  const { id, keyword_name, match_rules, status } = ctx.request.body;
  if (!id) {
    return ctx.fail('ID不能为空');
  }

  const target = mockKeywords.find((k) => k.id === parseInt(id, 10));

  if (target) {
    if (keyword_name !== undefined) target.keyword_name = keyword_name;
    if (match_rules !== undefined) target.match_rules = match_rules;
    if (status !== undefined) target.status = parseInt(status, 10);
  }

  try {
    await query(
      'UPDATE contract_keyword SET keyword_name = ?, description = ?, status = ? WHERE id = ?',
      [keyword_name, match_rules, status, id]
    );
  } catch (e) {}

  ctx.success(null, '关键词更新成功');
});

/**
 * 删除主关键词
 */
router.delete('/delete/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  mockKeywords = mockKeywords.filter((k) => k.id !== id);
  subWordsMap.delete(id);
  try {
    await query('UPDATE contract_keyword SET delete_status = 1 WHERE id = ?', [id]);
  } catch (e) {}
  ctx.success(null, '关键词已删除');
});

/**
 * POST /api/keyword/sub/add
 * 添加子词 (支持单个及批量数组添加)
 */
router.post('/sub/add', async (ctx) => {
  const { keyword_id, sub_word, sub_words } = ctx.request.body;
  if (!keyword_id) {
    return ctx.fail('关键词ID不能为空');
  }

  let wordsToAdd = [];
  if (Array.isArray(sub_words)) {
    wordsToAdd = sub_words.map((w) => String(w).trim()).filter(Boolean);
  } else if (Array.isArray(sub_word)) {
    wordsToAdd = sub_word.map((w) => String(w).trim()).filter(Boolean);
  } else if (typeof sub_word === 'string' && sub_word.trim()) {
    wordsToAdd = [sub_word.trim()];
  }

  if (wordsToAdd.length === 0) {
    return ctx.fail('添加的子词不能为空');
  }

  const idNum = parseInt(keyword_id, 10);
  let currentSubs = subWordsMap.get(idNum) || [];
  const combined = Array.from(new Set([...currentSubs, ...wordsToAdd]));
  subWordsMap.set(idNum, combined);

  const target = mockKeywords.find((k) => k.id === idNum);
  if (target) {
    target.sub_words = combined;
    target.sub_count = combined.length;
  }

  try {
    await query('UPDATE contract_keyword SET sub_count = ? WHERE id = ?', [combined.length, idNum]);
  } catch (e) {
    console.error('DB update sub_words error:', e);
  }

  ctx.success(null, `成功添加 ${wordsToAdd.length} 个子词`);
});

/**
 * POST /api/keyword/sub/remove
 * 删除子词
 */
router.post('/sub/remove', async (ctx) => {
  const { keyword_id, sub_word } = ctx.request.body;
  if (!keyword_id || !sub_word) {
    return ctx.fail('参数不完整');
  }

  const idNum = parseInt(keyword_id, 10);
  let currentSubs = subWordsMap.get(idNum) || [];
  const remaining = currentSubs.filter((w) => w !== sub_word);
  subWordsMap.set(idNum, remaining);

  const target = mockKeywords.find((k) => k.id === idNum);
  if (target) {
    target.sub_words = remaining;
    target.sub_count = remaining.length;
  }

  try {
    await query('UPDATE contract_keyword SET sub_count = ? WHERE id = ?', [remaining.length, idNum]);
  } catch (e) {}

  ctx.success(null, '子词已移除');
});

export default router;
