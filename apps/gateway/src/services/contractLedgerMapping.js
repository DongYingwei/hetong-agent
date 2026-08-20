/**
 * 查询库 contracts 的正式入库状态与人工核对状态是两回事。
 * review_status 仅来自 contract_manual_reviews；缺失记录必须展示为待核对。
 */
export function mapContractLedgerRow(row) {
  return {
    ...row,
    contract_status: row.status ?? '',
    verify_status: Number(row.review_status || 0),
    warning_status: row.expiry_warning ? 1 : 0,
    has_ai_keyword: row.tag_ai ?? 0,
  };
}
