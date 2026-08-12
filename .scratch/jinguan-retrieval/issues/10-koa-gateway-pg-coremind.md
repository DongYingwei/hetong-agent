# 10 — Koa 网关适配 PG + CoreMind Agent 代理

**What to build:** 现有 Koa 后端 MySQL→PG 迁移(运营表：用户/权限/字典/文件/关键词/范本保留，数据库换 PG)；保留鉴权 + 响应格式(`{code,msg,data}`) + 分页 + 文件管理 + 日志；新增 PG 连接池；`/api/agent/chat` 改为代理到 CoreMind(或 SDK 调用)，不再用裸 `generateText`。登录→CRUD 正常；`/agent/chat`→CoreMind 返回。

**Blocked by:** T01(PG 有表才能连)

**Status:** ready-for-agent · **AFK**（MySQL→PG 机械迁移 + 代理接缝）

## 九维度

- **功能范围**：运营表 MySQL→PG DDL/种子迁移；mysql2→PG 连接池；CRUD 路由适配 PG 语法；`/agent/chat` 代理到 CoreMind。
- **非目标**：不动 CoreMind Agent 内部(→T06/07/08)；不动前端(→T11)；不用原型的裸 LLM 调用。
- **用户/系统流程**：登录→JWT→CRUD 走 PG；聊天请求 → Koa 代理 → CoreMind → 返回富格式。
- **数据与状态变化**：运营库切 PG；agent 会话状态在 CoreMind session，Koa 无状态转发。
- **接口/模块边界**：Koa = 鉴权 + 运营 CRUD + 代理接缝；查询智能逻辑全在 CoreMind。
- **权限与安全**：jwt + crypto-js 加解密保留；文件持久化 3 个月限制保留。
- **失败处理**：CoreMind 不可达 → 返回 `{code:500,msg}` 而非裸抛；CRUD 错误码不变。
- **兼容性 · 坑1/坑6**：**统一 PG**——不碰原型 `init.sql`(MySQL)；响应格式 `{code,msg,data}` 保持前端不改。
- **可观察性**：登录 + 一条 CRUD + 一条 `/agent/chat` 三条冒烟；返回码与结构可断言。

## 验收标准（可观测）

- [ ] 登录返回 JWT；一条受保护 CRUD(如 contract 列表)走 PG 返回 `{code:200,...}`
- [ ] 运营表(用户/权限/字典/文件/关键词/范本)在 PG 建成、种子迁移完成
- [ ] `POST /api/agent/chat` → 代理到 CoreMind → 返回 Agent 结果(非裸 generateText)
- [ ] 响应格式 `{code,msg,data}` 与分页结构不变(前端零改动即可对接)
- [ ] 文件持久化 3 个月限制保留

## 验证方法

```bash
curl -s -X POST $API/login -d '...' | jq .data.token
curl -s $API/api/contract/list -H "Authorization: $T" | jq .code   # 200
curl -s -X POST $API/api/agent/chat -d '{"q":"..."}' | jq .data     # CoreMind 结果
```

## 完成定义

运营表迁 PG + 连接池切换完成；鉴权/响应格式/分页/文件不变；`/agent/chat` 代理到 CoreMind；三条冒烟(登录/CRUD/chat)通过。
