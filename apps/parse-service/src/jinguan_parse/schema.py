"""抽取 schema —— §5.3 的 20 个 AI 字段，按 6 大类分组（instructor 用）。

20 个 AI 字段（§5.3 填写方式=AI，排除 6 手工列 + 3 系统列）：
  概要信息(9)：customer_name, contract_name, customer_contract_no, signing_entity,
               contract_type, sign_date, start_date, end_date
               —— 注：§5.3 第2,3,8,9,10,11,12,13 行，共 8 个标量 + 客户名 = 见下计数
  金额及结算(4)：amount_type, amount, tax_rate, settlement_terms
  商务条款(5)：post_eval, deposit_amount, deposit_refund, arbitration, authorizer
  模块原文(4)：mod_service, mod_tech, mod_role, mod_staff（配置驱动，见 ADR-0004）

字段口径严格照 §5.3。日期/金额一律先抽为原始字符串（LLM 直出），落库前再规整——
保留 <field>_ai_raw 留痕（§7.2）。此处 schema 只负责"让 LLM 结构化直出候选"。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SummaryFields(BaseModel):
    """概要信息（§5.3 第2,3,8,9,10,11,12,13 行，AI 抽取）。"""

    customer_name: str | None = Field(None, description="甲方客户名称，多客户全列出")
    contract_name: str | None = Field(None, description="合同名称，一般在首页")
    customer_contract_no: str | None = Field(None, description="客方合同号，一般在首页")
    signing_entity: str | None = Field(None, description="我方签约法人主体")
    contract_type: str | None = Field(None, description="合同类型：框架/单项/补充/解除/变更协议")
    sign_date: str | None = Field(None, description="签约时间，原文日期字符串，如 2026-04-02")
    start_date: str | None = Field(None, description="开始时间，原文日期字符串")
    end_date: str | None = Field(None, description="结束时间，原文日期字符串")


class AmountFields(BaseModel):
    """金额及结算（§5.3 第14-17 行，AI 抽取）。"""

    amount_type: str | None = Field(None, description="金额属性：上限/预估/固定金额")
    amount: str | None = Field(None, description="合同金额(含税)原文，单位元；框架协议可能无金额→留空")
    tax_rate: str | None = Field(None, description="税率，多税率全列出（文本，非数值）")
    settlement_terms: str | None = Field(None, description="结算条款原文")


class CommercialFields(BaseModel):
    """商务条款（§5.3 第18-22 行，AI 抽取）。"""

    post_eval: str | None = Field(None, description="是否涉及后评估：是/否")
    deposit_amount: str | None = Field(None, description="履约保证金金额原文")
    deposit_refund: str | None = Field(None, description="履约保证金退还条件原文")
    arbitration: str | None = Field(None, description="仲裁方式原文")
    authorizer: str | None = Field(None, description="授权人")


class ContractExtraction(BaseModel):
    """一份合同的 AI 抽取结果（20 字段：8 概要 + 4 金额 + 5 商务 + 3? ——见下）。

    计数校准（§5.3 AI 列）：概要 8 + 金额 4 + 商务 5 = 17 标量 AI 字段；
    模块原文 4（mod_service/tech/role/staff）单独由模块抽取阶段处理（配置驱动），
    故 LLM 一次性直出的是这 17 个标量字段。17 + 4 模块原文 = §5.3 的 20 个 AI 逻辑字段。
    """

    summary: SummaryFields = Field(default_factory=SummaryFields)
    amount: AmountFields = Field(default_factory=AmountFields)
    commercial: CommercialFields = Field(default_factory=CommercialFields)

    def flat_ai_fields(self) -> dict[str, str | None]:
        """摊平为 {列名: 值}，键与 contracts DDL 列名一一对应。"""
        out: dict[str, str | None] = {}
        out.update(self.summary.model_dump())
        out.update(self.amount.model_dump())
        out.update(self.commercial.model_dump())
        return out
