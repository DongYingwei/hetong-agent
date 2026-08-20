import request from '../utils/request';
import type { ApiResponse } from '../types';

/** 草稿表单字段（解析抽取的 AI 字段 + 手工列，供人工核对编辑）。 */
export interface DraftForm {
  contract_no: string;
  customer_name?: string;
  contract_name?: string;
  contract_type?: string;
  sign_date?: string;
  start_date?: string;
  end_date?: string;
  amount_type?: string;
  amount?: number | null;
  tax_rate?: string;
  settlement_terms?: string;
  assessment_line?: string;
  status?: string;
  tag_ai?: number;
  [k: string]: unknown;
}

export interface ModuleHit {
  module_key: string;
  hit: number;
  keywords?: string | null;
  category?: string | null;
  raw_text?: string | null;
}

export interface DraftData {
  draft_id: number;
  form: DraftForm;
  module_hits: ModuleHit[];
  mineru_md_preview: string;
  mineru_md_len: number;
}

/** 上传 /parse 的返回：解析后即入草稿，回带草稿字段。 */
export interface ParseUploadResult {
  path: string;
  status: 'ingested' | 'skipped_duplicate' | 'failed';
  draft_id: number | null;
  contract_id?: number | null;
  draft?: DraftData;
}

export interface ConfirmResult {
  contract_id: number;
  chunks: number;
  vectorized: boolean;
}

export interface SourceFile {
  id: number;
  name: string;
  role: string;
}

export interface ContractParseJob {
  id: number;
  package_id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  total_files: number;
  processed_files: number;
  current_file?: string | null;
  error_message?: string | null;
  draft_id?: number | null;
  extractor_provider: 'qwen' | 'deepseek';
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * 解析侧代理 API —— 上传 PDF → 解析入草稿 → 人工核对 → 入库+建向量。
 * 全经网关 /api/parse/* 转发到解析 FastAPI（解析同步等待，超时给足）。
 */
export const parseApi = {
  /** 上传 PDF，同步解析入草稿（大 PDF 可能数分钟）。force=true 跳过指纹去重、强制重解析。 */
  upload(formData: FormData, force = false): Promise<ApiResponse<ParseUploadResult>> {
    return request.post(`/parse/upload${force ? '?force=true' : ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 解析同步等待，覆盖默认超时
    });
  },

  uploadPackage(formData: FormData, force = false): Promise<ApiResponse<ParseUploadResult>> {
    return request.post(`/parse/upload-package${force ? '?force=true' : ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
    });
  },

  /** 异步上传：上传完成后后台依次进行 MinerU 与字段抽取。 */
  enqueueJobs(formData: FormData): Promise<ApiResponse<{ jobs: Array<{ id: number | null; name: string; total_files: number; status?: string; draft_id?: number | null; contract_id?: number | null }> }>> {
    return request.post('/parse/jobs/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
    });
  },

  getJobs(): Promise<ApiResponse<{ list: ContractParseJob[] }>> {
    return request.get('/parse/jobs');
  },

  retryJob(jobId: number): Promise<ApiResponse<{ id: number; status: string; extractor_provider: string }>> {
    return request.post(`/parse/jobs/${jobId}/retry`);
  },

  /** 读草稿全字段供核对页展示。 */
  getDraft(draftId: number): Promise<ApiResponse<DraftData>> {
    return request.get(`/parse/draft/${draftId}`);
  },

  getDraftSourceFiles(draftId: number): Promise<ApiResponse<{ list: SourceFile[] }>> {
    return request.get(`/parse/draft/${draftId}/source-files`);
  },

  getDraftOriginalPdfUrl(draftId: number, sourceId?: number): string {
    const port = import.meta.env.VITE_API_PORT || '3002';
    const suffix = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : '';
    return `http://${window.location.hostname}:${port}/api/parse/draft/${draftId}/original-pdf${suffix}`;
  },

  /** 人工核对入库 + 建向量。overrides = 人工修正的字段。 */
  confirm(draftId: number, overrides: Record<string, unknown>): Promise<ApiResponse<ConfirmResult>> {
    return request.post(`/parse/confirm/${draftId}`, { overrides }, { timeout: 600000 });
  },
};
