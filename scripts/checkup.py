#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出稿前版面体检（像素级）——比 bbox 抽词可靠。

为什么必须做：
  pypdf/pdftotext 抽文字层只能证明「字在文件里」，**证明不了「字在版心内」**。
  表格列数不一致、列宽超限、CJK 断行误差，都会把内容画到版心之外甚至纸张之外，
  而文字层里那些字一个不少 —— 只有把页面栅格化、数真实墨迹像素才看得见。

用法：
  <python> checkup.py 报告.pdf                      # 全检（版面）
  <python> checkup.py 报告.pdf --markers            # 附加：文字层标记残留
  <python> checkup.py 报告.pdf --pages 15,63        # 抽检指定页
  <python> checkup.py 报告.pdf --margins 20,20,22,18
  <python> checkup.py 合并册.pdf --cover-pages 1,6      # 多封面：把每一处封面页都列上
  <python> checkup.py 报告.pdf --json out.json
  <python> checkup.py 报告.txt --glyphs             # 【渲染前】核文本里有没有字体画不出的字

判定：
  版心 = 页宽 − 左右页边距（Frame 内边距应为 0；若用了默认 6pt 内边距，请自行把边距加 6pt）
  墨迹越界 → 报「溢出」；但若越界墨迹全部位于页面顶部 80pt 内，判为封面通栏，不算问题。
  --markers：文字层里出现 `**`、`<b>`、`&lt;` 之类 → 说明标记被当正文印出来了。
             这一类比越界更阴险：版面正常、字也不缺，只是把标记印进了中文里。
  --glyphs ：输入换成**纯文本**（不是 PDF），拿真实字体的 cmap 逐字核，
             报出「reportlab 会静默丢弃的字」。
             **为什么必须渲染前查**：缺字形是静默失败 —— 字没了，但文件不报错、
             文字层也抽不出那个字，所以事后任何抽查都只能看到「少了一个字」，
             无法区分「本来就没有」与「被丢掉了」。只有拿源文本对照 cmap 才抓得准。
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

MM = 72.0 / 25.4
PAGE_W, PAGE_H = 595.276, 841.89        # A4
COVER_BAND = 80.0                       # 顶部通栏带（pt），此带内的越界视为封面设计

# 文字层标记残留：这些字符串出现，说明「标记被当成正文印出来了」。
# 与前一项检查同样阴险：版面不越界、字不缺、表格列数也对，
# 只是把 `**` 印在中文里、或把 `&lt;` 当字面显示 —— 而缺字形预检、列宽检查、像素体检全都查不出来。
MARKER_BAD = ["**", "<b>", "</b>", "<font", "&amp;", "&lt;", "&gt;", "\x00", "\\u"]


def marker_audit(pdf, pages=None):
    """抽文字层，找漏转的标记（返回 {标记: [页码, ...]}）"""
    from pypdf import PdfReader
    r = PdfReader(pdf)
    hits = {}
    for i, p in enumerate(r.pages, 1):
        if pages and i not in pages:
            continue
        t = p.extract_text() or ""
        for k in MARKER_BAD:
            if k in t:
                hits.setdefault(k, []).append(i)
    return hits


