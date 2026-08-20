import ExcelJS from 'exceljs';

// ── 忠实导出(12b)────────────────────────────────────────────────
// 列无关的检索结果导出:行里有什么列就写什么列,不套台账模板、不补默认值、
// 不做任何二次聚合(ADR-0005 忠实搬行 / D4 金额口径 / D2 不幻觉)。
export interface ExportRow {
  // 展示列 → 单元格值。isSummary 标记分口径合计行,不改口径语义,仅供识别。
  [column: string]: string | number | null | undefined | boolean;
  isSummary?: boolean;
}

export function buildFaithfulWorkbook(rows: ExportRow[]): ExcelJS.Workbook {
  if (!rows || rows.length === 0) {
    throw new Error('无可导出的结果:不生成空表,也不兜底造数据');
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('检索结果');

  const columns = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => { if (k !== 'isSummary') set.add(k); });
      return set;
    }, new Set()),
  );
  ws.addRow(columns);

  for (const row of rows) {
    ws.addRow(columns.map((c) => row[c]));
  }
  return wb;
}

// 把工作簿另存为 .xlsx 下载。纯副作用,与 buildFaithfulWorkbook(可测纯函数)分离。
export async function downloadWorkbook(wb: ExcelJS.Workbook, fileNamePrefix: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().substring(0, 10);
  link.setAttribute('download', `${fileNamePrefix}_${dateStr}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const SEARCH_CONTRACT_COLUMNS: Array<[string, string]> = [
  ['contract_no','合同号'],['customer_name','客户名称'],['contract_name','合同名称'],['assessment_line','考核线'],['bid_no','中标编号'],['related_main_no','关联主合同号'],['framework_alias','框架简称'],['customer_contract_no','客方合同号'],['signing_entity','签约主体'],['contract_type','合同类型'],['sign_date','签约时间'],['start_date','开始时间'],['end_date','结束时间'],['amount_type','金额属性'],['amount','合同金额(含税)'],['tax_rate','税率'],['settlement_terms','结算条款'],['post_eval','是否涉及后评估'],['deposit_amount','履约保证金金额'],['deposit_refund','履约保证金退还条件'],['arbitration','仲裁方式'],['authorizer','授权人'],['status','合同状态'],['expiry_warning','合同断档预警'],['has_ai_keyword','是否包含AI关键词'],['service','服务内容'],['tech','技术要求'],['role','岗位说明'],['staff','人员需求'],
];
const SEARCH_ORDER_COLUMNS: Array<[string, string]> = [
  ['project_no','项目编号'],['project_name','项目名称'],['detail_project_no','明细项目编号'],['order_no','订单编号'],['customer_order_no','客方订单号'],['order_name','订单名称'],['contract_no','合同编号'],['customer_name','客户名称'],['assessment_line','考核线'],['customer_line','客户线'],['customer_type','客户类型'],['settlement_type','结算方式'],['order_type','订单类型'],['order_attr','订单属性'],['salesperson','业务员'],['customer_contract_no','客方合同编号'],['customer_service_target','客方服务对象'],['customer_pm','客方项目经理'],['customer_order_name','客方订单名称'],['created_date','生成日期'],['accepted_date','接受日期'],['start_date','订单开始日期'],['end_date','订单结束日期'],['est_invoice_date','预计开票日期'],['order_status','订单状态'],['tax_rate','订单税率(%)'],['amount','订单含税总额'],['amount_ex_tax','订单不含税总额'],['detail_order_no','订单明细单号'],['customer_detail_order_no','客方订单明细单号'],['redemption_days','赎期(天)'],['is_last_order','是否末单'],['detail_tax_rate','明细税率(%)'],['detail_amount','明细含税金额'],['detail_amount_ex_tax','明细不含税金额'],['deduct_amount','扣款含税金额'],['deduct_amount_ex_tax','扣款不含税金额'],['stop_invoice_amount','停止开票含税金额'],['stop_invoice_amount_ex_tax','停止开票不含税金额'],['confirmed_income_amount','确认收入含税总额'],['confirmed_income_amount_ex_tax','确认收入不含税总额'],['unconfirmed_income_amount','未确认收入含税金额'],['unconfirmed_income_amount_ex_tax','未确认收入不含税金额'],['invoiced_amount','已开票含税总额'],['invoiced_amount_ex_tax','已开票不含税总额'],['returned_amount','已回款含税总额'],['returned_amount_ex_tax','已回款不含税总额'],['invoiced_unreturned_amount','已开票未回款含税金额'],['invoiced_unreturned_amount_ex_tax','已开票未回款不含税金额'],['region','区域'],['province','省份'],['city','地市'],['delivery_list','交付人员名单'],['income_confirmed','收入确认标记'],['maker','制单人'],['make_time','制单时间'],['detail_maker','明细制单人'],['detail_make_time','明细制单时间'],['updater','更新人'],['update_time','更新时间'],['auditor','审核人'],['audit_time','审核时间'],['has_attachment','附件'],['latest_attachment_time','最新附件上传时间'],['attachment_count','附件数量'],['has_eml','含eml附件'],['role','项目名称'],['service','服务内容'],['tech','技术要求'],['staff','人员要求'],
];

/** 综合检索专用：不加标题、合并单元格或统计行，只输出中文表头与真实台账数据。 */
export async function exportPlainSearchLedgerExcel(rows: Record<string, any>[], entity: 'contract' | 'order') {
  const columns = entity === 'order' ? SEARCH_ORDER_COLUMNS : SEARCH_CONTRACT_COLUMNS;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(entity === 'order' ? '订单台账' : '合同台账');
  ws.addRow(columns.map(([, label]) => label));
  rows.forEach((row) => ws.addRow(columns.map(([key]) => {
    if (['role','service','tech','staff'].includes(key)) return Number(row.module_hits?.find((x: any) => x.module_key === key)?.hit) === 1 ? 'AI' : '—';
    if (key === 'has_ai_keyword') return Number(row.has_ai_keyword ?? row.tag_ai) === 1 ? '是' : '否';
    return row[key] ?? '';
  })));
  ws.columns = columns.map(([key, label]) => ({ width: Math.min(Math.max(label.length + 4, key.includes('terms') ? 32 : 14), 36) }));
  await downloadWorkbook(wb, entity === 'order' ? '综合检索订单台账' : '综合检索合同台账');
}

export interface ExportContractRow {
  contract_no?: string;
  no?: string;
  customer_name?: string;
  customerName?: string;
  contract_name?: string;
  name?: string;
  assessment_line?: string;
  bid_no?: string | null;
  main_contract_no?: string | null;
  framework_short_name?: string | null;
  customer_contract_no?: string | null;
  signing_entity?: string | null;
  contract_type?: string | number;
  sign_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  amount_attr?: string | null;
  amount?: string | number;
  tax_rate?: string | null;
  settlement_terms?: string | null;
  has_post_assessment?: string | null;
  deposit_amount?: string | number | null;
  deposit_refund_condition?: string | null;
  arbitration_mode?: string | null;
  authorizer?: string | null;
  contract_status?: string | number;
  warning_status?: string | number;
  service_content?: string;
  tech_requirements?: string;
  job_description?: string;
  personnel_requirements?: string;
  [key: string]: any;
}

export interface ExportOrderRow {
  project_no?: string;
  project_name?: string;
  detail_project_no?: string;
  order_no?: string;
  no?: string;
  customer_order_no?: string;
  order_name?: string;
  name?: string;
  contract_no?: string;
  customer_name?: string;
  assessment_line?: string;
  customer_line?: string;
  customer_type?: string;
  settlement_type?: string;
  order_type?: string;
  order_attr?: string;
  salesperson?: string;
  customer_contract_no?: string;
  customer_service_target?: string;
  customer_pm?: string;
  customer_order_name?: string;
  created_date?: string;
  accepted_date?: string;
  start_date?: string;
  end_date?: string;
  est_invoice_date?: string;
  order_status?: string;
  tax_rate?: number | string;
  amount?: number | string;
  amount_ex_tax?: number | string;
  detail_order_no?: string;
  customer_detail_order_no?: string;
  redemption_days?: number | string;
  is_last_order?: string;
  detail_amount_ex_tax?: number | string;
  deduct_amount?: number | string;
  deduct_amount_ex_tax?: number | string;
  stop_invoice_amount?: number | string;
  stop_invoice_amount_ex_tax?: number | string;
  confirmed_income_amount?: number | string;
  confirmed_income_amount_ex_tax?: number | string;
  unconfirmed_income_amount?: number | string;
  unconfirmed_income_amount_ex_tax?: number | string;
  income_confirmed?: number | string;
  invoiced_amount?: number | string;
  invoiced_amount_ex_tax?: number | string;
  returned_amount?: number | string;
  returned_amount_ex_tax?: number | string;
  invoiced_unreturned_amount?: number | string;
  invoiced_unreturned_amount_ex_tax?: number | string;
  region?: string;
  province?: string;
  city?: string;
  delivery_list?: string;
  has_attachment?: string;
  latest_attachment_time?: string;
  attachment_count?: number | string;
  has_eml?: string;
  maker?: string;
  make_time?: string;
  detail_maker?: string;
  detail_make_time?: string;
  updater?: string;
  update_time?: string;
  auditor?: string;
  audit_time?: string;
  service_content?: string;
  tech_requirements?: string;
  job_description?: string;
  personnel_requirements?: string;
  [key: string]: any;
}

const borderThin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

/**
 * 导出合同台账 Excel (保持不变)
 */
export async function exportFullContractLedgerExcel(dataList: ExportContractRow[], fileNamePrefix: string = '合同台账全量明细') {
  if (!dataList || dataList.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('合同台账明细');

  ws.columns = [
    { width: 14 }, { width: 22 }, { width: 26 }, { width: 26 }, { width: 12 },
    { width: 16 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 18 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
    { width: 18 }, { width: 10 }, { width: 32 }, { width: 16 }, { width: 18 },
    { width: 32 }, { width: 18 }, { width: 12 }, { width: 14 }, { width: 18 },
    { width: 32 }, { width: 32 }, { width: 24 }, { width: 32 },
  ];

  const row1 = ws.addRow(['展示页信息\n最后来自\n台账项目', '展示页', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'AI', '', '', '']);
  row1.height = 36;
  ws.mergeCells('A1:A3');
  ws.mergeCells('B1:Y1');
  ws.mergeCells('Z1:AC1');

  const cellA1 = ws.getCell('A1');
  cellA1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
  cellA1.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  cellA1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const cellB1 = ws.getCell('B1');
  cellB1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  cellB1.font = { name: '微软雅黑', size: 10, bold: true };
  cellB1.alignment = { vertical: 'middle', horizontal: 'center' };

  const cellZ1 = ws.getCell('Z1');
  cellZ1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
  cellZ1.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellZ1.alignment = { vertical: 'middle', horizontal: 'center' };

  const row2Values = ['', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'EPMS', 'AI', 'AI', 'AI', 'AI'];
  const row2 = ws.addRow(row2Values);
  row2.height = 24;

  for (let c = 2; c <= 25; c++) {
    const cell = row2.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    cell.font = { name: '微软雅黑', size: 9, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  for (let c = 26; c <= 29; c++) {
    const cell = row2.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
    cell.font = { name: '微软雅黑', size: 9, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const row3Values = [
    '', '合同号', '客户名称', '合同名称', '考核线', '中标编号', '关联主合同号', '框架简称', '客方合同号',
    '签约法人体', '合同类型', '签约时间', '开始时间', '结束时间', '金额属性', '合同金额(含税)', '税率',
    '结算条款', '是否涉及后评估', '履约保证金金额', '履约保证金退还条件', '仲裁方式', '授权人',
    '合同状态', '合同断档预警', '服务内容', '技术要求', '岗位说明', '人员需求'
  ];
  const row3 = ws.addRow(row3Values);
  row3.height = 26;

  for (let c = 2; c <= 25; c++) {
    const cell = row3.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
    cell.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderThin;
  }
  for (let c = 26; c <= 29; c++) {
    const cell = row3.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
    cell.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderThin;
  }

  dataList.forEach((item, idx) => {
    // 四模块是台账 AI 判断列，不导出合同分段原文。
    const moduleAiFlag = (key: string) => {
      const hit = Array.isArray(item.module_hits) ? item.module_hits.find((x: any) => x.module_key === key) : undefined;
      return Number(hit?.hit) === 1 ? 'AI' : '—';
    };
    const rowValues = [
      '样本',
      item.contract_no || item.no || '—',
      item.customer_name || item.customerName || '—',
      item.contract_name || item.name || '—',
      item.assessment_line || '—',
      item.bid_no || '—',
      item.related_main_no || item.main_contract_no || '—',
      item.framework_alias || item.framework_short_name || '—',
      item.customer_contract_no || '—',
      item.signing_entity || '—',
      item.contract_type || '—',
      item.sign_date || '—',
      item.start_date || '—',
      item.end_date || '—',
      item.amount_type || item.amount_attr || '—',
      item.amount ?? '—',
      item.tax_rate || '—',
      item.settlement_terms || '—',
      item.post_eval || item.has_post_assessment || '—',
      item.deposit_amount ?? '—',
      item.deposit_refund || item.deposit_refund_condition || '—',
      item.arbitration || item.arbitration_mode || '—',
      item.authorizer || '—',
      item.status || item.contract_status || '—',
      item.expiry_warning || item.warning_status || '—',
      moduleAiFlag('service'),
      moduleAiFlag('tech'),
      moduleAiFlag('role'),
      moduleAiFlag('staff')
    ];

    const dataRow = ws.addRow(rowValues);
    dataRow.height = 22;

    const cellA = dataRow.getCell(1);
    cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    cellA.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'center' };
    cellA.border = borderThin;

    for (let c = 2; c <= 29; c++) {
      const cell = dataRow.getCell(c);
      cell.border = borderThin;
      cell.font = { name: '微软雅黑', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: (c === 16 ? 'right' : 'left') };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().substring(0, 10);
  link.setAttribute('download', `${fileNamePrefix}_${dateStr}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 1:1 还原 5 截图拼接样式的订单台账全量 Excel 导出 (exportFullOrderLedgerExcel)
 */
export async function exportFullOrderLedgerExcel(dataList: ExportOrderRow[], fileNamePrefix: string = '订单台账全量明细') {
  if (!dataList || dataList.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('订单台账明细');

  // 列标题与宽度设置
  const headers = [
    { title: '项目编号', width: 16 },
    { title: '项目名称', width: 34 },
    { title: '明细项目编号', width: 18 },
    { title: '订单编号', width: 22 },
    { title: '客方订单号', width: 20 },
    { title: '订单名称', width: 36 },
    { title: '合同编号', width: 18 },
    { title: '客户名称', width: 28 },
    { title: '考核线', width: 14 }, // Yellow
    { title: '客户线', width: 12 },
    { title: '客户类型', width: 12 },
    { title: '结算方式', width: 12 },
    { title: '订单类型', width: 12 },
    { title: '订单属性', width: 12 },
    { title: '业务员', width: 12 },
    { title: '客方合同编号', width: 20 },
    { title: '客方服务对象', width: 16 },
    { title: '客方项目经理', width: 16 },
    { title: '客方订单名称', width: 24 },
    { title: '生成日期', width: 14 },
    { title: '接受日期', width: 14 },
    { title: '订单开始日期', width: 14 },
    { title: '订单结束日期', width: 14 },
    { title: '预计开票日期', width: 14 },
    { title: '订单状态', width: 12 },
    { title: '订单税率(%)', width: 12 },
    { title: '订单含税总额', width: 16 },
    { title: '订单不含税总额', width: 16 },
    { title: '订单明细单号', width: 24 },
    { title: '客方订单明细单号', width: 22 },
    { title: '赎期(天)', width: 10 },
    { title: '是否末单', width: 10 },
    { title: '明细税率(%)', width: 12 },
    { title: '明细含税金额', width: 16 },
    { title: '明细不含税金额', width: 16 },
    { title: '扣款含税金额', width: 14 },
    { title: '扣款不含税金额', width: 14 },
    { title: '停止开票含税金额', width: 16 },
    { title: '停止开票不含税金额', width: 16 },
    { title: '确认收入含税总额', width: 16 },
    { title: '确认收入不含税总额', width: 16 },
    { title: '未确认收入含税金额', width: 16 },
    { title: '未确认收入不含税金额', width: 16 },
    { title: '已开票含税总额', width: 16 },
    { title: '已开票不含税总额', width: 16 },
    { title: '已回款含税总额', width: 16 },
    { title: '已回款不含税总额', width: 16 },
    { title: '已开票未回款含税金额', width: 18 },
    { title: '已开票未回款不含税金额', width: 18 },
    { title: '区域', width: 10 },
    { title: '省份', width: 10 },
    { title: '地市', width: 10 },
    { title: '交付人员名单', width: 18 },
    { title: '收入确认标记', width: 14 },
    { title: '制单人', width: 12 },
    { title: '制单时间', width: 20 },
    { title: '明细制单人', width: 12 },
    { title: '明细制单时间', width: 20 },
    { title: '更新人', width: 12 },
    { title: '更新时间', width: 20 },
    { title: '审核人', width: 12 },
    { title: '审核时间', width: 20 },
    { title: '附件', width: 10 },
    { title: '最新附件上传时间', width: 20 },
    { title: '附件数量', width: 12 }, // Yellow
    { title: '含eml附件', width: 12 }, // Yellow
    // 与 v1.3 订单台账列表完全一致：项目名称、服务内容、技术要求、人员要求。
    { title: '项目名称', width: 20 }, // Yellow AI
    { title: '服务内容', width: 20 }, // Yellow AI
    { title: '技术要求', width: 20 }, // Yellow AI
    { title: '人员要求', width: 20 }, // Yellow AI
    { title: '是否包含AI关键词', width: 18 },
    { title: '命中AI关键词', width: 34 },
  ];

  // 列宽设置
  ws.columns = [{ width: 16 }, ...headers.map((h) => ({ width: h.width }))];

  // 1. 第一行：分组大表头 (Row 1)
  const row1Values = ['展示页信息\n最后来自\n台账项目'];
  for (let i = 0; i < headers.length; i++) {
    const colIdx = i + 2; // Column 2 is B
    if (colIdx >= 2 && colIdx <= 9) { // B..I
      row1Values.push(colIdx === 2 ? '展示页' : '');
    } else if (colIdx === 10) { // J (考核线)
      row1Values.push('根据项目编号匹配');
    } else if (colIdx >= 11 && colIdx <= 64) { // K..BL
      row1Values.push(colIdx === 11 ? '展示页' : '');
    } else if (colIdx >= 65 && colIdx <= 66) { // BM..BN
      row1Values.push(colIdx === 65 ? '展示页' : '');
    } else if (colIdx >= 67 && colIdx <= 70) { // BP..BS
      row1Values.push(colIdx === 67 ? 'AI' : '');
    } else {
      row1Values.push('');
    }
  }

  const row1 = ws.addRow(row1Values);
  row1.height = 36;

  ws.mergeCells('A1:A3');
  ws.mergeCells('B1:I1');
  ws.mergeCells('K1:BL1');
  ws.mergeCells('BM1:BN1');
  ws.mergeCells('BP1:BU1');

  // 样式设置 Row 1
  const cellA1 = ws.getCell('A1');
  cellA1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
  cellA1.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  cellA1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cellA1.border = borderThin;

  ws.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  ws.getCell('B1').font = { name: '微软雅黑', size: 9, bold: true };
  ws.getCell('B1').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell('J1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
  ws.getCell('J1').font = { name: '微软雅黑', size: 9, bold: true };
  ws.getCell('J1').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell('K1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  ws.getCell('K1').font = { name: '微软雅黑', size: 9, bold: true };
  ws.getCell('K1').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell('BM1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  ws.getCell('BM1').font = { name: '微软雅黑', size: 9, bold: true };
  ws.getCell('BM1').alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getCell('BP1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
  ws.getCell('BP1').font = { name: '微软雅黑', size: 9, bold: true };
  ws.getCell('BP1').alignment = { vertical: 'middle', horizontal: 'center' };

  // 2. 第二行：系统来源大表头 EPMS / AI (Row 2)
  const row2Values = [''];
  for (let i = 0; i < headers.length; i++) {
    const colIdx = i + 2;
    if (colIdx >= 65 && colIdx <= 72) {
      row2Values.push('AI');
    } else {
      row2Values.push('EPMS');
    }
  }
  const row2 = ws.addRow(row2Values);
  row2.height = 24;

  for (let i = 0; i < headers.length; i++) {
    const colIdx = i + 2;
    const cell = row2.getCell(colIdx);
    cell.border = borderThin;
    cell.font = { name: '微软雅黑', size: 9, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };

    if (colIdx >= 65 && colIdx <= 72) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    }
  }

  // 3. 第三行：具体字段列名表头 (Row 3)
  const row3Values = ['', ...headers.map((h) => h.title)];
  const row3 = ws.addRow(row3Values);
  row3.height = 26;

  const yellowCols = [10, 65, 66, 67, 68, 69, 70]; // J, BM, BN, BO, BP, BQ, BR, BS (1-based col index)

  for (let i = 0; i < headers.length; i++) {
    const colIdx = i + 2;
    const cell = row3.getCell(colIdx);
    cell.border = borderThin;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };

    if (yellowCols.includes(colIdx)) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEE00' } };
      cell.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FF000000' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
      cell.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    }
  }

  // 4. 填充数据行 (Row 4 onwards)
  dataList.forEach((item) => {
    const orderModuleHit = (key: string) => Array.isArray((item as any).module_hits)
      && (item as any).module_hits.some((x: any) => x.module_key === key && x.hit === 1) ? 'AI' : '—';
    const matchedKeywords = (() => {
      const direct = Array.isArray((item as any).ai_keywords) ? (item as any).ai_keywords : [];
      const moduleTerms = Array.isArray((item as any).module_hits)
        ? (item as any).module_hits.flatMap((x: any) => String(x.keywords || '').split(/[,，、]/))
        : [];
      const values = [...new Set([...direct, ...moduleTerms].map((x) => String(x).trim()).filter(Boolean))];
      return values.join('、') || '—';
    })();
    const rowVal = [
      '样本',
      item.project_no ?? '—', item.project_name ?? '—', item.detail_project_no ?? '—',
      item.order_no ?? item.no ?? '—', item.customer_order_no ?? '—', item.order_name ?? item.name ?? '—',
      item.contract_no ?? '—', item.customer_name ?? (item as any).customer ?? '—', item.assessment_line ?? '—',
      item.customer_line ?? '—', item.customer_type ?? '—', item.settlement_type ?? '—', item.order_type ?? '—',
      item.order_attr ?? '—', item.salesperson ?? '—', item.customer_contract_no ?? '—',
      item.customer_service_target ?? '—', item.customer_pm ?? '—', item.customer_order_name ?? '—',
      item.created_date ?? '—', item.accepted_date ?? '—', item.start_date ?? '—', item.end_date ?? '—',
      item.est_invoice_date ?? '—', item.order_status ?? '—', item.tax_rate ?? '—', item.amount ?? '—',
      item.amount_ex_tax ?? '—', item.detail_order_no ?? '—', item.customer_detail_order_no ?? '—',
      item.redemption_days ?? '—', item.is_last_order ?? '—', item.detail_tax_rate ?? item.tax_rate ?? '—',
      item.detail_amount ?? item.amount ?? '—', item.detail_amount_ex_tax ?? '—', item.deduct_amount ?? '—',
      item.deduct_amount_ex_tax ?? '—', item.stop_invoice_amount ?? '—', item.stop_invoice_amount_ex_tax ?? '—',
      item.confirmed_income_amount ?? '—', item.confirmed_income_amount_ex_tax ?? '—',
      item.unconfirmed_income_amount ?? '—', item.unconfirmed_income_amount_ex_tax ?? '—', item.invoiced_amount ?? '—',
      item.invoiced_amount_ex_tax ?? '—', item.returned_amount ?? '—', item.returned_amount_ex_tax ?? '—',
      item.invoiced_unreturned_amount ?? '—', item.invoiced_unreturned_amount_ex_tax ?? '—', item.region ?? '—',
      item.province ?? '—', item.city ?? '—', item.delivery_list ?? '—',
      item.income_confirmed == null ? '—' : Number(item.income_confirmed) === 1 ? '已确认' : '未确认',
      item.maker ?? '—', item.make_time ?? '—', item.detail_maker ?? '—', item.detail_make_time ?? '—',
      item.updater ?? '—', item.update_time ?? '—', item.auditor ?? '—', item.audit_time ?? '—',
      item.has_attachment ?? '—', item.latest_attachment_time ?? '—', item.attachment_count ?? '—', item.has_eml ?? '—',
      item.job_description || orderModuleHit('role'),
      item.service_content || orderModuleHit('service'),
      item.tech_requirements || orderModuleHit('tech'),
      item.personnel_requirements || orderModuleHit('staff'),
      Number((item as any).tag_ai ?? (item as any).has_ai_keyword) === 1 ? '是' : '否',
      matchedKeywords,
    ];

    const dataRow = ws.addRow(rowVal);
    dataRow.height = 22;

    const cellA = dataRow.getCell(1);
    cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    cellA.font = { name: '微软雅黑', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'center' };
    cellA.border = borderThin;

    for (let c = 2; c <= rowVal.length; c++) {
      const cell = dataRow.getCell(c);
      cell.border = borderThin;
      cell.font = { name: '微软雅黑', size: 9 };
      const val = rowVal[c - 1];
      const isNum = typeof val === 'number';
      cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left' };
      if (isNum && typeof val === 'number' && val > 100) {
        cell.numFmt = '#,##0.00';
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().substring(0, 10);
  link.setAttribute('download', `${fileNamePrefix}_${dateStr}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
