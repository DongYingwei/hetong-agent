-- 查询侧只读角色（G1，三道只读防线第③道兜底）。
-- 在【查询库 contracts】里执行（不是网关运营库）。用超管连上后跑一次。
-- 执行后连接串填入 apps/query-agent/.env 的 PG_READONLY_URL。
--
--   psql "postgresql://postgres:pw@localhost:5432/contracts" -f 002_readonly_role.sql
--
-- ⚠️ 把下面的 <READONLY_PASSWORD> 换成你自己的强口令再执行。

-- 1) 建只读登录角色（已存在则跳过）。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jinguan_readonly') THEN
    CREATE ROLE jinguan_readonly LOGIN PASSWORD '<READONLY_PASSWORD>';
  END IF;
END
$$;

-- 2) 库/ schema 连接权限（只读，不给 CREATE）。
GRANT CONNECT ON DATABASE contracts TO jinguan_readonly;
GRANT USAGE ON SCHEMA public TO jinguan_readonly;

-- 3) 现有表：只给 SELECT，杜绝写。
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jinguan_readonly;

-- 4) 未来新建表也自动只读（解析侧后续加表时不用再手动授权）。
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO jinguan_readonly;

-- 5) 明确回收任何写权限（防止 PUBLIC 默认权限漏网）。
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM jinguan_readonly;