def glyph_audit(src):
    """核「文本里有没有字体画不出的字」。

    返回 (bad, fixed, err)：
      bad   = {字符: 次数}  —— 真正会被静默丢弃、必须处理的
      fixed = [(原字符, 替换为, 次数)] —— 已被 pdfkit.GLYPH_FIX 自动兜住的（提醒但不拦）
      err   = 错误说明，成功时为 None

    先用 pdfkit.sanitize() 过一遍再核，口径才与「真正进 reportlab 的文本」一致；
    否则会把 GLYPH_FIX 已经兜住的字符误报成缺字形。
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        import pdfkit
        from reportlab.pdfbase import pdfmetrics
    except Exception as e:                     # reportlab 不在环境里
        return None, None, "无法导入 reportlab / pdfkit：%s" % e

    raw = Path(src).read_text(encoding="utf-8", errors="replace")
    fixed = [(c, pdfkit.GLYPH_FIX[c], raw.count(c))
             for c in sorted(pdfkit.GLYPH_FIX) if c in raw]
    t = pdfkit.sanitize(raw)                   # 与出稿同口径：先净化再核

    pdfkit.register_fonts()
    cmaps = []
    for name in ("song", "hei"):
        try:
            face = getattr(pdfmetrics.getFont(name), "face", None)
        except Exception:
            continue
        cm = getattr(face, "charToGlyph", None)
        if cm:
            cmaps.append(set(cm.keys()))
    if not cmaps:
        return None, fixed, "读不到字体 cmap（字体未注册？）"

    bad = {}
    for ch in sorted(set(t)):
        if ch in "\n\r\t":
            continue
        o = ord(ch)
        if not any(o in cm for cm in cmaps):   # 任一字体能画就行
            bad[ch] = t.count(ch)
    return bad, fixed, None


def ink_profile(png, dpi):
    """逐行返回 (y_pt, x_max_pt, x_min_pt)，顶左原点；只含 y ∈ [40, 800] 的行。"""
    from PIL import Image
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    sc = dpi / 72.0
    rows = []
    y0, y1 = int(40 * sc), min(h, int(800 * sc))
    for y in range(y0, y1):
        first = last = None
        for x in range(w):
            if px[x, y] < 200:
                first = x
                break
        if first is None:
            continue
        for x in range(w - 1, -1, -1):
            if px[x, y] < 200:
                last = x
                break
        rows.append((y / sc, last / sc, first / sc))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="待检文件：默认是 PDF；加 --glyphs 时传纯文本")
    ap.add_argument("--pages", default="")
    ap.add_argument("--margins", default="20,20,22,18",
                    help="左,右,上,下（mm），默认 20,20,22,18")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--json", default="")
    ap.add_argument("--cover-pages", default="1",
                    help="封面页（通栏横幅+标题画在版心之外，属设计），默认 1")
    ap.add_argument("--markers", action="store_true",
                    help="附加：抽文字层查「漏转的标记」（**、<b>、&lt; 等）")
    ap.add_argument("--glyphs", action="store_true",
                    help="改查字形：把位置参数当纯文本，核有没有字体画不出的字（渲染前用）")
    a = ap.parse_args()

    # ── 字形检查：唯一必须【渲染前】跑的一项 ────────────────────────────
    if a.glyphs:
        bad, fixed, err = glyph_audit(a.pdf)
        if err:
            print("字形检查失败：%s" % err)
            return 2
        print("源文本：%s" % a.pdf)
        if fixed:
            print("  已由 GLYPH_FIX 自动替换 %d 种：%s"
                  % (len(fixed), "  ".join("%s→%s ×%d" % (c, v if v else "（删除）", n)
                                           for c, v, n in fixed)))
        if bad:
            print("\n结果：%d 个字符字体画不出来（reportlab 会**静默丢弃**，必须换字或加进 GLYPH_FIX）："
                  % len(bad))
            for ch, n in sorted(bad.items(), key=lambda kv: -kv[1]):
                print("  %-4s U+%04X  ×%d" % (ch, ord(ch), n))
            if a.json:
                Path(a.json).write_text(json.dumps(
                    {"glyphs": {"%04X" % ord(c): n for c, n in bad.items()},
                     "glyphs_fixed": [{"char": c, "to": v, "n": n} for c, v, n in fixed]},
                    ensure_ascii=False, indent=1), encoding="utf-8")
            return 1
        print("\n结果：无缺字形  OK")
        if a.json:
            Path(a.json).write_text(json.dumps(
                {"glyphs": {},
                 "glyphs_fixed": [{"char": c, "to": v, "n": n} for c, v, n in fixed]},
                ensure_ascii=False, indent=1), encoding="utf-8")
        return 0

    lm, rm, tm, bm = [float(x) * MM for x in a.margins.split(",")]
    FRAME_L, FRAME_R = lm, PAGE_W - rm
    FRAME_T, FRAME_B = tm, PAGE_H - bm
    covers = {int(x) for x in a.cover_pages.split(",") if x.strip()}

    if a.pages:
        pages = [int(x) for x in a.pages.split(",")]
    else:
        info = subprocess.run(["pdfinfo", a.pdf], capture_output=True, text=True).stdout
        pages = list(range(1, int(info.split("Pages:")[1].split()[0]) + 1))

    tmp = Path(tempfile.mkdtemp(prefix="checkup_"))
    problems, notes = [], []
    for p in pages:
        subprocess.run(["pdftoppm", "-png", "-r", str(a.dpi), "-f", str(p), "-l", str(p),
                        a.pdf, str(tmp / "p")], check=True)
        pngs = sorted(tmp.glob("p*.png"))
        if not pngs:
            continue
        rows = ink_profile(pngs[-1], a.dpi)
        for f in pngs:
            f.unlink()
        if not rows:
            continue
        over = [r for r in rows if r[1] > FRAME_R + 1.0 or r[2] < FRAME_L - 1.0]
        if not over:
            continue
        y_lo, y_hi = min(r[0] for r in over), max(r[0] for r in over)
        x_max = max(r[1] for r in over)
        side = "右" if over[0][1] > FRAME_R + 1.0 else "左"
        if p in covers or y_hi <= COVER_BAND:
            notes.append((p, round(x_max, 1),
                          "封面页（通栏横幅）" if p in covers else "顶部通栏带内"))
        else:
            problems.append((p, side, round(x_max, 1), round(y_lo, 1), round(y_hi, 1)))
        # 上下越界（封面页的标题画在版心之上，跳过；页眉/页脚带本就画在版心之外，排除）
        if p not in covers:
            ys = [r[0] for r in rows if 55 <= r[0] <= 798]
            if ys and (min(ys) < FRAME_T - 1.0 or max(ys) > FRAME_B + 1.0):
                problems.append((p, "上下", 0.0, round(min(ys), 1), round(max(ys), 1)))

    print("PDF：%s" % a.pdf)
    print("检查 %d 页 | dpi=%d | 版心 x=[%.2f, %.2f]  y=[%.2f, %.2f]"
          % (len(pages), a.dpi, FRAME_L, FRAME_R, FRAME_T, FRAME_B))
    for p, x, why in notes:
        print("  （p%-3d 墨迹至 x=%.1f：%s）" % (p, x, why))
    if problems:
        print("\n结果：%d 处越界 —— 内容可能被裁掉，必须修" % len(problems))
        for p, side, x, y0, y1 in problems:
            print("  p%-3d %s 越界  x=%.1f  y=[%.1f, %.1f]" % (p, side, x, y0, y1))
    else:
        print("\n结果：版心内无越界  OK")

    marks = {}
    if a.markers:
        marks = marker_audit(a.pdf, set(pages))
        if marks:
            print("\n文字层标记残留（标记被当正文印出来了，必须修）：")
            for k, ps in marks.items():
                shown = ",".join("p%d" % x for x in ps[:12]) + ("…" if len(ps) > 12 else "")
                print("  %-8s %2d 页：%s" % (k.replace("\x00", "\\0"), len(ps), shown))
        else:
            print("\n文字层标记残留：无  OK")

    if a.json:
        Path(a.json).write_text(json.dumps(
            {"problems": problems, "notes": notes,
             "markers": {k: v for k, v in marks.items()}}, ensure_ascii=False, indent=1),
            encoding="utf-8")
    return 1 if (problems or marks) else 0


if __name__ == "__main__":
    sys.exit(main())
