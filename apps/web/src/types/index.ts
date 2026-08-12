/**
 * 系统核心 TypeScript 接口类型定义
 */

export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T = any> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: number;
  username: string;
  realName: string;
  role: number; // 0管理员 1普通用户
  status: number; // 1启用 0禁用
  createTime?: string;
}

export interface ContractLedger {
  id: number;
  contract_no: string;
  customer_name: string;
  contract_name: string;
  contract_type: number; // 1框架协议 2单项合同 3补充协议 4解除协议 5变更协议
  sign_date: string;
  amount: number;
  assessment_line: string;
  has_ai_keyword: number; // 0否 1是
  contract_status: number; // 1流水中 2已签约 3已闭环 4已作废
  verify_status: number; // 0未核对 1已核对 2异常
  warning_status?: number;
  create_time?: string;
}

export interface ContractKeyword {
  id: number;
  keyword_name: string;
  category: string;
  section_block?: string;
  hit_count?: number;
  description: string;
  status: number;
  create_time?: string;
}

export interface ContractSection {
  id: number;
  section_title: string;
  category?: string;
  sub_names?: string;
  keyword_count?: number;
  hit_count?: number;
  rules_desc?: string;
  status?: number;
  content?: string;
  version?: string;
  create_time?: string;
}

export interface SysFile {
  id: number;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type: string;
  upload_time: string;
  expire_time: string;
}

export interface DictItem {
  label: string;
  value: number | string;
}

export interface OrderLedger {
  id: number;
  project_no: string;
  project_name: string;
  order_no: string;
  order_name: string;
  customer_name: string;
  assessment_line: string;
  customer_line?: string;
  start_date: string;
  end_date: string;
  tax_rate: number;
  amount: number;
  income_confirmed: number; // 0未确认 1已确认
  attachment_count: number;
  has_eml: string; // '是' | '否'
  hit_keyword?: string;
  order_type?: string; // ARP / ASP
  // 详情丰富字段 (1:1 demo3.html)
  detail_project_no?: string;
  customer_order_no?: string;
  contract_no?: string;
  customer_type?: string;
  settlement_type?: string;
  order_attr?: string;
  salesperson?: string;
  customer_contract_no?: string;
  customer_service_target?: string;
  customer_pm?: string;
  customer_order_name?: string;
  created_date?: string;
  accepted_date?: string;
  est_invoice_date?: string;
  order_status?: string;
  amount_ex_tax?: number;
  detail_order_no?: string;
  customer_detail_order_no?: string;
  redemption_days?: number;
  is_last_order?: string;
  detail_amount_ex_tax?: number;
  deduct_amount?: number;
  deduct_amount_ex_tax?: number;
  stop_invoice_amount?: number;
  stop_invoice_amount_ex_tax?: number;
  confirmed_income_amount?: number;
  confirmed_income_amount_ex_tax?: number;
  unconfirmed_income_amount?: number;
  unconfirmed_income_amount_ex_tax?: number;
  invoiced_amount?: number;
  invoiced_amount_ex_tax?: number;
  returned_amount?: number;
  returned_amount_ex_tax?: number;
  invoiced_unreturned_amount?: number;
  invoiced_unreturned_amount_ex_tax?: number;
  region?: string;
  province?: string;
  city?: string;
  delivery_list?: string;
  has_attachment?: string;
  latest_attachment_time?: string;
  maker?: string;
  make_time?: string;
  detail_maker?: string;
  detail_make_time?: string;
  updater?: string;
  update_time?: string;
  auditor?: string;
  audit_time?: string;
  ai_keywords?: any;
}

