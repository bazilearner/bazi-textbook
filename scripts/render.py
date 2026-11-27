#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown → PDF（一条命令出稿）

为什么要有这个脚本：以前出 PDF 得在报告脚本里**手写一段 reportlab**——每次开新报告都要重抄一遍
`register_fonts / styles / make_doc / table / NextPageTemplate / PageBreak`，还要自己算列宽、
自己记「`<font color>` 要带 #」「Frame 内边距要清零」「表格字段数要等于列数」这些坑。
于是「出 PDF」成了整条流水线里最容易卡住、也最容易被跳过的一步：内容写完了，PDF 没出来。

现在改成「**写 Markdown，跑一条命令**」：

    python3 scripts/render.py 报告.md -o 报告.pdf --title "八字推演" --subtitle "男命 · 1981"

支持的写法（够写完整报告，不需要学新语法）：

| 写法 | 效果 |
|---|---|
| `---` 开头的三行块（`title:` / `subtitle:` / `meta:`） | 封面信息（也可用命令行参数给） |
| `## 标题` | 章（**另起一页**） |
| `### 标题` / `#### 标题` | 节 / 小节 |
| `| a | b |` 连续多行 | 表格（首行为表头；`|---|` 分隔行自动跳过；列宽按内容自动分配） |
| `- 条目` / `1. 条目` | 列表 |
| `> 引文` | 引文块（经典原文用这个） |
| `[分页]` 或 `<!-- pagebreak -->` | 强制分页 |
| `![说明](路径)` | 插图（按版心宽度等比缩放） |
| `**加粗**`、`<b>`、`<font color="#a32d2d">` | 富文本（与 pdfkit 同一套 `rich()`） |

排版、字体、表格宽度、页眉页脚、缺字形净化**全部由 `pdfkit` 负责**——这里不重复实现任何一条，
这是刻意的：净化只有一处实现，才不会出现「报告脚本各写一份、各漏一半」。
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import pdfkit  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image, NextPageTemplate, PageBreak, Paragraph, Spacer,
)
from reportlab.platypus.flowables import HRFlowable  # noqa: E402

CJK = re.compile(r"[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]")
CODE = re.compile(r"`([^`]+)`")


def inline(t):
    """去掉行内代码的反引号：`` `render.py` `` → render.py。

    报告里的命令、文件名、脚本名几乎都写成行内代码；reportlab 不认反引号，
    不剥掉就会原样印出「`teaching-flow.md`」——读者以为那是排版错误。
    """
    return CODE.sub(r"\1", t)


def disp_width(s):
    """估算显示宽度：中日韩全角算 2，其余算 1（只用于分配列宽，不用于排版）。"""
    return sum(2 if CJK.match(ch) else 1 for ch in s)


def parse_front_matter(text):
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end > 0:
            for line in text[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip().lower()] = v.strip()
            text = text[end + 4:]
    return meta, text.lstrip("\n")


def is_table_row(line):
    return line.lstrip().startswith("|") and line.rstrip().endswith("|")


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def is_sep_row(cells):
    return all(re.fullmatch(r":?-{2,}:?", c.replace(" ", "")) for c in cells) and cells


def table_flowable(block):
    rows = []
    for line in block:
        cells = split_row(line)
        if is_sep_row(cells):
            continue
        rows.append(cells)
    if not rows:
        return None
    ncol = max(len(r) for r in rows)
    rows = [r + [""] * (ncol - len(r)) for r in rows]     # 短行补空，避免列数不一致直接抛错

    S = pdfkit.styles()
    # 列宽：按每列最长内容的显示宽度分配，夹在 [4, 28] 之间，避免某列吃满整行
    # 列宽：按最长内容的显示宽度取 0.62 次幂——线性分配会让「一句话的列」和「三个字的列」
    # 差出十倍（前者被压成竖排单字）；纯均分又会让短列白占地方。幂次是折中：
    # 长列拿得多、但不至于吃掉整行。下限 34pt（约两个字宽＋内边距）。
    weights = []
    for c in range(ncol):
        w = max([disp_width(r[c]) for r in rows] + [6])
        weights.append(max(w, 6) ** 0.62)
    total = sum(weights)
    widths = [max(34.0, pdfkit.CONTENT_W * w / total) for w in weights]
    k = pdfkit.CONTENT_W / sum(widths)
    if k < 1:                                              # 窄列保底后可能超宽，统一收
        widths = [w * k for w in widths]

    data = []
    for i, r in enumerate(rows):
        st = S["th"] if i == 0 else S["td"]
        data.append([Paragraph(pdfkit.rich(inline(c)), st) for c in r])
    return pdfkit.table(data, widths, head=True)


