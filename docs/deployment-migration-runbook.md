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

## 3. 已完成迁移记录（截至 2026-08-19）

| 项目 | 结果 |
|---|---:|
| 正式合同 `contracts.confirmed=1` | 59 条 |
| 合同来源文件 | 76 条 |
| 合同 PDF | 服务器已有 81 个（保留，不删除） |
| 合同 Markdown | 76 个，`manifest.json` 已存在 |
| 订单台账 `contract_assistant.sys_order` | 9,815 条（审核时间全量补全文件重导后） |
| 订单 AI 四模块分析 | 历史统计 336 条；两个 Qwen JSON 失败订单已用 DeepSeek 定向重试，发布后以 `order_module_hits` 实际计数复核 |
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

### 4.1 应用版本发布与前端服务（内部验收）

标准发布使用新的 `releases/<版本>` 目录，构建成功后才切换 `current` 软链接。当前验收目录可能是一个带 `.git` 的克隆，可用于紧急 `git pull` 修复；常规发布仍不得依赖原地修改。

1. 在目标服务器先验证能够访问 GitLab（私有仓库需要已配置的 Git 凭据）：

   ```bash
   git ls-remote http://221.178.153.117:62000/weidongying/jingxiaoguan.git HEAD
   ```

2. 克隆指定发布版本并安装 Node 依赖。以下示例的版本号应替换成实际 Git 提交号：

   ```bash
   RELEASE_DIR=/opt/jingxiaoguan/releases/20260819-46d84a3b

   git clone --branch master \
     http://221.178.153.117:62000/weidongying/jingxiaoguan.git \
     "$RELEASE_DIR"

   cd "$RELEASE_DIR/apps/gateway" && npm ci
   cd "$RELEASE_DIR/apps/query-agent" && npm ci
   cd "$RELEASE_DIR/apps/web" && npm ci && npm run build
   ```

   `npm run build` 同时执行 `vue-tsc --build`；必须成功才允许发布。Vite 的“大于 500 kB”提示是性能优化警告，不阻断发布。

3. 构建成功后切换版本并重启后端服务：

   ```bash
   ln -sfn /opt/jingxiaoguan/releases/20260819-46d84a3b \
     /opt/jingxiaoguan/current

   sudo systemctl restart \
     jingxiaoguan-gateway \
     jingxiaoguan-parse \
     jingxiaoguan-query-agent

   sudo systemctl --no-pager --full status \
     jingxiaoguan-gateway \
     jingxiaoguan-parse \
     jingxiaoguan-query-agent
   ```

   若版本包含综合检索会话事实摘要（`014_agent_session_memory.sql`），必须在重启 Gateway 前执行一次数据库迁移：

   ```bash
   docker exec -i jingxiaoguan-postgres \
     psql -U postgres -d contract_assistant -v ON_ERROR_STOP=1 \
     < "$RELEASE_DIR/apps/gateway/scripts/migrations/014_agent_session_memory.sql"
   ```

4. `~/jingxiaoguan-infra/compose.yml` 当前只管理 PostgreSQL、Milvus、MinIO 和 etcd，**没有 `web` 服务**。前端以独立容器 `jingxiaoguan-web` 运行；每次切换 `current` 或重建 `dist` 后，按下列命令重建：

   ```bash
   docker rm -f jingxiaoguan-web
   docker run -d \
     --name jingxiaoguan-web \
     --restart unless-stopped \
     -p 5174:5174 \
     --add-host host.docker.internal:host-gateway \
     -v /opt/jingxiaoguan/current/apps/web/dist:/usr/share/nginx/html:ro \
     -v /opt/jingxiaoguan/current/deploy/nginx/jingxiaoguan.conf:/etc/nginx/conf.d/default.conf:ro \
     nginx:1.27-alpine

   curl -I http://127.0.0.1:5174/
   curl -sS -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:5174/api/health
   ```

   Nginx 的配置文件来自 `deploy/nginx/jingxiaoguan.conf`：前端静态文件由 `dist` 提供，`/api/` 转发到宿主机 Gateway 的 `3002` 端口。`proxy_pass` **不得以 `/` 结尾**，否则 Nginx 会剥掉 `/api/`，将 `/api/contract/list` 错误转发为 `/contract/list` 并造成连续 404。未登录时 `/api/health` 可能在 HTTP 200 响应中给出业务体 401，这不是反代失败。

5. 浏览器验收地址为 `http://192.168.101.217:5174`。验收期间保留旧发布目录；失败时只需将 `current` 切回上一版本并依次重启三项 systemd 服务和 `jingxiaoguan-web` 容器。

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

# Query Agent
PG_READONLY_URL=postgresql://jinguan_readonly:<密码>@127.0.0.1:5432/contracts
PG_ORDER_READONLY_URL=postgresql://jinguan_readonly:<密码>@127.0.0.1:5432/contract_assistant

