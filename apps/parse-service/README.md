# jinguan-parse — 经小管合同解析模块（Python）

解析侧运行时。与 `jinguan-qa`（查询侧 TS）不同运行时，仅通过共享 **PostgreSQL**（`contracts-db`）与 **Milvus** 耦合。解析侧**写**、查询侧**只读**（坑6 / ADR-0003）。

## 测试接缝（T02，全工作唯一新增）

`process_one_contract(mineru_json, milvus_client, embed_client) -> Chunk[]`
— 解析侧「处理一份合同」的函数边界（§S3 Testing Decisions 的最高稳定测试点）。依赖**接受而非创建**：真实 Milvus/embedding 客户端在 T04 注入；测试注入 fake，断言结构感知切分 + metadata 四字段 + 四模块独立 + 建向量被调用。

## 布局

```
src/jinguan_parse/chunking.py   # 结构感知切分 + 接缝（§7.6.2/§7.6.3）
tests/test_process_one_contract.py
tests/fakes.py                  # 记录式 Milvus / 固定向量 embedding
fixtures/demo_mineru.json       # demo MinerU 段输入
```

## 验证

```bash
cd jinguan-parse && python3 -m pytest tests/ -v
```

## 批量 PDF 转 Markdown（可追溯、可复用）

```bash
cd apps/parse-service
./scripts/batch_pdf_to_markdown.py /path/to/pdfs
```

默认在 PDF 目录创建 `md-pdf/`，并保持原目录内的相对层级；目录中的 `.doc/.docx`
会自动忽略。每个 Markdown 文件名带原 PDF 的 SHA-256 前缀，
`md-pdf/manifest.json` 记录完整的 `pdf_sha256 → markdown_file`、原始相对路径、大小和
转换时间。再次运行会按内容指纹跳过；PDF 改名或从上传临时目录重传也可直接查询：

## 页面上传的原件与 Markdown

页面上传不再只使用临时文件：服务会先把 PDF 写入 `PDF_ROOT/uploads/YYYY/MM/`，再在
`MARKDOWN_ROOT/uploads/YYYY/MM/` 写入或复用同一内容指纹的 Markdown，并同步更新
`MARKDOWN_ROOT/manifest.json`。当前合同缓存目录名为 `data/md-file`，核对完成时，这两条相对路径会转入 `contract_sources`，
用于原文件预览、下载、重解析及向量重建。

生产环境必须在 `.env` 中将 `PDF_ROOT` 和 `MARKDOWN_ROOT` 指向持久数据盘；示例见
`.env.example`。

```bash
python3 scripts/batch_pdf_to_markdown.py \
  --lookup /path/to/new-upload.pdf --output-dir /path/to/pdfs/md-pdf
```

多个 PDF/目录可混合处理；此时请明确输出目录。默认以输入的共同父目录保留层级，
必要时可用 `--source-root` 指定共同根目录：

```bash
./scripts/batch_pdf_to_markdown.py /data/contracts /data/legal/a.pdf \
  --output-dir /data/md-pdf --source-root /data
```

需要重转时加 `--force`。该工具只调用 MinerU、写本地 Markdown/映射，不写数据库、不建向量。

## 尚未做（后续工单）

- 真实 MinerU 调用 + LLM 分组抽取 20 AI 字段 → T03（需 G3 模块锚点清单）
- 核对入正式库 + 真建向量 + 片段同步 → T04（需 G2 端点、G5 同步机制）
- Milvus collection schema / embedding 维度 / 索引类型：实现阶段定
