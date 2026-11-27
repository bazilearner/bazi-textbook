#!/usr/bin/env node
/**
 * selftest.js —— 排盘口径自检（零依赖，只 require 本目录 paipan.js）
 *
 * 用法：
 *   node scripts/selftest.js
 *   node scripts/selftest.js --quiet     # 只打印结论行
 *
 * 查三类问题（都是「只比日柱查不出来」的那类）：
 *   ① 时干是否由日干按五鼠遁起 —— 查「日主与时干不匹配」的错盘
 *   ② 晚子时是否自洽 —— 23:00–24:00 的盘必须与「次日 00:10」同盘
 *   ③ 回归 —— 非子时时段，四柱/纳音/地势/旬空须与 lunar-typescript 原生一致
 *
 * 期望输出：「违例 0」。有任何一行 ✗，即口径已破，不得出稿。
 */
const P = require('./paipan.js');
const { Solar } = require('lunar-typescript');

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const quiet = process.argv.includes('--quiet');
const say = (...a) => { if (!quiet) console.log(...a); };

/* 五鼠遁：甲己日甲子起、乙庚日丙子起、丙辛日戊子起、丁壬日庚子起、戊癸日壬子起 */
const wuShu = (dayGan, hourZhi) =>
  GAN[((GAN.indexOf(dayGan) % 5) * 2 + ZHI.indexOf(hourZhi)) % 10];

const pad = n => String(n).padStart(2, '0');
const dates = [];
for (const y of [1984, 1990, 1995, 2000, 2010, 2020, 2026])
  for (const md of ['01-01', '02-04', '05-15', '08-20', '12-31']) dates.push(`${y}-${md}`);

let bad = [], checked = 0, ziCases = 0;

/* ① + ② */
for (const d of dates) {
  for (let h = 0; h < 24; h++) for (const mi of [0, 10, 30, 55]) {
    const dt = `${d} ${pad(h)}:${pad(mi)}`;
    const c = P.makeChart(dt, 1);
    checked++;
    const want = wuShu(c.p.day[0], c.p.time[1]);
    if (c.p.time[0] !== want)
      bad.push(`${dt} 时干 ${c.p.time[0]} ≠ 五鼠遁应有 ${want}（日柱 ${c.p.day}）`);
    if (h === 23) {
      ziCases++;
      const nd = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1));
      const dt2 = `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())} 00:10`;
      const c2 = P.makeChart(dt2, 1);
      if (c.p.day !== c2.p.day)
        bad.push(`${dt} 日柱 ${c.p.day} ≠ 次日 00:10 之 ${c2.p.day}（同一子时须同盘）`);
      if (c.p.time !== c2.p.time)
        bad.push(`${dt} 时柱 ${c.p.time} ≠ 次日 00:10 之 ${c2.p.time}`);
    }
  }
}

/* ③ 回归：非子时时段与 lunar 原生逐项一致 */
let regress = [];
for (const d of ['1984-02-04', '1990-05-15', '1995-08-20', '2000-01-01', '2026-12-31']) {
  for (let h = 0; h <= 22; h += 2) {
    const dt = `${d} ${pad(h)}:30`;
    const [Y, M, D] = d.split('-').map(Number);
    const ec = Solar.fromYmdHms(Y, M, D, h, 30, 0).getLunar().getEightChar();
    const c = P.makeChart(dt, 1);
    const gz = [c.p.year, c.p.month, c.p.day, c.p.time];
    if (JSON.stringify([ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()]) !== JSON.stringify(gz))
      regress.push(`${dt} 四柱与 lunar 不一致`);
    const ny = [ec.getYearNaYin(), ec.getMonthNaYin(), ec.getDayNaYin(), ec.getTimeNaYin()];
    if (JSON.stringify(gz.map(P._nayin)) !== JSON.stringify(ny)) regress.push(`${dt} 纳音不符`);
    const xk = [ec.getYearXunKong(), ec.getMonthXunKong(), ec.getDayXunKong(), ec.getTimeXunKong()];
    if (JSON.stringify(gz.map(P._xunKong)) !== JSON.stringify(xk)) regress.push(`${dt} 旬空不符`);
    const ds = [ec.getYearDiShi(), ec.getMonthDiShi(), ec.getDayDiShi(), ec.getTimeDiShi()];
    if (JSON.stringify(gz.map(x => P._diShi(c.dayGan, x[1]))) !== JSON.stringify(ds))
      regress.push(`${dt} 地势不符`);
  }
}

/* ④ 两派必须不同、且各自自洽（防止 --zi same 退化成 next） */
const a = P.makeChart('1995-08-20 23:55', 1);
const b = P.makeChart('1995-08-20 23:55', 1, 'same');
if (a.p.day === b.p.day) bad.push('--zi same 与默认口径日柱相同，开关未生效');
if (b.p.time[0] !== wuShu(b.p.day[0], '子')) bad.push('--zi same 的时干未按当日日干起');

say(`① 五鼠遁 + ② 晚子时自洽：${checked} 个时刻（含 ${ziCases} 个晚子时）`);
bad.slice(0, 12).forEach(x => say(`  ✗ ${x}`));
say(`   违例 ${bad.length}`);
say(`③ 回归（非子时，四柱/纳音/地势/旬空）：`);
regress.slice(0, 12).forEach(x => say(`  ✗ ${x}`));
say(`   违例 ${regress.length}`);
say(`④ 两派开关：默认 ${a.p.day}${a.p.time} ／ --zi same ${b.p.day}${b.p.time}`);

const total = bad.length + regress.length;
console.log(total === 0 ? '结果：违例 0 —— 排盘口径自检通过' : `结果：共 ${total} 处违例 —— 不得出稿`);
process.exit(total === 0 ? 0 : 1);
