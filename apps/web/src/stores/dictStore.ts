import { defineStore } from 'pinia';
import { ref } from 'vue';
import { dictApi } from '../api';
import type { DictItem } from '../types';

export const useDictStore = defineStore('dict', () => {
  const dictMap = ref<Record<string, DictItem[]>>({
    contract_status: [
      { label: '流水中', value: 1 },
      { label: '已签约', value: 2 },
      { label: '已闭环', value: 3 },
      { label: '已作废', value: 4 },
    ],
    contract_type: [
      { label: '框架协议', value: 1 },
      { label: '单项合同', value: 2 },
      { label: '补充协议', value: 3 },
      { label: '解除协议', value: 4 },
      { label: '变更协议', value: 5 },
    ],
    verify_status: [
      { label: '未核对', value: 0 },
      { label: '已核对', value: 1 },
      { label: '异常', value: 2 },
    ],
    warning_status: [
      { label: '正常', value: 0 },
      { label: '到期前4个月', value: 1 },
      { label: '到期前3个月', value: 2 },
      { label: '到期前2个月', value: 3 },
      { label: '到期前1个月', value: 4 },
    ],
  });

  async function fetchDictInit() {
    try {
      const res = await dictApi.getDictInit();
      if (res.code === 200 && res.data) {
        dictMap.value = { ...dictMap.value, ...res.data };
      }
    } catch (e) {
      console.warn('获取系统初始化字典失败，使用本地默认 Map');
    }
  }

  function getLabel(dictType: string, val: number | string): string {
    const list = dictMap.value[dictType] || [];
    const item = list.find((d) => String(d.value) === String(val));
    return item ? item.label : String(val ?? '—');
  }

  return {
    dictMap,
    fetchDictInit,
    getLabel,
  };
});
