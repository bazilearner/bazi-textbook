# 更新记录

## v1.5.3 — 外部依赖缺失时不再崩

- `checkup.py`：缺 `pdftoppm` / `pdfinfo`（poppler-utils）时**降级跳过并明确说明**，
  不再抛 `FileNotFoundError` 栈；结论行改为「像素体检未执行」，**不会假装通过**
- `checkup.py`：`pdfinfo` 缺失时改用 `pypdf` 数页数
- `requirements.txt`：去掉已无用途的 `requests`（原为已移除的 `mail.py` 使用），
  并注明 poppler 是可选系统依赖
- 背景：市场/沙箱环境通常不预装 poppler，原先会让「出稿前体检」这一步直接报错中断

## v1.5.2 — 移除邮件投递

- 移除 `scripts/mail.py`（邮件投递）。该功能依赖调用方本机已配置的邮件连接器，
  连接器名称、收件人字段格式、附件字段要求在不同环境并不一致，公开版无法开箱可用，
  且涉及代发邮件这类对外动作，不适合随技能分发
- 同步清除相关引用：`SKILL.md` 的「发邮件」小节、误发表中的 8 条邮件条目、脚本索引行；
  `README.md` 目录树；`references/report-blueprint.md` 的交付说明
- 交付方式收敛为「生成 PDF，由使用者自行决定如何发送」，技能本身不触碰任何外部发信渠道

## v1.5.1 — 展示与适配

- 新增 `docs/preview-*.png`：由技能自带 `pdfkit.py` 实际渲染的报告页，数值取自 `wangshuai.js` 输出
- README 首屏加报告预览图与英文摘要，海外读者不必翻到文末
- 安装说明补齐 DeepSeek Harness（dsh）：技能目录 `~/.dsh/skills/`，同一套 `SKILL.md` 约定，无需改文件
- 补充 dsh 的玲珑包 node 不在 PATH 时的 `NODE_PATH` 写法
- 修正 README 安装命令中的用户名占位符

## v1.5.0 — 首个公开发布版

- 新增 `references/classics-index.md`：重点典籍导读（十部书的成书、体系定位、必用篇目、判据→出处速查、版本分歧、阅读路径）
- 新增 `README.md` / `LICENSE`（MIT）/ `.gitignore` / `package.json` / `requirements.txt`
- 新增 `examples/`：虚构命例的示例输出与可直接复制的提示词
- `classics-citations.md` 的出处说明改为按版本著录，去掉对任何私有知识库的依赖
- 清理构建缓存；公开版不含任何真实命主数据

## v1.4.x — 内部迭代

- 补齐五步推导链所需的四个脚本：`detail.js`（盘面明细）、`wangshuai.js`（定旺衰）、`geju.js`（辨格局）、`suiyun.js`（断岁运）
- 新增 `teaching-flow.md`（教学式五步推导链）与 `detail-style.md`（细致式颗粒度）
- 确立「数字归脚本，判读归文案」与「四门并参」两条主线
- 已知坑清单成型：漏传性别导致大运反向、晚子时把时柱带错、旺衰重复计数等
