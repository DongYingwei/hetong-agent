# 前端交接说明

交接分支：`frontend/handoff-20260817`。前端工程师仅可修改 `apps/web/`；不要修改
`apps/gateway/`、`apps/parse-service/`、`apps/query-agent/`、`packages/`、`data/` 或任何数据库迁移。
视觉和交互以最终前端设计为准，`jingxiaoguan-master/` 仅作参考，不能整目录覆盖 `apps/web/`。

## 本地运行

```bash
cd apps/web
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

前端请求地址为 `http://<当前浏览器主机>:3002/api`（可由 `VITE_API_PORT` 覆盖）。登录成功后
令牌保存在 `localStorage.contract_token`；所有接口请求及 PDF Blob 请求都必须带
`Authorization: Bearer <contract_token>`。

## 必须保留的真实接口与状态

### 合同台账

- `GET /api/contract/list`：支持 `page`、`pageSize`、`keyword`、`hasAiKeyword`、`verifyStatus`、`moduleKey`、`moduleKeyword`。
- `GET /api/contract/detail/:id`：返回合同台账字段和 `module_hits`；不返回全文 Markdown。
- `GET /api/contract/:id/source-files`：合同关联 PDF 清单。
- `GET /api/contract/:id/original-pdf?sourceId=<id>`：原文件预览，必须使用带令牌的 fetch 后转 Blob URL。
- `POST /api/contract/verify/:id`：人工保存核对后，`verify_status` 从 `0`（待核对，显示“核对”）变 `1`（已核对，显示“查看”）。这不改变合同入库或向量状态。
- 合同详情页须保留六个页签：基本信息、合同-金额及结算、合同-商务条款、风控管理、关键词解析、原文件预览。
- 关键词四模块只展示 `AI` 或 `—`，不是展示整段合同正文。

### 订单台账

- `GET /api/order/list`、`GET /api/order/detail/:id` 返回 EPMS 真实订单数据和 `module_hits`。
- `PUT /api/order/detail/:id` 是人工覆盖层：保存后页面显示更新，后续 EPMS 同步不会覆盖；不可伪造为源数据。
- 订单四模块同样显示 `AI` 或 `—`，没有固定列要求。

### 模块配置与关键词

- `GET/POST /api/section/*`：模块配置含 `scope`，仅允许 `contract`、`order`、`all`；页面标签分别为“仅合同”“仅订单”“合同+订单”。
- 关键词管理、模块配置均使用真实接口，不能放入静态 mock 数据。

### 综合检索

- 返回 SQL 结构化结果时以合同或订单台账表格展示，默认仅显示前 5 条；“查看全部明细”展开。
- 顶部/底部汇总使用接口返回的统计数据；合同金额按合同金额口径汇总。
- 不向客户展示 SQL、内部提示词、Harness 或模型执行细节；可展示面向业务人员的“检索过程”标签。

## 接口缺口与合并规则

若页面需要现有接口没有的字段/行为：创建 GitLab Issue，写清页面、字段、交互、期望响应，等待接口补齐；
接口未支持前可显示“暂无数据/待接口支持”，不得用 mock 数据替代。

前端工程师提交 Merge Request 到 `master`。合并前必须满足：

1. 仅改动 `apps/web/`（及经确认的前端文档）；
2. 你已完成视觉和交互验收；
3. `npm run build` 可通过，或 MR 中清晰列出已存在且与本次无关的类型检查问题；
4. 不删除真实接口调用、登录令牌传递、PDF Blob 预览和台账状态逻辑。
