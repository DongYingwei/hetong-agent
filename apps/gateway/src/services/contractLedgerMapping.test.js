import test from 'node:test';
import assert from 'node:assert/strict';
import { mapContractLedgerRow } from './contractLedgerMapping.js';

test('正式入库但没有人工核对记录时，必须显示待核对', () => {
  const row = mapContractLedgerRow({ confirmed: 1, review_status: 0, status: '已签约', tag_ai: 1 });
  assert.equal(row.verify_status, 0);
});

test('只有人工核对记录为已核对时才显示已核对', () => {
  const row = mapContractLedgerRow({ confirmed: 1, review_status: 1, status: '已签约', tag_ai: 0 });
  assert.equal(row.verify_status, 1);
});
