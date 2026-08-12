import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/order' });

// 示例种子数据 (1:1 还原 demo3.html)
const mockOrders = [
  {
    id: 1,
    project_no: 'V250056',
    project_name: '长城股份软开外包2025-2027框架人员租赁项目',
    detail_project_no: 'V250056P120',
    order_no: 'HSKJ/C-RJ-2025069-122',
    customer_order_no: '—',
    order_name: '2025-2026年度软件开发外包服务框架合同-华苏',
    contract_no: '—',
    customer_name: '诺博汽车系统有限公司',
    assessment_line: '软件',
    customer_line: '软件',
    customer_type: '无',
    settlement_type: '—',
    order_type: 'ARP',
    order_attr: 'JS',
    salesperson: '—',
    customer_contract_no: '—',
    customer_service_target: '—',
    customer_pm: '—',
    customer_order_name: '—',
    created_date: '2026-07-23',
    accepted_date: '2026-07-23',
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    est_invoice_date: '2026-12-27',
    order_status: '执行中',
    tax_rate: 6,
    amount: 36923.25,
    amount_ex_tax: 34833.25,
    detail_order_no: 'HSKJ/C-RJ-2025069-122-1',
    customer_detail_order_no: '—',
    redemption_days: 0,
    is_last_order: '否',
    detail_amount_ex_tax: 34833.25,
    deduct_amount: 0,
    deduct_amount_ex_tax: 0,
    stop_invoice_amount: 0,
    stop_invoice_amount_ex_tax: 0,
    confirmed_income_amount: 0,
    confirmed_income_amount_ex_tax: 0,
    unconfirmed_income_amount: 36923.25,
    unconfirmed_income_amount_ex_tax: 34833.25,
    income_confirmed: 0, // 未确认
    invoiced_amount: 36923.25,
    invoiced_amount_ex_tax: 34833.25,
    returned_amount: 0,
    returned_amount_ex_tax: 0,
    invoiced_unreturned_amount: 36923.25,
    invoiced_unreturned_amount_ex_tax: 34833.25,
    region: '—',
    province: '—',
    city: '—',
    delivery_list: '—',
    has_attachment: '有',
    latest_attachment_time: '2026-07-23 14:56:03',
    attachment_count: 3,
    has_eml: '是',
    hit_keyword: 'AI',
    maker: '陈心瑜B',
    make_time: '2026-07-23 14:55:38',
    detail_maker: '陈心瑜B',
    detail_make_time: '2026-07-23 14:55:38',
    updater: '陈心瑜B',
    update_time: '2026-07-23 14:56:08',
    auditor: '陈心瑜B',
    audit_time: '2026-07-23 14:56:08',
    ai_keywords: ['AI'],
  },
  {
    id: 2,
    project_no: 'V250056',
    project_name: '长城股份软开外包2025-2027框架人员租赁项目',
    detail_project_no: 'V250056P119',
    order_no: 'HSKJ/C-RJ-2025069-121',
    customer_order_no: '—',
    order_name: '2025-2026年度软件开发外包服务框架合同-华苏',
    contract_no: '—',
    customer_name: '诺博汽车系统有限公司',
    assessment_line: '软件',
    customer_line: '软件',
    customer_type: '无',
    settlement_type: '—',
    order_type: 'ARP',
    order_attr: 'JS',
    salesperson: '—',
    start_date: '2026-02-01',
    end_date: '2026-03-31',
    tax_rate: 6,
    amount: 34129.29,
    income_confirmed: 0, // 未确认
    attachment_count: 3,
    has_eml: '是',
    hit_keyword: 'AI',
    maker: '陈心瑜B',
    make_time: '2026-07-23 14:50:11',
    ai_keywords: ['AI'],
  },
  {
    id: 3,
    project_no: 'V250031',
    project_name: '中兴5G(800M)三期工程优化服务项目',
    order_no: 'Z26050143',
    order_name: '配置贯通：5G(800M)三期152个站点工程优化界面申请结算，采购合同号ZBGC20240831075WBF1G',
    customer_name: '中兴通讯股份有限公司',
    assessment_line: '中兴',
    customer_line: '中兴',
    order_type: 'ASP',
    start_date: '2026-05-01',
    end_date: '2026-05-31',
    tax_rate: 6,
    amount: 206918.40,
    income_confirmed: 1, // 已确认
    attachment_count: 5,
    has_eml: '否',
    hit_keyword: '',
    maker: '李明',
    make_time: '2026-06-01 10:00:00',
  },
  {
    id: 4,
    project_no: 'V240013',
    project_name: '西安分公司天馈应急整治技术服务项目',
    order_no: 'HSKJ/C-CT-2024013-1',
    order_name: '2025年西安分公司移动通信系统天线参数标准化测试调整暨天馈应急整治技术服务项目结算单',
    customer_name: '中国移动通信集团',
    assessment_line: '运营商',
    customer_line: '运营商',
    order_type: 'ARP',
    start_date: '2025-09-01',
    end_date: '2025-09-30',
    tax_rate: 6,
    amount: 477712.32,
    income_confirmed: 1, // 已确认
    attachment_count: 2,
    has_eml: '否',
    hit_keyword: '',
    maker: '张伟',
    make_time: '2025-10-01 09:30:00',
  },
];

