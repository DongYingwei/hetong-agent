# Issue tracker: GitLab

本仓库使用 **GitLab Issues** 作为 issue/spec 追踪系统。所有操作走 [`glab`](https://gitlab.com/gitlab-org/cli) CLI。

- 仓库 remote：`http://221.178.153.117:62000/weidongying/jingxiaoguan.git`
- `glab` 在 clone 内运行时会自动从 `git remote -v` 推断仓库；首次使用需 `glab auth login --hostname 221.178.153.117:62000`。

## 约定

- **创建 issue**：`glab issue create --title "..." --description "..."`。多行描述用 heredoc；`--description -` 打开编辑器。
- **查看 issue**：`glab issue view <编号> --comments`；机器可读用 `-F json`。
- **列出 issue**：`glab issue list -F json`,配合 `--label` 过滤。
- **评论 issue**：`glab issue note <编号> --message "..."`。GitLab 把评论叫 "note"。
- **打/去标签**：`glab issue update <编号> --label "..."` / `--unlabel "..."`,多标签逗号分隔或重复传参。
- **关闭**:`glab issue close <编号>`。`close` 不接收关闭评论,所以先 `glab issue note <编号> --message "..."` 说明原因,再 close。
- **Merge request(即 PR)**:`glab mr create` / `glab mr view` / `glab mr note` 等,与 `gh pr ...` 同构,`pr`→`mr`、`comment`/`--body`→`note`/`--message`。

相关技能(to-tickets / triage / to-spec / wayfinder 等)读写 issue 时统一走 `glab`,不写本地 markdown。

## MR 作为请求入口

默认**关闭**:外部 MR 不自动进入 triage 队列。如需开启,把下方标记改为 `yes`,`/triage` 会读取此标志。

```json
{ "mrsAsRequestSurface": false }
```

开启后 MR 走与 issue 相同的标签与状态,用 `glab mr` 对应命令(`glab mr view <n> --comments`、`glab mr diff <n>`、`glab mr list -F json`、`glab mr note`/`update --label`/`close`)。GitLab 的 issue 与 MR 分开编号,`#42` 一旦明确指的是哪个面就无歧义。

## 技能说 "发布到 issue tracker" 时

创建一个 GitLab issue。

## 技能说 "拉取相关工单" 时

运行 `glab issue view <编号> --comments`。

## Wayfinding 操作(供 /wayfinder)

**map** 是单个 issue,**child** issue 作为工单。

- **Map**:一个打了 `wayfinder:map` 标签的 issue,承载 Notes / Decisions-so-far / Fog 正文。`glab issue create --label wayfinder:map`。
- **Child 工单**:描述顶部写 `Part of #<map>`,标签 `wayfinder:<type>`(`research`/`prototype`/`grilling`/`task`)。认领后 assign 给推进者。
- **阻塞**:优先用 GitLab 原生 blocking link——`glab issue note <child> --message "/blocked_by #<blocker>"`(Premium/Ultimate 特性);免费档回退为描述顶部 `Blocked by: #<n>, #<n>` 行。所有 blocker 关闭即解除阻塞。
- **前沿查询**:`glab issue list -F json` 限定到 map 的 children,剔除有未关闭 blocker 或已有 assignee 的,按 map 顺序取第一个。
- **认领**:`glab issue update <n> --assignee @me`——本次会话的首个写操作。
- **解决**:`glab issue note <n> --message "<答案>"` → `glab issue close <n>` → 把上下文指针追加到 map 的 Decisions-so-far。
