# 更新记录

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
