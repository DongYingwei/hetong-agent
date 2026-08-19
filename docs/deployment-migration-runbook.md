# 经小管服务器迁移与内部验收手册

> 目标服务器：`192.168.101.217`（`ubuntu`）
> 开发机：`192.168.10.69`
> 内部验收地址：`http://192.168.101.217:5174`
> 本文不记录密码、JWT 或模型 API Key。

## 1. 部署拓扑

```text
浏览器 → 5174（经小管独立 Nginx，前端静态文件 + /api 反代）
                 └─ Gateway :3002（仅本机）
                     ├─ Parse Service :8100（仅本机）
                     ├─ Query Agent :8101（仅本机）
                     ├─ PostgreSQL :5432（仅本机）
                     └─ Milvus :19530（仅本机）

外部依赖：Qwen / MinerU / Embedding / Reranker 内网服务
```

服务器 `80/443` 已由既有 Dify Nginx 占用。内部验收阶段不得修改该 Nginx，也不得抢占 `80/443`。

## 2. 持久化目录

```text
/opt/jingxiaoguan/
  releases/<版本>/                  # 代码发布目录
  current -> releases/<版本>         # 当前版本软链接
  runtime/postgres/                  # 新 PostgreSQL 16 实时数据
  runtime/milvus/                    # 新 Milvus 实时数据
  shared/env/                        # 生产环境变量（600 权限，不进 Git）

/data/jingxiaoguan/
  backups/initial/                   # 初始数据库备份
  contracts/pdf/                     # 合同原始 PDF
  contracts/md-file/                 # 合同 Markdown 与 manifest.json
  epms/EPMS/                          # 订单原始数据及附件
  epms/md-epms/                       # 订单附件 Markdown 与 manifest
  epms/epms-sync-state.json           # 订单同步断点
```

`md-file`、`md-epms` 是当前真实目录名，部署后不得改名，否则会破坏数据库中的来源路径映射。

## 3. 已完成迁移记录（2026-08-18）

| 项目 | 结果 |
|---|---:|
| 正式合同 `contracts.confirmed=1` | 59 条 |
| 合同来源文件 | 76 条 |
| 合同 PDF | 服务器已有 81 个（保留，不删除） |
| 合同 Markdown | 76 个，`manifest.json` 已存在 |
| 订单台账 `contract_assistant.sys_order` | 5,213 条 |
| 订单 Markdown | 已迁移至 `/data/jingxiaoguan/epms/md-epms` |

### 数据库纠正记录

经小管运营库的真实来源是开发机容器 `hetong-contracts-db` 内的 `contract_assistant` 数据库。

`pg_ip_agent` 的 `ip_agent` 数据库属于另一套知识产权系统，曾被误导入目标服务器，随后已删除；禁止将其作为经小管数据源。

## 4. 基础设施

基础设施 Compose 文件位于服务器：`~/jingxiaoguan-infra/compose.yml`。

独立容器：

```text
jingxiaoguan-postgres   postgres:16-alpine
jingxiaoguan-etcd       etcd:v3.5.5
jingxiaoguan-minio      仅供 Milvus 内部对象存储
jingxiaoguan-milvus     milvus:v2.4.5
```

禁止操作或复用服务器既有的 Dify、旧 Milvus、旧 PostgreSQL 容器。

## 5. 数据迁移标准流程

1. 开发机从 `hetong-contracts-db` 导出 `contracts` 与 `contract_assistant` 为 custom dump。
2. 使用 `rsync -av` 同步 dump、合同 PDF、`md-file`、EPMS、`md-epms` 与 checkpoint；禁止使用 `--delete`。
3. 目标服务器启动全新的 PostgreSQL/Milvus。
4. 创建 `contracts`、`contract_assistant` 数据库；使用 `pg_restore --no-owner --no-privileges` 恢复。
5. 校验合同数、订单数、来源文件与 manifest。
6. 建立只读查询账号 `jinguan_readonly`，分别授予两个业务库的 `CONNECT`、schema `USAGE`、表 `SELECT`。
7. 仅在数据库与文件校验完成后，重建已确认合同的 Milvus 向量。

## 6. 生产环境变量要点

生产 `.env` 统一保存在 `/opt/jingxiaoguan/shared/env/`，权限为 `600`。

关键规则：

```env
# Gateway
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=contract_assistant
PG_READONLY_URL=postgresql://jinguan_readonly:<密码>@127.0.0.1:5432/contracts
PG_ORDER_READONLY_URL=postgresql://jinguan_readonly:<密码>@127.0.0.1:5432/contract_assistant

# Parse Service
PG_URL=postgresql://postgres:<密码>@127.0.0.1:5432/contracts
PDF_ROOT=/data/jingxiaoguan/contracts/pdf
MARKDOWN_ROOT=/data/jingxiaoguan/contracts/md-file
```

不得沿用开发环境的 `5433`、`pw`、默认 JWT 密钥或泄漏过的 API Key。

## 7. 当前未完成事项

1. 修复前端 TypeScript 构建错误，`apps/web` 的 `npm run build` 通过后方可发布。
2. 配置 Query Agent、EPMS Sync 的生产环境变量并验证内网模型连通性。
3. 配置 systemd：Gateway、Parse Service、Query Agent 及 EPMS Sync timer（每日 02:30）。
4. 配置独立 Nginx 容器，宿主机映射 `5174`。
5. 重建并验证 59 份已确认合同的 Milvus 向量。
6. 验收：登录、合同/订单台账、原文件、关键词、综合检索、导出、EPMS 同步。
7. 文件夹合同包上传尚未开发：目标为单次一合同包、支持嵌套目录，PDF 合并解析，Word 仅附件保存/下载。

## 8. 回滚原则

- 保留开发机服务，验收通过前不切换正式访问入口。
- 保留初始 dump 与 `/data/jingxiaoguan` 原始文件备份。
- 发布采用 `releases/<版本>` 与 `current` 软链接；回滚仅切回上一发布目录。
- 禁止对 `/data/jingxiaoguan` 执行递归删除或使用不带确认的同步删除参数。
