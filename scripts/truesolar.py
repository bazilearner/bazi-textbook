#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真太阳时与时辰边界判定。**这一步必须做，且必须显式报告边界距离。**

为什么关键：中国全境用东经 120° 的北京时间，西部城市地方时与北京时差可达 1 小时以上，
足以把时柱推到一个完全不同的地支。凡出生时间落在时辰边界 ±40 分钟内，就必须双排并出。

用法：
  python truesolar.py 1990-05-15 14:20 116.41 "某地 北京"
  python truesolar.py --table               # 列出常用城市经度
（示例为演示用虚构数据，非任何真实命主。）
"""
import datetime
import math
import sys

# 有些控制台（Windows 默认 GBK）编不出「⚠」这类符号，直接 print 会抛 UnicodeEncodeError
# 而中断整步运算。**注意不要强行把输出改成 UTF-8**——调用方若按 GBK 接收，反而全变乱码。
# 正确做法：保留原编码，只把不可编码字符降级为替换符；并在能判断时直接用 ASCII 记号。
for _s in ("stdout", "stderr"):
    try:
        getattr(sys, _s).reconfigure(errors="replace")
    except Exception:
        pass


def _can_encode(ch):
    try:
        ch.encode(getattr(sys.stdout, "encoding", "utf-8") or "utf-8")
        return True
    except Exception:
        return False


_WARN_MARK = "\u26a0 " if _can_encode("\u26a0") else "[!] "


def warn(msg):
    """带警示符号的输出；终端编码不支持时自动降级为 [!]。"""
    print("  " + _WARN_MARK + msg)


PROV_CITY_LON = {
    # 省级政府驻地 + 部分常用城市经度（东经，度）。
    # 这是一张**通用**表：凡未列出的地方，直接传第三参数覆盖即可（见 cli 用法），
    # 不必也不该为某地单独加行。
    "北京": 116.41, "上海": 121.47, "天津": 117.20, "重庆": 106.55,
    "广州": 113.26, "深圳": 114.06, "武汉": 114.30, "成都": 104.07,
    "西安": 108.94, "郑州": 113.63, "长沙": 112.94, "南京": 118.80,
    "杭州": 120.16, "沈阳": 123.43, "哈尔滨": 126.53, "昆明": 102.83,
    "兰州": 103.83, "乌鲁木齐": 87.62, "拉萨": 91.11, "海口": 110.20,
    "福州": 119.30, "济南": 117.00, "合肥": 117.23, "南昌": 115.89,
    "太原": 112.55, "石家庄": 114.51, "呼和浩特": 111.75, "银川": 106.23,
    "西宁": 101.78, "贵阳": 106.63, "南宁": 108.37, "长春": 125.32,
    "苏州": 120.62, "青岛": 120.38, "大连": 121.62, "厦门": 118.09,
    "宁波": 121.55, "无锡": 120.30, "温州": 120.70, "洛阳": 112.45,
}

SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]


def eot_minutes(y, m, d):
    """均时差（Spencer 近似），单位分钟。真太阳时 = 平太阳时 + EoT"""
    n = datetime.date(y, m, d).timetuple().tm_yday
    B = 2 * math.pi * (n - 81) / 364.0
    return 9.87 * math.sin(2 * B) - 7.53 * math.cos(B) - 1.5 * math.sin(B)


def shichen_of(dt):
    """dt 的小时决定时辰（子时含 23:00-01:00 的跨日段，这里按钟点归属）"""
    return SHICHEN[((dt.hour + 1) % 24) // 2]


def boundary_distance(dt):
    """到最近时辰边界的距离（秒）。
    时辰边界在【奇数整点】：子23:00-01:00、丑01:00-03:00 …… 亥21:00-23:00。
    所以 0/2/4…等偶数整点是时辰的中点，不是边界。"""
    secs = dt.hour * 3600 + dt.minute * 60 + dt.second
    bounds = [h * 3600 for h in range(1, 24, 2)] + [25 * 3600]  # 1,3,...,23 及次日01:00
    return min(abs(secs - b) for b in bounds)


def convert(y, m, d, hh, mm, lon, label=""):
    std = 120.0
    dlon_min = (std - lon) * 4.0                    # 经度每 1° = 4 分钟
    t = datetime.datetime(y, m, d, hh, mm)
    loc = t - datetime.timedelta(minutes=dlon_min)  # 地方平太阳时
    eot = eot_minutes(y, m, d)
    true = loc + datetime.timedelta(minutes=eot)    # 真太阳时
    out = {
        "label": label, "input": t, "bj": t, "solar_mean": loc, "true": true, "eot": eot,
        "dlon": -dlon_min,
        "sc": {"北京时": shichen_of(t), "平太阳时": shichen_of(loc), "真太阳时": shichen_of(true)},
        "dist": {"北京时": boundary_distance(t), "平太阳时": boundary_distance(loc), "真太阳时": boundary_distance(true)},
    }
    return out


def report(r):
    print("=== %s  %s ===" % (r["label"], r["input"].strftime("%Y-%m-%d %H:%M")))
    print("  北京时间     %s" % r["bj"].strftime("%H:%M:%S"))
    print("  经度差校正   %+.2f 分" % r["dlon"])
    print("  地方平太阳时 %s" % r["solar_mean"].strftime("%H:%M:%S"))
    print("  均时差       %+.2f 分" % r["eot"])
    print("  真太阳时     %s" % r["true"].strftime("%H:%M:%S"))
    print("  -> 北京时 %s时 ｜ 平太阳时 %s时 ｜ 真太阳时 %s时"
          % (r["sc"]["北京时"], r["sc"]["平太阳时"], r["sc"]["真太阳时"]))
    for k in ("北京时", "平太阳时", "真太阳时"):
        s = r["dist"][k]
        if s <= 1200:
            warn("%s 距时辰边界仅 %d 分 %02d 秒 —— 必须双排并出" % (k, s // 60, s % 60))
    amb = len(set(r["sc"].values())) > 1
    # ── 「三法一致」≠「没有边界问题」──────────────────────────────────
    # 曾把这两件事混为一谈：只要三种算法的时辰相同，就打印「无边界争议」。
    # 但实测遇到一例真太阳时 21:00:57 —— 距戌/亥边界只剩 57 秒，
    # 三法恰好都落在亥时所以判「无争议」，可均时差公式或经度取值稍变一点，
    # 时柱就会从亥时翻成戌时（连干支一起变）。这类命例叫**临界命例**，
    # 必须单列出来，否则报告里会把「险些翻盘」写成「毫无问题」。
    near = [k for k in ("北京时", "平太阳时", "真太阳时") if r["dist"][k] <= 1200]
    if amb:
        print("  【结论】存在时辰分歧：%s" % set(r["sc"].values()))
        print("       处理法：两盘都排 → 只采用两盘共有的结论（骨架不变量）→ 分歧项列为待验项")
    elif near:
        print("  【结论】三法一致为 %s时，但属【临界命例】：%s 距边界最近仅 %d 秒。"
              % (r["sc"]["真太阳时"], "、".join(near), min(r["dist"][k] for k in near)))
        print("       处理法：**必须双排并出**——按相邻时辰再排一盘，两盘共有的结论才可放心写；")
        print("       时柱本身及其直接所主（头面、晚运、子女宫、该柱十神）一律降级为待验项，")
        print("       并在报告里明确写出「距边界仅 N 秒」这一事实，不要写成「无边界争议」。")
    else:
        print("  【结论】时柱确定：%s时，无边界争议" % r["sc"]["真太阳时"])
    # 晚子时（23:00–01:00）：本技能已有默认裁决（见 references/zi-shi-dayroll.md 第〇节）
    involves_zi = ("子" in r["sc"].values()) or (r["bj"].hour >= 23) or (r["bj"].hour == 0)
    if involves_zi:
        warn("晚子时换日提醒（本技能已有默认裁决，见 zi-shi-dayroll.md 第〇节）：")
        print("     准则：「一天没有两个子时。如果有第二个子时，那就是进入了第二天。」")
        print("     故 23:00–24:00 出生者，日柱一律归次日 —— paipan.js 已内置，直接排原时刻即可。")
        print("     " + _WARN_MARK + "切勿手工改成「次日日期 + 原时刻」排盘：日柱虽对，时干会多进一位，")
        print("       排出「日主与时干不匹配」的盘（如甲申日配丙子时，而甲日子时必为甲子）。")
        print("     另一派（晚子时算当日）：加 --zi same。自洽复核：以「次日 00:10」排，日柱应与此盘相同。")


def usage():
    print("用法：")
    print("  truesolar.py YYYY-MM-DD HH:MM [经度E] [地名]")
    print("  truesolar.py --table          # 打印内置城市经度表")
    print()
    print("示例：truesolar.py 1990-06-15 08:30 116.41 北京")
    print("     （不传经度则按东经 120° 的法定时区中线算，即「北京时」原始准；")
    print("       真太阳时校正一般都要传当地经度，查不到就传最近城市的值。）")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--table":
        for k, v in PROV_CITY_LON.items():
            print("%-14s %.2fE" % (k, v))
        sys.exit(0)
    if len(sys.argv) < 3:                      # 别让用户撞一串 traceback
        usage()
        sys.exit(2)
    try:
        y, m, d = [int(x) for x in sys.argv[1].split("-")]
        hh, mm = [int(x) for x in sys.argv[2].split(":")]
        lon = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
    except ValueError:
        print("参数格式不对。请按 YYYY-MM-DD HH:MM 传日期与时刻。\n")
        usage()
        sys.exit(2)
    label = sys.argv[4] if len(sys.argv) > 4 else "未命名"
    report(convert(y, m, d, hh, mm, lon, label))
