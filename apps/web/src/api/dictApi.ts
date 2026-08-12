import request from '../utils/request';
import type { ApiResponse, DictItem } from '../types';

export const dictApi = {
  /**
   * 初始化数据字典 Map
   */
  getDictInit(): Promise<ApiResponse<Record<string, DictItem[]>>> {
    return request.get('/dict/init');
  },
};
