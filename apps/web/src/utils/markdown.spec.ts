import { describe, expect, it } from 'vitest';
import { stripMarkdownTable, stripSqlDetails } from './markdown';

describe('stripSqlDetails', () => {
  it('剥离 <details>SQL</details> 折叠块', () => {
    const md = '前面有结论。\n\n<details><summary>查看 SQL</summary>\n\n```sql\nSELECT 1\n```\n</details>\n\n后面还有话。';
    const result = stripSqlDetails(md);
    expect(result).not.toContain('<details>');
    expect(result).not.toContain('SELECT 1');
    expect(result).toContain('前面有结论');
    expect(result).toContain('后面还有话');
  });

  it('无 details 块时原样返回（去首尾空白）', () => {
    expect(stripSqlDetails('  \n纯文本。\n  ')).toBe('纯文本。');
  });
});

describe('stripMarkdownTable', () => {
  it('剥离整段连续表格行，保留前后 prose', () => {
    const md = '结论如下：\n\n| 合同号 | 金额 |\n| --- | --- |\n| HT-1 | 100 |\n| HT-2 | 200 |\n\n以上共 2 条。';
    const result = stripMarkdownTable(md);
    expect(result).toContain('结论如下');
    expect(result).toContain('以上共 2 条');
    expect(result).not.toContain('| 合同号');
    expect(result).not.toContain('| HT-1');
  });

  it('不含表格时不误删 prose 里的竖线文字', () => {
    const md = '含竖线的普通句：a | b 不是表格行（行尾无竖线）。';
    expect(stripMarkdownTable(md)).toBe(md);
  });
});
