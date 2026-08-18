import { describe, expect, it } from 'vitest';
import { buildModuleFilters, hasModuleAiHit } from './moduleAi';

describe('动态模块 AI 筛选', () => {
  it('仅提交已选择的模块，并展开关键词及其子词', () => {
    expect(buildModuleFilters(
      { role: '人工智能', service: '', custom: 'OCR' },
      new Map([['人工智能', ['人工智能', 'AI']], ['OCR', ['OCR']]]),
    )).toBe(JSON.stringify([
      { module_key: 'role', keywords: ['人工智能', 'AI'] },
      { module_key: 'custom', keywords: ['OCR'] },
    ]));
  });

  it('只将真实命中渲染为 AI', () => {
    expect(hasModuleAiHit({ module_hits: [{ module_key: 'service', hit: 1 }] }, 'service')).toBe(true);
    expect(hasModuleAiHit({ module_hits: [{ module_key: 'service', hit: 0 }] }, 'service')).toBe(false);
    expect(hasModuleAiHit({ module_hits: [] }, 'service')).toBe(false);
  });
});
