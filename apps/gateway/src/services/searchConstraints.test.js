import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchConstraints, filterRecordsByConstraints } from './searchConstraints.js';

test('提取运营商服务内容 AI 的不可放宽条件，并过滤错误候选合同', () => {
  const constraints = extractSearchConstraints('考核线是运营商的在服务内容里含有AI的合同金额是多少，合同数量有几个？');
  assert.deepEqual(constraints, { assessmentLine: '运营商', requiredModuleHits: ['service'] });
  const records = [
    { contract_no: 'A', assessment_line: '运营商', module_hits: [{ module_key: 'service', hit: 1 }] },
    { contract_no: 'B', assessment_line: '软件', module_hits: [{ module_key: 'service', hit: 1 }] },
    { contract_no: 'C', assessment_line: '运营商', module_hits: [{ module_key: 'tech', hit: 1 }] },
  ];
  assert.deepEqual(filterRecordsByConstraints(records, constraints).map((row) => row.contract_no), ['A']);
});

test('模糊的通信一词不自动映射考核线', () => {
  assert.deepEqual(extractSearchConstraints('通信项目中服务内容含 AI 的合同'), {
    assessmentLine: undefined,
    requiredModuleHits: ['service'],
  });
});
