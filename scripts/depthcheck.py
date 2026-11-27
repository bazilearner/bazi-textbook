#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
出稿深度体检（第六查）

为什么要有这一条：`checkup.py` 查的是**版面**（表格有没有画到纸外、字形有没有缺、标记有没有漏转），
它管「印得对不对」。但它查不出另一种更常见的失败：**报告印得很好，就是薄**——
教学式本该 26 页、三十九张表，实际交了 13 页、十几张表，读者拿不到可复算的过程。
版面全绿，内容却不够。这一条专治「薄」。

它量四件事：
  ① 体量：页数、总字数、每页字数（教学式基线 ≥18 页 / ≥1.5 万字）
  ② 骨架：七个部件在不在（卷首／怎么读／起盘／定旺衰／取用神／辨格局／断岁运／回问／附录）
  ③ 过程：『推法』『过程』『也就是说』『待验』这些**只有真推演才会出现**的词，出现几次
  ④ 分布：按章切段量字数，指出**哪一章薄**（比总量更有用——总量够、第三章空，一样是薄）

用法：
  python3 depthcheck.py 报告.pdf                  # 默认按教学式基线
  python3 depthcheck.py 报告.pdf --style conclusion
  python3 depthcheck.py 报告.pdf --json           # 给流水线用
"""
import json
import re
import sys

try:
    import pypdf
except ImportError:
    print("需要 pypdf：python3 -m pip install pypdf")
    sys.exit(2)

# ── 基线（与 references/depth-baseline.md 同源，改一处必须改两处）──────────
BASE = {
    "teaching": {
        "name": "教学式",
        "pages": 18,
        "chars": 15000,
        "chars_per_page": 550,      # 低于此值说明页很空（整页表格页除外，故只作提示）
        # 骨架部件用**正则**认，不按键名找：同一个词在总览里也会出现，按字面找会切错段
        "sections": {
            "卷首": r"(先说结论|白话速读|一眼看懂)",
            "怎么读": r"这份报告怎么读",
            "起盘": r"第[一1]步.{0,3}起盘",
            "定旺衰": r"第[二2]步.{0,3}定旺衰",
            "取用神": r"第[三3]步.{0,3}取用神",
            "辨格局": r"第[四4]步.{0,3}辨格局",
            "断岁运": r"第[五5]步.{0,3}断岁运",
            "分项": r"(分项细读|第六节)",
            "回问": r"(回到你的问题|你问的那件|你的问题)",
            "附录": r"附录",
        },
        # 章名 → (正则, 最少字数)。只切**标题唯一**的章（五个推导步 + 分项）：
        # 「卷首／回问」这类词在正文里也会出现，按键名切会切出假段，故只作「在不在」的检查。
        # 字数下限按 26 页参考稿反推后留两成余量。
        "chapters": {
            "起盘": (r"第[一1]步.{0,6}起盘", 1800),
            "定旺衰": (r"第[二2]步.{0,6}定旺衰", 2200),
            "取用神": (r"第[三3]步.{0,6}取用神", 1800),
            "辨格局": (r"第[四4]步.{0,6}辨格局", 2200),
            "断岁运": (r"第[五5]步.{0,6}断岁运", 2800),
            "分项": (r"(分项细读|第六节)", 1800),
        },
        # 五步十柱：每步两根柱子（A＝是什么，B＝凭什么），在**该步的段内**查，不在全文查。
        # 全文查没有约束力——「四柱」在术语表里也出现；只有落在第一步的段内，才说明那一步真写了。
        # 键必须与上面的 "chapters" 同名，靠它切段。
        "pillars": {
            "起盘": {"A": r"四柱", "B": r"大运"},
            "定旺衰": {"A": r"四问", "B": r"(计分|得分|力量分)"},
            "取用神": {"A": r"四门", "B": r"(五档|用.{0,2}相.{0,2}喜.{0,2}闲.{0,2}忌)"},
            "辨格局": {"A": r"(成败|救应)", "B": r"相神"},
            "断岁运": {"A": r"引动", "B": r"(填实|虚拱)"},
        },
        # 过程词：只有真写推演才会出现。下限按参考稿实测（推法 6／依据 11／本例 2）取八折
        "markers": {"推法": 4, "依据": 8, "本例": 2},
        "soft_markers": {"也就是说": 2, "待验": 1},
    },
    "conclusion": {
        "name": "结论式",
        "pages": 8,
        "chars": 5000,
        "chars_per_page": 450,
        "sections": {"卷首": r"(先说结论|白话速读)", "回问": r"(回到你的问题|你的问题)", "附录": r"附录"},
        "chapters": {},
        "markers": {"依据": 5},
        "soft_markers": {"也就是说": 2},
    },
}

BANNED = ["孤克", "克夫", "克妻", "血光", "夭折", "绝后", "必离婚", "注定"]


def load(path):
    r = pypdf.PdfReader(path)
    pages = []
    for p in r.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception:
            pages.append("")
    return pages


def norm(s):
    return re.sub(r"\s+", "", s)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(2)
    path = args[0]
    style = "teaching"
    for i, a in enumerate(sys.argv):
        if a == "--style" and i + 1 < len(sys.argv):
            style = sys.argv[i + 1]
    as_json = "--json" in sys.argv
    B = BASE.get(style, BASE["teaching"])

    pages = load(path)
    text = "\n".join(pages)
    flat = norm(text)
    n_pages, n_chars = len(pages), len(flat)
    per_page = n_chars / max(1, n_pages)

    checks = []          # (级别, 项, 实测, 基线, 结论)

    def chk(level, item, got, base, ok):
        checks.append((level, item, got, base, "过" if ok else "**不过**"))

    chk("硬", "页数", n_pages, "≥%d" % B["pages"], n_pages >= B["pages"])
    chk("硬", "总字数（去空白）", n_chars, "≥%d" % B["chars"], n_chars >= B["chars"])
    chk("提示", "每页字数", "%.0f" % per_page, "≈%d" % B["chars_per_page"], per_page >= B["chars_per_page"] * 0.7)

    missing = [k for k, pat in B["sections"].items() if not re.search(pat, flat)]
    chk("硬", "骨架部件", "%d/%d" % (len(B["sections"]) - len(missing), len(B["sections"])),
        "全在", not missing)

    mk = {}
    for k, need in B["markers"].items():
        got = flat.count(k)
        mk[k] = got
        chk("硬", "过程词「%s」" % k, got, "≥%d" % need, got >= need)
    for k, need in B.get("soft_markers", {}).items():
        got = flat.count(k)
        mk[k] = got
        chk("提示", "过程词「%s」" % k, got, "≥%d" % need, got >= need)

    # 按章切段：用**正则**找章首。两条防错：
    # ① 正文里也会出现「它直接决定第三步取用神的方向」这类引述，故章首须**紧跟「这一步在算什么」**；
    # ② 找不到该特征时退而取**最后一处**匹配（标题在引述之后），而不是第一处。
    marks = []
    for name, (pat, need) in B["chapters"].items():
        m = re.search(pat + r"(?=.{0,40}这一步在算什么)", flat)
        if not m:
            ms = list(re.finditer(pat, flat))
            m = ms[-1] if ms else None
        if m:
            marks.append((m.start(), name, need))
    marks.sort()
    chap_stat = []
    seg = {}
    for i, (pos, name, need) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(flat)
        n = end - pos
        chap_stat.append((name, n, need, n >= need))
        seg[name] = flat[pos:end]
    thin = [c for c in chap_stat if not c[3]]
    if chap_stat:
        chk("硬", "分章字数", "%d/%d 章达标" % (len(chap_stat) - len(thin), len(chap_stat)), "全达标", not thin)
    # 五步标题必须全在：一个都没切出来时上面的「分章字数」会空过，这里补一道
    need_steps = list(B.get("pillars", {}).keys())
    lost = [k for k in need_steps if k not in seg]
    if need_steps:
        chk("硬", "五步标题", "%d/%d 步在" % (len(need_steps) - len(lost), len(need_steps)),
            "全在", not lost)

    # 五步十柱：A 柱回答「是什么」，B 柱回答「凭什么」。缺一根即「该步残缺」。
    pillar_stat = []
    for step in need_steps:
        body = seg.get(step, "")
        row = {"step": step, "chars": len(body), "A": False, "B": False}
        for k in ("A", "B"):
            row[k] = bool(body) and bool(re.search(B["pillars"][step][k], body))
        pillar_stat.append(row)
        if not body:
            chk("硬", "柱子·%s" % step, "该步标题未识别", "A✓B✓", False)
        else:
            got = "%s %s" % ("A✓" if row["A"] else "A✗", "B✓" if row["B"] else "B✗")
            chk("硬", "柱子·%s" % step, got, "A✓B✓", row["A"] and row["B"])

    banned = [w for w in BANNED if w in flat]
    chk("硬", "禁语", "、".join(banned) if banned else "无", "无", not banned)

    # 双盘／待验：临界命例才必须有，非临界写了也无害，故只作提示
    has_pending = "待验" in flat
    chk("提示", "「待验」登记", "有" if has_pending else "无", "临界命例须有", True)

    result = {
        "file": path, "style": B["name"], "pages": n_pages, "chars": n_chars,
        "per_page": round(per_page, 1), "markers": mk,
        "missing_sections": missing,
        "pillars": pillar_stat,
        "chapters": [{"name": n, "chars": c, "need": need, "ok": ok} for n, c, need, ok in chap_stat],
        "thin": [c[0] for c in thin], "banned": banned,
        "pass": all(c[4] == "过" or c[0] == "提示" for c in checks),
    }

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=1))
        sys.exit(0 if result["pass"] else 1)

    print("=== 深度体检 · %s基线 ===" % B["name"])
    print("  文件：%s" % path)
    print()
    print("  级别 | 项 | 实测 | 基线 | 判")
    for lv, item, got, base, ok in checks:
        print("  %s | %s | %s | %s | %s" % (lv, item, got, base, ok))
    if chap_stat:
        print()
        print("  分章字数（这一栏最有用——总量够、某章空，一样是薄）：")
        for n, c, need, ok in chap_stat:
            flag = "" if ok else "  ← 薄"
            print("    %-8s %6d 字 / 基线 %5d%s" % (n, c, need, flag))
    if pillar_stat:
        print()
        print("  五步十柱（A＝是什么／B＝凭什么；缺一根即该步残缺）：")
        for r in pillar_stat:
            a = "✓" if r["A"] else "✗"
            b = "✓" if r["B"] else "✗"
            flag = ""
            if not (r["A"] and r["B"]):
                flag = "  ← 该步残缺"
            print("    %-6s A%s B%s  （本步 %5d 字）%s" % (r["step"], a, b, r["chars"], flag))
    if missing:
        print()
        print("  缺部件：%s" % "、".join(missing))
    if thin:
        print()
        print("  最该补的：%s" % "、".join(c[0] for c in thin))
        print("  —— 补法不是加形容词，是回去补表：见 references/depth-baseline.md 的「五步十柱 + 三十九张表」。")
    print()
    print("  结论：%s" % ("达标" if result["pass"] else "**未达标——这稿是「薄」，不是「简洁」**"))
    sys.exit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