/**
 * GET /api/order/list
 * 查询订单台账列表
 */
router.get('/list', async (ctx) => {
  const { page = 1, pageSize = 10, keyword = '', customerLine = '', orderType = '' } = ctx.query;

  try {
    // 优先尝试从 MySQL 数据库 sys_order 查询
    const sql = `SELECT * FROM sys_order WHERE delete_status = 0 ORDER BY id DESC`;
    const dbList = await query(sql);

    let filtered = dbList && dbList.length > 0 ? dbList : mockOrders;

    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item.order_no && item.order_no.toLowerCase().includes(kw)) ||
          (item.order_name && item.order_name.toLowerCase().includes(kw)) ||
          (item.project_no && item.project_no.toLowerCase().includes(kw)) ||
          (item.customer_name && item.customer_name.toLowerCase().includes(kw))
      );
    }

    if (customerLine.trim()) {
      filtered = filtered.filter((item) => item.customer_line === customerLine || item.assessment_line === customerLine);
    }

    if (orderType.trim()) {
      filtered = filtered.filter((item) => item.order_type === orderType);
    }

    const total = filtered.length;
    const p = parseInt(page, 10);
    const ps = parseInt(pageSize, 10);
    const start = (p - 1) * ps;
    const list = filtered.slice(start, start + ps);

    ctx.success({
      list,
      total,
      page: p,
      pageSize: ps,
    });
  } catch (error) {
    // MySQL 兜底使用 mockOrders
    let filtered = [...mockOrders];
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.order_no.toLowerCase().includes(kw) ||
          item.order_name.toLowerCase().includes(kw) ||
          item.project_no.toLowerCase().includes(kw)
      );
    }
    if (customerLine.trim()) {
      filtered = filtered.filter((item) => item.customer_line === customerLine || item.assessment_line === customerLine);
    }
    if (orderType.trim()) {
      filtered = filtered.filter((item) => item.order_type === orderType);
    }
    const total = filtered.length;
    const p = parseInt(page, 10);
    const ps = parseInt(pageSize, 10);
    const start = (p - 1) * ps;
    const list = filtered.slice(start, start + ps);

    ctx.success({
      list,
      total,
      page: p,
      pageSize: ps,
    });
  }
});

/**
 * GET /api/order/detail/:id
 * 获取订单详情
 */
router.get('/detail/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  try {
    const sql = `SELECT * FROM sys_order WHERE id = ? AND delete_status = 0`;
    const rows = await query(sql, [id]);
    if (rows && rows.length > 0) {
      ctx.success(rows[0]);
      return;
    }
  } catch (e) {}

  const found = mockOrders.find((o) => o.id === id) || mockOrders[0];
  ctx.success(found);
});

/**
 * POST /api/order/update-keywords
 * 更新订单的 AI 关键词
 */
router.post('/update-keywords', async (ctx) => {
  const { id, keywords } = ctx.request.body;
  const target = mockOrders.find((o) => o.id === id);
  if (target) {
    target.ai_keywords = keywords;
    target.hit_keyword = keywords && keywords.length > 0 ? keywords.join(',') : '';
  }
  ctx.success(null, '更新成功');
});

export default router;