def build_story(md, meta, args):
    S = pdfkit.styles()
    story = []

    # ── 封面 ──
    title = args.title or meta.get("title") or "八字推演报告"
    subtitle = args.subtitle or meta.get("subtitle", "")
    story.append(Spacer(1, 45 * mm))
    story.append(Paragraph(pdfkit.rich(inline(title)), S["cover_t"]))
    if subtitle:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph(pdfkit.rich(inline(subtitle)), S["cover_s"]))
    story.append(Spacer(1, 8 * mm))
    for line in (meta.get("meta", "").split("；") if meta.get("meta") else []):
        if line.strip():
            story.append(Paragraph(pdfkit.rich(inline(line.strip())), S["cover_m"]))
    if args.note:
        story.append(Spacer(1, 18 * mm))
        story.append(Paragraph(pdfkit.rich(inline(args.note)), S["cover_m"]))
    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    # ── 正文 ──
    lines = md.splitlines()
    i, first_h1 = 0, True
    para_buf = []

    def flush_para():
        if para_buf:
            txt = "".join(para_buf).strip()
            if txt:
                story.append(Paragraph(pdfkit.rich(inline(txt)), S["p"]))
            para_buf.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()

        if not s:
            flush_para()
            i += 1
            continue

        # 分页
        if s in ("[分页]", "<!-- pagebreak -->", "\\pagebreak"):
            flush_para()
            story.append(PageBreak())
            i += 1
            continue

        # 水平线
        if re.fullmatch(r"(-{3,}|\*{3,})", s):
            flush_para()
            story.append(HRFlowable(width="100%", thickness=0.7, color=pdfkit.LINE,
                                    spaceBefore=4, spaceAfter=8))
            i += 1
            continue

        # 标题
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            flush_para()
            level, text = len(m.group(1)), m.group(2).strip()
            if level == 1:
                story.append(Paragraph(pdfkit.rich(inline(text)), S["h1"]))
            elif level == 2:
                if not first_h1:
                    story.append(PageBreak())
                first_h1 = False
                story.append(Paragraph(pdfkit.rich(inline(text)), S["h1"]))
            elif level == 3:
                story.append(Paragraph(pdfkit.rich(inline(text)), S["h2"]))
            else:
                story.append(Paragraph(pdfkit.rich(inline(text)), S["h3"]))
            i += 1
            continue

        # 表格
        if is_table_row(line):
            flush_para()
            block = []
            while i < len(lines) and is_table_row(lines[i]):
                block.append(lines[i])
                i += 1
            flow = table_flowable(block)
            if flow is not None:
                story.append(flow)
                story.append(Spacer(1, 3 * mm))
            continue

        # 图片
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)", s)
        if m:
            flush_para()
            path = m.group(2)
            if not os.path.isabs(path):
                path = os.path.join(args.base_dir, path)
            if os.path.exists(path):
                from reportlab.lib.utils import ImageReader
                iw, ih = ImageReader(path).getSize()
                w = min(pdfkit.CONTENT_W * 0.92, iw)
                story.append(Image(path, width=w, height=ih * w / iw))
                story.append(Spacer(1, 2 * mm))
                if m.group(1):
                    story.append(Paragraph(pdfkit.rich(m.group(1)), S["cite"]))
            else:
                print("[render] 找不到图片：%s（已跳过）" % path, file=sys.stderr)
            i += 1
            continue

        # 引文
        if s.startswith(">"):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            story.append(Paragraph(pdfkit.rich(inline("".join(buf))), S["quote"]))
            continue

        # 列表
        m = re.match(r"^([-*])\s+(.*)$", s)
        if m:
            flush_para()
            story.append(Paragraph(pdfkit.rich(inline(m.group(2))), S["li"], bulletText="•"))
            i += 1
            continue
        m = re.match(r"^(\d+[.、])\s+(.*)$", s)
        if m:
            flush_para()
            story.append(Paragraph(pdfkit.rich(inline(m.group(2))), S["li"], bulletText=m.group(1)))
            i += 1
            continue

        # 代码块：原样进「引文」样式（报告里偶有命令行，不排成等宽，免得中英混排难看）
        if s.startswith("```"):
            flush_para()
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                story.append(Paragraph(pdfkit.rich(inline(lines[i].rstrip())), S["cite"]))
                i += 1
            i += 1
            continue

        # 普通段落（连续行合并）
        para_buf.append(s)
        i += 1

    flush_para()
    return story


def main():
    ap = argparse.ArgumentParser(description="Markdown → 中文 PDF（基于 scripts/pdfkit.py）")
    ap.add_argument("md", help="输入 Markdown 文件")
    ap.add_argument("-o", "--out", default=None, help="输出 PDF（缺省与输入同名）")
    ap.add_argument("--title", default=None)
    ap.add_argument("--subtitle", default=None)
    ap.add_argument("--footer-left", default="")
    ap.add_argument("--footer-right", default="")
    ap.add_argument("--note", default="本报告为传统命理文化研究与推演，不构成任何决策、医疗或投资建议。")
    ap.add_argument("--charset-check", action="store_true",
                    help="出稿前另跑一次 checkup.py --glyphs（缺字形预检）")
    args = ap.parse_args()

    path = args.md
    if not os.path.exists(path):
        print("找不到文件：%s" % path, file=sys.stderr)
        sys.exit(2)
    args.base_dir = os.path.dirname(os.path.abspath(path))
    out = args.out or (os.path.splitext(path)[0] + ".pdf")

    raw = open(path, encoding="utf-8").read()
    meta, body = parse_front_matter(raw)

    if args.charset_check:
        try:
            import subprocess
            subprocess.run([sys.executable, os.path.join(HERE, "checkup.py"), path, "--glyphs"], check=False)
        except Exception as e:
            print("[render] 字形预检跳过：%s" % e, file=sys.stderr)

    pdfkit.register_fonts()
    doc, _ = pdfkit.make_doc(out, args.title or meta.get("title") or "八字推演报告",
                             subtitle=args.subtitle or meta.get("subtitle", ""),
                             footer_left=args.footer_left, footer_right=args.footer_right)
    story = build_story(body, meta, args)
    doc.build(story)

    # 出稿后自报页数（深度体检要看的就是这个数）
    pages = "?"
    try:
        import pypdf
        pages = len(pypdf.PdfReader(out).pages)
    except Exception:
        pass
    print("✓ 已生成 %s（%s 页）" % (out, pages))
    print("  下一步：python3 scripts/depthcheck.py \"%s\"    # 教学式必跑，量够不够厚" % out)


if __name__ == "__main__":
    main()