# Parse Service
PG_URL=postgresql://postgres:<密码>@127.0.0.1:5432/contracts
PDF_ROOT=/data/jingxiaoguan/contracts/pdf
MARKDOWN_ROOT=/data/jingxiaoguan/contracts/md-file
```

不得沿用开发环境的 `5433`、`pw`、默认 JWT 密钥或泄漏过的 API Key。密码若含 `@`、`/`、`:`、`#` 等字符，必须 URL 编码；否则 Node `pg` 会报 `Invalid URL`，合同台账为空且综合检索无法执行 SQL。

### 6.1 本次部署的服务配置修复清单

1. `gateway.env` 的 `PG_READONLY_URL`、`query-agent.env` 的 `PG_READONLY_URL` 与 `PG_ORDER_READONLY_URL` 必须使用 `127.0.0.1:5432`。两个 URL 分别对应 `contracts` 与 `contract_assistant`；改完后重启 Gateway 和 Query Agent。
2. Parse Service 是宿主机 systemd 进程，`parse-service.env` 的 `PG_URL` 也必须连接 `127.0.0.1:5432/contracts`；不能使用 Docker Compose 内部服务名 `postgres`。
3. `jingxiaoguan-parse.service` 必须包含：

   ```ini
   Environment=PYTHONPATH=/opt/jingxiaoguan/current/apps/parse-service/src
   ```

   否则会报 `ModuleNotFoundError: No module named 'jinguan_parse'`。若旧服务单元已经安装，可用 `/etc/systemd/system/jingxiaoguan-parse.service.d/pythonpath.conf` 增加同名 `Environment` 覆盖项，随后执行 `systemctl daemon-reload`。
4. 每个新的 Git release 都是干净目录，`node_modules` 不随 Git 进入发布包。因此切换前必须分别在 `apps/gateway`、`apps/query-agent`、`apps/web` 执行 `npm ci`；漏装 Query Agent 的 `tsx` 会使 `8101` 重启循环。
5. 前端请求必须使用同源 `/api`（开发环境由 Vite proxy、生产环境由 Nginx 转发），不得让浏览器直接拼接 `:3002`。

### 6.2 订单全量刷新（已确认允许覆盖时）

订单全量导入会在同一事务中清空并重建 `sys_order`、`order_module_hits`、`order_manual_overrides` 与 `contract_order_links`。因此导入前必须备份运营库，并明确告知用户：订单人工编辑和订单—合同关联会被清除；合同库、合同原文件和合同向量不受影响。

推荐顺序：

1. `pg_dump -Fc contract_assistant` 保存带时间戳的备份。
2. 使用服务器的全量 Excel 与 `ai_keyword_results.json` 调用 `scripts/import_order_ledger.py`，数据库地址使用 URL 编码后密码的 `127.0.0.1:5432` 连接串。
3. 设置 `MD_DIR=/data/jingxiaoguan/epms/md-epms`，后台运行 `scripts/analyze_order_ai_modules.py`，重新写入 AI 订单四模块。
4. 校验 `sys_order` 总数、`tag_ai=1` 数量与 `order_module_hits` 的不同订单数。模型 JSON 反复失败的订单，可仅携带 `--order-no` 并改用 DeepSeek 进行定向重试。

### 6.3 订单编辑从旧覆盖层切换为主表

部署“订单直接更新”版本前，执行一次迁移，把旧 `order_manual_overrides` 中已保存的人工值写回 `sys_order`，然后清空覆盖层：

```bash
docker exec -i jingxiaoguan-postgres \
  psql -U postgres -d contract_assistant -v ON_ERROR_STOP=1 \
  < /opt/jingxiaoguan/current/apps/gateway/scripts/migrations/015_materialize_order_manual_overrides.sql
```

此后订单列表、详情、综合检索、统计和导出都以 `sys_order` 的最新值为准。全量 Excel 重导仍会覆盖订单主表，重导前需要按 6.2 备份。

## 7. 当前验收前事项

1. 按 4.1 重建 `jingxiaoguan-web` Nginx 容器，确认 `5174` 能访问前端且 `/api/health` 经反代成功。
2. 核验 59 份已确认合同的 Milvus 向量，并完成登录、合同/订单台账、多个原文件切换预览、关键词、综合检索、导出和 EPMS 同步验收。
3. 确认 `jingxiaoguan-epms-sync.timer` 已启用且 `epms-sync.env` 中的 `MD_DIR` 为服务器路径 `/data/jingxiaoguan/epms/md-epms`，不能保留开发机路径。
4. 合同上传现已支持一次选择多个文件作为同一合同包；暂不支持浏览器直接上传文件夹或嵌套目录。当前上传仅保存、预览和下载附件，不自动解析或合并为合同草稿。

## 8. 回滚原则

- 保留开发机服务，验收通过前不切换正式访问入口。
- 保留初始 dump 与 `/data/jingxiaoguan` 原始文件备份。
- 发布采用 `releases/<版本>` 与 `current` 软链接；回滚仅切回上一发布目录。
- 禁止对 `/data/jingxiaoguan` 执行递归删除或使用不带确认的同步删除参数。
