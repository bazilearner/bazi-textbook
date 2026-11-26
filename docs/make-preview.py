#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 README 演示图：用技能自带的 pdfkit 渲染，数值取自 wangshuai.js 实际输出。
命例为虚构示例（1990-05-15 14:20 男 / 庚午 辛巳 庚辰 癸未），不含任何真实命主数据。"""
import os
import sys

DOCS = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(DOCS)
sys.path.insert(0, os.path.join(SKILL, "scripts"))

import pdfkit
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, NextPageTemplate, PageBreak,
                                Paragraph, Spacer)

pdfkit.register_fonts()
S = pdfkit.styles()
W = pdfkit.CONTENT_W
OUT = os.path.join(DOCS, "sample-report.pdf")

doc, story = pdfkit.make_doc(
    OUT, "八字命理推演报告",
    footer_left="教学式 · 示例（虚构，非真实命主）",
    footer_right="bazi-textbook v1.5.1")

# ---------------- 封面 ----------------
story.append(Spacer(1, 42 * mm))
story.append(Paragraph("八字命理推演报告", S["cover_t"]))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph("教学式 · 起盘 → 定旺衰 → 取用神 → 辨格局 → 断岁运", S["cover_s"]))
story.append(Spacer(1, 22 * mm))
story.append(pdfkit.kv_box("命例（虚构，仅示范格式）", [
    ("四柱", "庚午　辛巳　庚辰　癸未"),
    ("日主", "庚（金·阳干）　月令 巳（火）· 司令 庚（比肩）"),
    ("大运", "阳男顺排，起运 7 年 2 月 20 天：壬午 癸未 甲申 乙酉 丙戌 丁亥"),
], W))
story.append(Spacer(1, 14 * mm))
story.append(Paragraph(
    "本报告不写「日主身弱」四个字了事：每一步都列出<b>推法</b>、<b>代入过程</b>与<b>结论</b>，"
    "数字全部由脚本算出，读者可拿纸笔逐步核对。", S["p"]))

story.append(NextPageTemplate("body"))
story.append(PageBreak())

# ---------------- 正文：定旺衰 ----------------
story.append(Paragraph("二、定旺衰：四问 + 力量计分", S["h1"]))
story.append(Paragraph(
    "月令为纲，先问得令；再看通根（得地）、印源（得生）、比劫（得助）。"
    "四问各自成结论，最后用计分做<b>辅助校验</b>，二者背离时以四问为准并写明理由。", S["lead"]))
story.append(Spacer(1, 3 * mm))

story.append(Paragraph(
    "生于立夏（1990-05-06 02:35）后第 10 日，巳月分野 戊(7)→庚(7)→丙(16.5)，"
    "当值人元为<b>庚（比肩）</b>；月支藏干 丙（本气·七杀）、庚（中气·比肩）、戊（余气·偏印）。", S["p"]))
story.append(Spacer(1, 3 * mm))

story.append(Paragraph("⑦ 四问汇总", S["h2"]))
story.append(pdfkit.table([
    ["问", "答", "要点"],
    ["① 得令否", "<b>失令（死）</b>", "月支 巳（火），日主 金 处「死」"],
    ["② 得地否", "<b>得地而根浅</b>", "仅中／余气根（月支巳藏庚），遇冲泄即拔"],
    ["③ 得生否", "<b>得生</b>", "印居地支本气 2 处、中余气 2 处，源厚而不显"],
    ["④ 得助否", "<b>得助</b>", "年干庚、月干辛透比劫，可分担财官"],
], [62, 96, W - 158]))
story.append(Spacer(1, 4 * mm))

story.append(Paragraph("⑥ 力量计分（口径可复算）", S["h2"]))
story.append(Paragraph(
    "口径：天干各 1 分；日干本体 1 分；地支本气 1、中气 0.5、余气 0.25；"
    "<b>月支各项再乘 2</b>（月令司权，一月之令当一季之气）。", S["p"]))
story.append(Spacer(1, 2 * mm))
story.append(pdfkit.table([
    ["序", "字", "位置", "十神", "基础分", "月令加权", "得分", "归类"],
    ["1", "庚", "年柱天干", "比肩", "1", "—", "1", "同类"],
    ["2", "丁", "年支午本气", "正官", "1", "—", "1", "异类"],
    ["4", "辛", "月柱天干", "劫财", "1", "—", "1", "同类"],
    ["5", "丙", "月支巳本气", "七杀", "1", "×2", "2", "异类"],
    ["7", "戊", "月支巳余气", "偏印", "0.25", "×2", "0.5", "同类"],
    ["—", "…", "其余 8 项（共 15 项）", "", "", "", "", ""],
], [26, 34, 92, 62, 55, 62, 50, W - 381], align_center_cols=(0, 1, 4, 5, 6, 7)))
story.append(Spacer(1, 4 * mm))

story.append(KeepTogether([
    pdfkit.kv_box("结论（示例）", [
        ("同类合计", "7 分（比劫 4 ＋ 印 3）"),
        ("异类合计", "5.5 分（财 0.75 ＋ 官杀 3.5 ＋ 食伤 1.25）"),
        ("同类占比", "<b>56.0%</b>　→　判定线 ≥55% 为身强倾向"),
        ("四问 vs 计分", "计分给「身强倾向」，但四问为<b>失令、根浅</b>——<b>以四问为准</b>"),
    ], W),
]))


# ---------------- 正文：格局（接上一页，不再强制分页） ----------------
story.append(Paragraph(
    "计分只是辅助。本例正是规范里点名要警惕的情形：<b>得地而无本气根</b>，"
    "扶身之力虚而不实，故不取「身强用财官」的常规解法，转看调候与格局成败。", S["p"]))
story.append(Spacer(1, 6 * mm))

story.append(Paragraph("四、辨格局：成败救应", S["h1"]))
story.append(Paragraph(
    "取格以<b>月令藏干透出</b>为主。本例月令巳，藏丙、庚、戊，天干透庚（比肩）、辛（劫财），"
    "丙火七杀不透——故不作七杀格论，以<b>建禄（月劫）格</b>看，转而论相神与成败。", S["lead"]))
story.append(Spacer(1, 4 * mm))

story.append(Paragraph("成败六条（逐条核）", S["h2"]))
story.append(pdfkit.table([
    ["条目", "本例", "判定"],
    ["相神有无", "财（乙）藏支不透，官杀丙藏于巳", "相神弱，需岁运引出"],
    ["用神受伤否", "印星戊己四见，土多金埋之虞", "<b>病在印重</b>"],
    ["救应", "时干癸水伤官，可泄金之秀、润土之燥", "<b>癸为救应</b>"],
    ["调候", "巳月火旺金熔，取壬癸水为调候", "与救应同向，加分"],
], [78, W - 78 - 92, 92]))
story.append(Spacer(1, 4 * mm))
story.append(pdfkit.kv_box("本步落点", [
    ("格", "建禄（月劫）格，相神弱"),
    ("病", "印重土厚，金埋不显"),
    ("药", "癸水伤官泄秀润燥；行水运为应期"),
    ("约束下一步", "断岁运时，优先找<b>引动癸水</b>与<b>冲动印星</b>的年份"),
], W))

doc.build(story)
print("PDF 已生成:", OUT, os.path.getsize(OUT), "字节")
