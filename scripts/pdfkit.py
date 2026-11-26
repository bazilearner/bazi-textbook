#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中文富排版 PDF 工具（基于 reportlab）。被 gen_report 类脚本 import 使用。

要点：
  1) 不要用 weasyprint（UOS/aarch64 上常因 pango 版本错配报错：undefined symbol: pango_font_get_hb_font）。
     fpdf2 可作纯文本长文的备选，但表格排版远不如 reportlab。
  2) 中文字体直接注册系统 TTF，字号/行距按 CJK 调；所有段落的 wordWrap="CJK"。
  3) 颜色号拼进 <font color=...> 必须带 # 前缀，否则 reportlab 会报错。
  4) 用 Canvas 方法时注意是 drawString（不是 text）。
  5) **表格有两道硬检查**（`table()` 内建）—— 这两类错误都会让内容「静默跑到纸外」：
     肉眼、pypdf 文字层、缺字形检查**全都查不出来**，只有渲染成图、数墨迹像素才看得见：
       · 某行字段数 ≠ 声明列数 → reportlab **自动补列**，多出的列被画到纸张之外（内容直接丢失）
       · 列宽合计 > 可排版宽度 → 整表右移溢出，末尾列被纸边裁掉
     另注意：Frame 默认带 6pt 内边距，若不清零，真实可用宽度只有 481.89-12=469.89pt。
     `make_doc()` 已把内边距清零，故 **CONTENT_W ≈ 481.89pt 就是真实上限**。
