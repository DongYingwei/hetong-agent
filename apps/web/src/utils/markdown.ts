/**
 * markdown —— 把查询智能体返回的 Markdown content 渲染为安全 HTML。
 *
 * 背景（T11）：真实模型输出是 Markdown（**bold**、`code`、markdown 表格、
 * `<details>查看 SQL</details>` 折叠块），而前端气泡用 v-html 直出 HTML，
 * 所以必须做 markdown→HTML 转换，并对模型输出做 XSS 消毒（提示词注入风险）。
 *
 * 策略：结构化结果（tableData / sql / citations）由 AgentSearchView 单独渲染成
 * 更漂亮的表格 / SQL 折叠块 / 出处列表，因此这里先剥离 content 里重复的
 * `<details>SQL</details>` 块与 markdown 表格，只渲染剩余 prose。
 * 纯函数（剥离逻辑）可测；marked/DOMPurify 组合在浏览器运行时验证。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** 剥离 model 输出的 `<details>查看 SQL</details>` 块（SQL 由 msg.sql 单独渲染）。 */
export function stripSqlDetails(md: string): string {
  return md.replace(/<details[\s\S]*?<\/details>/g, '').trim();
}

/** 剥离 markdown 表格：连续的 `|...|` 行（含表头 / 分隔行 / 数据行）。 */
export function stripMarkdownTable(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? '';
    if (isTableRow(line)) {
      // 跳过整段连续表格行 + 紧随其后的一个空行
      i += 1;
      while (i < lines.length && isTableRow(lines[i] ?? '')) i += 1;
      if (i < lines.length && (lines[i] ?? '').trim() === '') i += 1;
      continue;
    }
    result.push(line);
    i += 1;
  }
  return result.join('\n').trim();
}

/** 通用 Markdown → 安全 HTML（marked 渲染 → DOMPurify 消毒，不做任何剥离）。 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

/** 智能体回复专用：先剥离 SQL 块与表格（结构化结果另渲染），再走通用 markdown 渲染。 */
export function renderAssistantContent(md: string): string {
  if (!md) return '';
  return renderMarkdown(stripMarkdownTable(stripSqlDetails(md)));
}