"""
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

# 字体候选：跨平台。每项为 (路径, ttc子字体序号)。ttf 用 0，ttc 需指定序号。
# Linux(UOS)：GB18030 系列；Windows：simsun/simhei/仿宋/楷体；macOS：Songti/PingFang。
FONT_CANDIDATES = {
    "song": [
        ("/usr/share/fonts/fonts-gb/GB_ST_GB18030.ttf", 0),
        ("/usr/share/fonts/truetype/arphic/uming.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", 0),
        (r"C:\Windows\Fonts\simsun.ttc", 0),          # 宋体
        (r"C:\Windows\Fonts\simfang.ttf", 0),         # 仿宋
        (r"C:\Windows\Fonts\simkai.ttf", 0),          # 楷体
        ("/System/Library/Fonts/Supplemental/Songti.ttc", 0),
        ("/System/Library/Fonts/STHeiti Light.ttc", 0),
    ],
    "hei": [
        ("/usr/share/fonts/fonts-gb/GB_HT_GB18030.ttf", 0),
        ("/usr/share/fonts/truetype/arphic/ukai.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
        (r"C:\Windows\Fonts\simhei.ttf", 0),          # 黑体
        (r"C:\Windows\Fonts\msyh.ttc", 0),            # 微软雅黑
        (r"C:\Windows\Fonts\Deng.ttf", 0),            # 等线
        ("/System/Library/Fonts/PingFang.ttc", 0),
    ],
}


def register_fonts():
    ok = {}
    for name, paths in FONT_CANDIDATES.items():
        for p, idx in paths:
            if os.path.exists(p):
                try:
                    pdfmetrics.registerFont(TTFont(name, p, subfontIndex=idx))
                    ok[name] = p
                    break
                except Exception:
                    continue
        if name not in ok:                       # 兜底：最后一个候选强制注册
            p, idx = paths[-1]
            pdfmetrics.registerFont(TTFont(name, p, subfontIndex=idx))
    try:
        pdfmetrics.registerFontFamily("song", normal="song", bold="hei",
                                      italic="song", boldItalic="hei")
    except Exception:
        pass
    return ok


# 可排版宽度：A4 竖版、左右各 20mm。前提是 Frame 内边距为 0（见 make_doc）。
# reportlab 的 Frame 默认 left/rightPadding=6，若不清零，真实可用宽度只有 469.89pt，
# 于是「按 481.9 声明列宽」的表格会整表右移、末尾列被纸边裁掉 —— 实测踩过的坑。
CONTENT_W = A4[0] - 40 * mm          # ≈ 481.89pt
WRAP_SLACK = 8                       # 正文右侧余量，用于吃掉 CJK 断行的溢出误差（见 styles()）

# 已知**字体缺字形**的字符 → 替换字符。
# reportlab 遇到缺字形是**静默丢弃**：字没了，但文件不报错、文字层也抽不出来，
# 所以「生成后抽查」永远抓不到，必须【渲染前】净化。各报告曾各改一遍，现统一在此。
# 新增时用 `checkup.py <源文本> --glyphs` 核真实字体 cmap，不要凭猜。
# （该开关吃的是**纯文本**不是 PDF —— 缺字形只有渲染前才抓得到。）
#
# 下表用 `checkup.py --glyphs` 对**真实字体 cmap 逐字探测**得出（歌/黑两体，任一有即可）；
# 判定依据不是「看起来像不像特殊符号」，而是 cmap 里到底有没有那个码位。实测结论：
#   有：→ ← ↑ ↓ ↗ ↘ ∈ ≤ ≥ ≠ ≈ ± × ÷ ∞ ∑ ∏ √ ∝ ∴ ∵ ⊥ ∥ ∠ △ ▲ ■ □ ● ○ ◆ ◇ ★ ☆
#   缺：↔ ⇔ ⇒ ⇐ ∉ ⊂ ⊆ − ∗ ≫ ⚠ ✓ ✔ ✗ ✘ ❌ 🚫 · 变体选择符 U+FE0F
GLYPH_FIX = {
    # ── 数学/箭头 ──────────────────────────────────────────────────────
    "\u2212": "-",        # − 减号（易与连字符混，实测缺）
    "\u2217": "*",        # ∗ 星号运算符
    "\u226b": ">>",       # ≫ 远大于
    "\u21d2": "\u2192",   # ⇒ 换成 →（→ 在 cmap 里，实有）
    "\u21d0": "\u2190",   # ⇐ 换成 ←
    "\u2194": "\u2190\u2192",   # ↔ 双向箭头 → 两个单箭头拼
    "\u21d4": "\u2190\u2192",   # ⇔ 等价箭头 → 同上（勿写「等价于」，会改字数）
    "\u2209": "\u4e0d\u2208",   # ∉ → 「不∈」（∈ 实有，可安全拼）
    "\u2282": "\u5305\u542b\u4e8e",     # ⊂ → 包含于
    "\u2286": "\u5305\u542b\u4e8e",     # ⊆ → 包含于
    # ── 勾叉/表情（文档表格里常见，粘进正文就会整字消失）──────────────
    "\u26a0": "[!]",      # ⚠ 警示符（rich() 再渲染成带色的「[注意]」）
    "\ufe0f": "",         # 变体选择符：⚠️ 由 ⚠+FE0F 组成，净化 ⚠ 后会剩下它，必须一并清掉
    "\u2713": "\u221a",   # ✓ → √
    "\u2714": "\u221a",   # ✔ → √
    "\u2717": "\u00d7",   # ✗ → ×
    "\u2718": "\u00d7",   # ✘ → ×
    "\u274c": "\u00d7",   # ❌ → ×
    "\u2705": "\u221a",   # ✅ → √
    "\U0001f6ab": "[\u7981]",   # 🚫 → [禁]
}


def sanitize(t):
    """净化缺字形字符（所有进 reportlab 的文本都应先过这一道）"""
    t = str(t)
    for k, v in GLYPH_FIX.items():
        t = t.replace(k, v)
    return t


# ======================================================================
# 富文本标记转换（Markdown 粗体 + 少量 HTML 标签的**混写**）
# ======================================================================
# 只放行这几个标签；其余裸 < > 一律转义，免得 reportlab 把标签当字面文本印出来。
# 用 re.I（**大小写不敏感**）是有意的：手写内容里出现过 `<B>` 大小写笔误，
# 若不认它，会出现「<B> 被转义成 &lt;B&gt; 而 </b> 仍是真标签」的**半边标签**，
# reportlab 直接抛 `Parse error: saw </b> instead of expected </para>` 中断出稿。
# 认下它，最坏只是「笔误当标签用」，不会让整份报告出不来。
_TAG_RE = re.compile(r"</?(?:b|br|i|u|font)\b[^>]*>", re.I)
# 警示符：脚本里写 ⚠，经 sanitize() 降级为 ASCII 的 [!]；此处再还原为「看得见的标记」。
_WARN_RE = re.compile(r"(?:\[!\]|⚠)\s*")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.S)


def _esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rich(t):
    """文本 → reportlab 能吃的 HTML（Markdown 粗体 / HTML 标签 **可混写**）。

    ⚠ 为什么不能写成「含标签就整段原样、否则转粗体」：
      报告里的段落大量是**混写**的，例如
          `**结果**：用神 <b>甲（阳木·正印）</b>`
      Markdown 粗体与 HTML 粗体出现在同一句里。若「见到 <b> 就整段跳过转换」，
      Markdown 那一半会漏转，`**` 被当字面星号印到纸上（本项目实测漏印 22 处，
      而缺字形预检、表格两道检查、像素体检**全都查不出来**——它不难看，
      只是把标记当正文印了）。

    实现按五步走，各司其职，故混写也不漏：
      ① 白名单标签先「寄存」（换成 \\x00n\\x01 占位，免得被 ④ 转义）
      ② 警示符 → 带色加粗标记
      ③ Markdown `**x**` → `<b>x</b>`（先转义内部文本，再寄存）
      ④ 剩下的裸 `&` `<` `>` 一律转义
      ⑤ 还原寄存的标签
    """
    t = sanitize(t)
    keep = []

    def stash(html):
        keep.append(html)
        return "\x00%d\x01" % (len(keep) - 1)

    t = _TAG_RE.sub(lambda m: stash(m.group(0)), t)                      # ①
    t = _WARN_RE.sub(                                                    # ②
        lambda m: stash('<font color="#a8681a"><b>[注意]</b></font> '), t)
    t = _BOLD_RE.sub(                                                    # ③
        lambda m: stash("<b>%s</b>" % _esc(m.group(1))), t)
    t = _esc(t)                                                          # ④
    t = re.sub(r"\x00(\d+)\x01", lambda m: keep[int(m.group(1))], t)     # ⑤
    # ⑥ 兜底：走到这里还有 `**`，说明源文本的 `**` **本身就不配对**
    #    （常见成因：用正则从脚本输出里「抓一段」时，把相邻的 `**` 也一并抓了进来，
    #      于是整段配对全部错位）。`**` 是标记、不是内容，留着必然印到纸上，故直接丢弃。
    #    实测：一处抓错就让整段粗体错位、并留下一个孤零零的 `**`。
    return t.replace("**", "")

INK = colors.HexColor("#1a1a1a")
INK2 = colors.HexColor("#4a4a4a")
INK3 = colors.HexColor("#808080")
NAVY = colors.HexColor("#14395e")
LINE = colors.HexColor("#d8d5cc")
SOFT = colors.HexColor("#f4f2ec")
ACC = colors.HexColor("#a8681a")
RED = colors.HexColor("#a32d2d")


def styles():
    S = {}
    S["h1"] = ParagraphStyle("h1", fontName="hei", fontSize=19, leading=27, textColor=NAVY, spaceAfter=12)
    S["h2"] = ParagraphStyle("h2", fontName="hei", fontSize=14, leading=21, textColor=NAVY,
                             spaceBefore=14, spaceAfter=8)
    S["h3"] = ParagraphStyle("h3", fontName="hei", fontSize=11.8, leading=18, textColor=INK,
                             spaceBefore=10, spaceAfter=5)
    S["p"] = ParagraphStyle("p", fontName="song", fontSize=10.2, leading=17.6, textColor=INK,
                            alignment=TA_JUSTIFY, spaceAfter=5, wordWrap="CJK")
    S["lead"] = ParagraphStyle("lead", fontName="song", fontSize=10.2, leading=17.6, textColor=INK2,
                               leftIndent=8, wordWrap="CJK", spaceAfter=8)
    S["li"] = ParagraphStyle("li", fontName="song", fontSize=10.2, leading=17.6, textColor=INK,
                             leftIndent=14, bulletIndent=2, wordWrap="CJK", spaceAfter=3)
    S["quote"] = ParagraphStyle("quote", fontName="song", fontSize=9.8, leading=16.5, textColor=INK2,
                                leftIndent=12, rightIndent=6, wordWrap="CJK", spaceAfter=6)
    S["cite"] = ParagraphStyle("cite", fontName="song", fontSize=8.8, leading=14, textColor=INK3,
                               leftIndent=12, wordWrap="CJK", spaceAfter=8)
    S["th"] = ParagraphStyle("th", fontName="hei", fontSize=9.2, leading=13, textColor=INK, wordWrap="CJK")
    S["td"] = ParagraphStyle("td", fontName="song", fontSize=9.2, leading=14, textColor=INK2, wordWrap="CJK",
                             alignment=TA_JUSTIFY)
    S["cover_t"] = ParagraphStyle("ct", fontName="hei", fontSize=26, leading=38, textColor=INK,
                                  alignment=TA_CENTER, wordWrap="CJK")
    S["cover_s"] = ParagraphStyle("cs", fontName="song", fontSize=11.5, leading=19, textColor=INK2,
                                  alignment=TA_CENTER, wordWrap="CJK")
    S["cover_m"] = ParagraphStyle("cm", fontName="song", fontSize=9.6, leading=16, textColor=INK2,
                                  alignment=TA_CENTER, wordWrap="CJK")
    # reportlab 的 CJK 断行会多算约 0.4 个字（10.2pt 字号实测溢出 ≈3.9pt），
    # 使末行右侧越过版心、压到页边距甚至纸外。与加粗／对齐方式无关，是断行算法本身的误差。
    # 处理：① 正文类样式统一留出右侧余量（实测 8pt 足够）；
    #       ② 表格单元格 **不加**余量 —— 单元格本就有 6pt 内边距，实测足以吸收该误差，
    #          否则窄列（如「年柱」占 34pt）会被挤到换行；
    #       ③ 封面居中样式也不加，避免视觉偏心。
    for k, st in S.items():
        if k.startswith("cover") or k in ("th", "td"):
            continue
        if st.rightIndent < WRAP_SLACK:
            st.rightIndent = WRAP_SLACK
    return S


def make_doc(out_path, title, subtitle="", footer_left="", footer_right=""):
    """返回 (doc, story)。用 doc.build(story) 收尾。"""
    doc = BaseDocTemplate(out_path, pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=22 * mm, bottomMargin=18 * mm,
                          title=title, author="WorkBuddy")
    # 内边距显式清零：默认 6pt 会让真实可用宽度比 CONTENT_W 少 12pt，
    # 导致「按 CONTENT_W 声明列宽」的表格溢出纸外。
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="n",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    def on_cover(canv, d):
        canv.saveState()
        canv.setFillColor(NAVY)
        canv.rect(0, A4[1] - 26 * mm, A4[0], 26 * mm, stroke=0, fill=1)
        canv.setFillColor(colors.white)
        canv.setFont("hei", 13)
        canv.drawString(20 * mm, A4[1] - 17 * mm, title[:34])
        canv.restoreState()

    def on_body(canv, d):
        canv.saveState()
        canv.setStrokeColor(LINE)
        canv.setLineWidth(0.6)
        canv.line(doc.leftMargin, A4[1] - 16 * mm, A4[0] - doc.rightMargin, A4[1] - 16 * mm)
        canv.setFont("song", 8)
        canv.setFillColor(INK3)
        canv.drawRightString(A4[0] - doc.rightMargin, A4[1] - 14 * mm, footer_left)
        canv.drawString(doc.leftMargin, 11 * mm, footer_right)
        canv.drawRightString(A4[0] - doc.rightMargin, 11 * mm, "第 %d 页" % canv.getPageNumber())
        canv.restoreState()

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=on_cover),
        PageTemplate(id="body", frames=[frame], onPage=on_body),
    ])
    return doc, []


def _warn(msg):
    """跨平台安全输出（Windows GBK 控制台直接 print 中文会抛 UnicodeEncodeError）。"""
    try:
        print(msg, file=sys.stderr)
    except Exception:
        pass


def fit_widths(widths, rows):
    """两道硬检查：① 每行字段数必须等于声明列数；② 合计宽必须 ≤ CONTENT_W。

    ① 不通过 → 直接抛错（这是内容错误，必须改数据）。
       原因：reportlab 遇到字段数多于列数的行会**自动补列**，多出的列被画到纸张之外，
       内容静默丢失 —— pypdf 文字层、缺字形检查、肉眼抽查都发现不了。
    ② 不通过 → 按比例收窄并告警（这是排版问题，可安全自动修正）。
    """
    n = len(widths)
    if not n:
        raise ValueError("colWidths 为空")
    bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != n]
    if bad:
        head = " | ".join(str(c)[:16] for c in rows[0])
        raise ValueError(
            "表格列数不一致：声明 %d 列，但第 %s 行的字段数是 %s（应为 %d）。\n"
            "  reportlab 会自动补列并把多出的列画到纸张之外 —— 内容静默丢失。\n"
            "  首行：%s\n  请补齐表头字段，或删掉数据行里多余的字段。"
            % (n, "、".join(str(i) for i, _ in bad[:6]),
               "、".join(str(k) for _, k in bad[:6]), n, head))
    tot = sum(widths)
    if tot > CONTENT_W + 0.01:
        k = CONTENT_W / tot
        new = [round(w * k, 2) for w in widths]
        _warn("[pdfkit] 列宽合计 %.1fpt 超可排版宽度 %.1fpt，已按比例收窄 %s → %s"
              % (tot, CONTENT_W, [round(w, 1) for w in widths], new))
        return new
    return list(widths)


def table(rows, widths, head=True, align_center_cols=()):
    """rows: [[str|Paragraph, ...], ...]；内建列数一致性与总宽检查。"""
    widths = fit_widths(list(widths), rows)
    data = []
    for r_i, r in enumerate(rows):
        data.append([c if hasattr(c, "wrap") else Paragraph(str(c), styles()["th" if (head and r_i == 0) else "td"])
                     for c in r])
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0, hAlign="LEFT")
    cmds = [
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    if head:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), SOFT),
                 ("LINEBELOW", (0, 0), (-1, 0), 0.8, NAVY)]
    for c in align_center_cols:
        cmds.append(("ALIGN", (c, 0), (c, -1), "CENTER"))
    t.setStyle(TableStyle(cmds))
    return t


def kv_box(title, pairs, width):
    """一个浅底小面板，用于关键结论（宽度自动夹到可排版宽度内）"""
    width = min(width, CONTENT_W)
    rows = [[Paragraph("<font name='hei' size=10 color='#14395e'>%s</font>" % title, styles()["td"])]]
    for k, v in pairs:
        rows.append([Paragraph("<font name='hei'>%s</font>　%s" % (k, v), styles()["td"])])
    t = Table(rows, colWidths=[width], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t
