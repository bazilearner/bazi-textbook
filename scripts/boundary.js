#!/usr/bin/env node
/**
 * 时辰边界双盘并出（临界命例专用）
 *
 * 为什么要有这个脚本：`truesolar.py` 只会告诉你「必须双排并出」，但双排要做的事
 * 是「按相邻时辰再排一盘 → 逐项 diff → 只采共有结论 → 分歧项登记为待验」。
 * 手工做这件事有三个坑：
 *   ① 相邻时辰的钟点要自己找（21:40 的邻居是 20:10 还是 22:50？）；
 *   ② 有些项看着一样、其实换了（时支神煞、日主长生、官星有无、虚拱）；
 *   ③ 日主强弱要两个盘各算一遍，手算必错。
 * 本脚本把这三件事一次做完，输出可直接贴进报告的「1.2 时辰边界」与「附录 A」。
 *
 * 用法：
 *   node boundary.js "1990-05-15 14:20" 1 116.41
 *   node boundary.js "1990-05-15 14:20" 0 116.41            # 经度缺省按 120（不校正）
 *   node boundary.js ... --lon 116.41 --md                   # 输出 Markdown 表（可直接进 PDF 底稿）
 *
 * 参数：性别 1=男 0=女（与 paipan.js 一致）。经度可作第 3 个位置参数或 --lon。
 * 依赖：paipan.js（同目录）、wangshuai.js（同目录，用于两盘计分）。
 */
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('./paipan.js');

const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const SHICHEN = ZHI;
const WX_OF_ZHI = { 子:'水', 丑:'土', 寅:'木', 卯:'木', 辰:'土', 巳:'火', 午:'火', 未:'土', 申:'金', 酉:'金', 戌:'土', 亥:'水' };
const POS = ['年', '月', '日', '时'];

/* ── 与 truesolar.py 完全同一套公式（Spencer 近似）──
   两处必须同式，否则 JS 说亥时、Python 说戌时，报告自己打自己。 */
function eotMinutes(y, m, d) {
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const B = 2 * Math.PI * (n - 81) / 364.0;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(dt) { return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`; }
function shichenOf(hour) { return SHICHEN[((hour + 1) % 24) >> 1]; }
function boundaryDist(h, mi, s) {
  const secs = h * 3600 + mi * 60 + (s || 0);
  const bounds = [];
  for (let i = 1; i < 24; i += 2) bounds.push(i * 3600);
  bounds.push(25 * 3600);
  return Math.min(...bounds.map(b => Math.abs(secs - b)));
}

/* 该时辰的代表钟点（用来排「相邻时辰」那一盘）。
   取「奇数整点 + 1 小时 + 10 分」，落在时辰正中，离两侧边界都最远。 */
function repTime(zhi) {
  const i = ZHI.indexOf(zhi);
  const start = (i * 2 + 23) % 24;          // 子=23, 丑=1, 寅=3 …
  return { hour: (start + 1) % 24, minute: 10, nextDay: start === 23 };
}

function chartAt(dtStr, gender) {
  return P.makeChart(dtStr, gender);
}

/* chart.p 是对象 {year,month,day,time}，统一转成四柱数组，避免各脚本各写一份 */
function pillars(chart) {
  return [chart.p.year, chart.p.month, chart.p.day, chart.p.time];
}
function nodesOf(chart) {
  return pillars(chart).map((gz, i) => ({ label: POS[i], zhi: gz[1], gan: gz[0] }));
}

function shenshaAt(chart, zhi) {
  return chart.shensha.filter(s => s.zhi === zhi).map(s => s.name);
}

function guanShaCount(chart) {
  let n = 0;
  chart.shiShen.gan.forEach(s => { if (s === '正官' || s === '七杀') n++; });
  chart.shiShen.zhi.forEach(arr => arr.forEach(s => { if (s === '正官' || s === '七杀') n++; }));
  return n;
}

function relLines(chart) {
  const r = P.relations(nodesOf(chart));
  const out = [];
  ['六合', '三合', '三会', '冲', '刑', '自刑', '害', '破'].forEach(k => {
    (r[k] || []).forEach(x => {
      if (x.includes('时')) out.push(`${k}：${x}`);
    });
  });
  return out;
}

function scoreOf(ganzhi, dtStr) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'wangshuai.js'), 'score', ganzhi, dtStr],
      { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/同类占比\s*\*{0,2}([\d.]+)%/);
    const t = out.match(/同类合计[^\n]*?\*{0,2}([\d.]+)\*{0,2}\s*分[^\n]*?异类合计[^\n]*?\*{0,2}([\d.]+)\*{0,2}\s*分/);
    return { ratio: m ? m[1] : '?', tong: t ? t[1] : '?', yi: t ? t[2] : '?' };
  } catch (e) {
    return { ratio: '?', tong: '?', yi: '?' };
  }
}

function main() {
  const argv = process.argv.slice(2);
  let md = false, lon = null, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--md') md = true;
    else if (argv[i] === '--lon') lon = parseFloat(argv[++i]);
    else pos.push(argv[i]);
  }
  const dtStr = pos[0];
  const gender = pos[1] === undefined ? 1 : Number(pos[1]);
  if (lon === null && pos[2] !== undefined) lon = parseFloat(pos[2]);
  if (lon === null) lon = 120.0;

  if (!dtStr || !/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(dtStr.trim())) {
    console.log('用法：node boundary.js "YYYY-MM-DD HH:MM" [性别 1男/0女] [经度E] [--md]');
    process.exit(2);
  }

  const [d, t] = dtStr.trim().split(/\s+/);
  const [Y, M, D] = d.split('-').map(Number);
  const [hh, mi] = t.split(':').map(Number);

  /* 三口径换算（与 truesolar.py 同式） */
  const clock = new Date(Date.UTC(Y, M - 1, D, hh, mi, 0));
  const dlonMin = (120.0 - lon) * 4.0;                    // 经度每 1° = 4 分
  const mean = new Date(clock.getTime() - dlonMin * 60000);
  const eot = eotMinutes(Y, M, D);
  const trueSolar = new Date(mean.getTime() + eot * 60000);

  const scClock = shichenOf(clock.getUTCHours());
  const scMean = shichenOf(mean.getUTCHours());
  const scTrue = shichenOf(trueSolar.getUTCHours());
  const dist = {
    '北京时': boundaryDist(clock.getUTCHours(), clock.getUTCMinutes(), clock.getUTCSeconds()),
    '平太阳时': boundaryDist(mean.getUTCHours(), mean.getUTCMinutes(), mean.getUTCSeconds()),
    '真太阳时': boundaryDist(trueSolar.getUTCHours(), trueSolar.getUTCMinutes(), trueSolar.getUTCSeconds()),
  };
  const near = Object.keys(dist).filter(k => dist[k] <= 1200);
  const amb = new Set([scClock, scMean, scTrue]).size > 1;
  const level = amb ? '①' : (near.length ? '②' : '③');
  const levelText = amb ? '① 三法归属不同——必须双盘，且分歧项一律待验'
    : (near.length ? '② 临界命例（三法同属一时辰，但距界 ≤20 分）——必须双盘' : '③ 距界远——单盘可断');

  /* 主盘：以真太阳时的时支为准（本技能口径：时支由真太阳时定） */
  const mainZhi = scTrue;
  let mainDt = dtStr.trim();
  if (mainZhi !== scClock) {
    const r = repTime(mainZhi);
    const dd = new Date(Date.UTC(Y, M - 1, D + (r.nextDay ? 1 : 0), r.hour, r.minute, 0));
    mainDt = fmt(dd);
  }
  const c1 = chartAt(mainDt, gender);

  /* 对照盘：相邻时辰——距哪一侧边界更近，就取哪一侧 */
  const idx = ZHI.indexOf(mainZhi);
  const upperBound = (idx * 2 + 1) % 24;                   // 该时辰的上界（奇数整点）
  const lowerBound = (upperBound - 2 + 24) % 24;           // 下界
  const ref = mainZhi === scTrue ? trueSolar : clock;
  const secOf = ref.getUTCHours() * 3600 + ref.getUTCMinutes() * 60 + ref.getUTCSeconds();
  const distUp = Math.abs(secOf - upperBound * 3600);
  const distLow = Math.abs(secOf - lowerBound * 3600);
  // 跨上界 → 上界之后那个时辰；跨下界 → 下界之前那个时辰
  const nbZhi = distUp <= distLow ? shichenOf(upperBound) : shichenOf((lowerBound - 1 + 24) % 24);
  const nbSide = distUp <= distLow ? '上界' : '下界';
  const rn = repTime(nbZhi);
  const nbDate = new Date(Date.UTC(Y, M - 1, D + (rn.nextDay ? 1 : 0), rn.hour, rn.minute, 0));
  const nbDt = fmt(nbDate);
  const c2 = chartAt(nbDt, gender);

  const gz = c => pillars(c).join(' ');
  const s1 = scoreOf(gz(c1), mainDt);
  const s2 = scoreOf(gz(c2), nbDt);

  /* ── 逐项 diff（这八项就是参考报告 1.2 表的那八行）── */
  const rows = [];
  const add = (item, a, b, effect) => rows.push([item, a, b, effect]);

  add('时柱', pillars(c1)[3], pillars(c2)[3], pillars(c1)[3] === pillars(c2)[3] ? '不变' : '**变**（时柱及其直接所主全部待验）');
  add('时干十神', c1.shiShen.gan[3], c2.shiShen.gan[3], c1.shiShen.gan[3] === c2.shiShen.gan[3] ? '不变' : '**变**：时干十神 → 待验');
  const hideOf = c => {
    const z = pillars(c)[3][1];
    return P.ZHI_HIDE[z].map((g, i) => `${g}（${c.shiShen.zhi[3][i]}）`).join(' ');
  };
  add('时支藏干·十神', hideOf(c1), hideOf(c2),
    hideOf(c1) === hideOf(c2) ? '不变' : '**变**：子女宫、晚景取象 → 待验');
  const wxOf = c => {
    const w = WX_OF_ZHI[pillars(c)[3][1]];
    const n = guanShaCount(c);
    const shui = c.wuxing.count['水'];
    return `支属${w}；水 ${shui} 分；官杀 ${n} 处`;
  };
  add('时支五行与官杀', wxOf(c1), wxOf(c2), guanShaCount(c1) === guanShaCount(c2) ? '官杀处数同' : '官杀有无不同 → 子女/职位取象待验');
  const cs = c => P._diShi(c.dayGan, pillars(c)[3][1]);
  add('日主在时支的十二长生', cs(c1), cs(c2), cs(c1) === cs(c2) ? '不变' : '变：晚景之气 → 待验');
  const rel1 = relLines(c1), rel2 = relLines(c2);
  add('时支参与的六合/拱合', rel1.filter(x => /六合|三合/.test(x)).join('；') || '无',
    rel2.filter(x => /六合|三合/.test(x)).join('；') || '无', '属第④层色彩');
  add('时支参与的刑冲害破', rel1.filter(x => /冲|刑|害|破/.test(x)).join('；') || '无',
    rel2.filter(x => /冲|刑|害|破/.test(x)).join('；') || '无', '属第④层色彩');
  const ss1 = shenshaAt(c1, pillars(c1)[3][1]), ss2 = shenshaAt(c2, pillars(c2)[3][1]);
  add('时支神煞', ss1.join('、') || '无', ss2.join('、') || '无', '属色彩，且随时支而变 → 待验');

  /* ── 日界识别：23:00 那一侧不是普通时辰界，是「晚子时换日」的日界 ──
     普通时辰界只换时柱；日界连**日柱**一起换（本技能裁决：23:00 后归次日）。
     两者混为一谈，就会把「日主变了」写成「时柱待验」——那是整盘重推，不是降级一项。 */
  const crossedBound = distUp <= distLow ? upperBound : lowerBound;
  const isDayBoundary = crossedBound === 23;

  /* ── 骨架判定 ── */
  const sameGZ = ['年', '月', '日'].map((_, i) => pillars(c1)[i] === pillars(c2)[i]);
  const skeleton = [];
  skeleton.push(sameGZ.every(Boolean) ? '年月日三柱完全不动' : '**年月日柱有动**（须整盘重推）');
  skeleton.push(c1.dayGan === c2.dayGan ? `日主同为 ${c1.dayGan}（${P.GAN_WX[c1.dayGan]}）`
    : `**日主不同**（${c1.dayGan}${P.GAN_WX[c1.dayGan]} / ${c2.dayGan}${P.GAN_WX[c2.dayGan]}）`);
  skeleton.push(`月令同为 ${pillars(c1)[1][1]}、司令同（节后日数同）→ 取格不因时柱而变`);
  skeleton.push(`旺衰：同类占比 ${s1.ratio}% 对 ${s2.ratio}%（${s1.tong}/${s1.yi} 对 ${s2.tong}/${s2.yi}）`
    + (Math.abs(parseFloat(s1.ratio) - parseFloat(s2.ratio)) < 5 ? '——两盘同档' : '——**两盘可能不同档，须各判**'));

  const pending = [];
  pending.push('① 时柱本身及其直接所主（时干十神、子女宫、晚景）——两盘不同，须待验');
  if (guanShaCount(c1) !== guanShaCount(c2)) pending.push('② 官星有无（两盘不同）所对应的子女／职位取象');
  const yearDiff = [];
  pending.push('③ 依赖时支的流年结论（凡流年与该支成合／冲／会者，须逐年核后标注待验）');

  /* ── 输出 ── */
  const L = [];
  L.push(`── 时辰边界双盘对照 ──`);
  L.push(`  出生（北京时）：${dtStr.trim()}　性别：${gender === 1 ? '男' : '女'}　经度：${lon.toFixed(2)}°E`);
  L.push(`  经度差校正 ${(-dlonMin).toFixed(2)} 分　均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(2)} 分`);
  L.push(`  北京时 ${fmt(clock).slice(11)}（${scClock}时，距界 ${dist['北京时']} 秒）`);
  L.push(`  平太阳时 ${fmt(mean).slice(11)}（${scMean}时，距界 ${dist['平太阳时']} 秒）`);
  L.push(`  真太阳时 ${fmt(trueSolar).slice(11)}（${scTrue}时，距界 ${dist['真太阳时']} 秒）`);
  L.push(`  档位：${level}　${levelText}`);
  L.push('');
  L.push(`  主盘（${mainZhi}时）：${gz(c1)}　← 排盘时点 ${mainDt}`);
  L.push(`  对照盘（${nbZhi}时）：${gz(c2)}　← 排盘时点 ${nbDt}（${nbSide}相邻，代表钟点）`);
  L.push('');
  L.push('  项目 | 主盘 | 对照盘 | 对骨架的影响');
  rows.forEach(r => L.push('  ' + r.join(' | ')));
  L.push('');
  L.push('  骨架判定：' + skeleton.join('；'));
  L.push('  待验项（正文照写，但须标注「待验」）：');
  pending.forEach(p => L.push('    ' + p));
  if (isDayBoundary) {
    L.push('  ⚠ **此界是日界（23:00），不是普通时辰界**：跨过去不是「换一根时柱」，而是**换日柱**');
    L.push('    （本技能裁决：一天没有两个子时，23:00 后归次日）。故相邻盘的日主不同，');
    L.push('    骨架不可按「年月日三柱不动」直断——须先按 zi-shi-dayroll.md 裁准哪一盘，再往下推。');
    L.push('    核对法：本盘与「次日 00:10」应完全同盘（`paipan.js chart` 已内置，直接排原时刻即可）。');
  }
  if (level === '①') L.push('  ⚠ 档位①：两盘结论不一致者，一律以「两盘共有」为准，不得单盘直断。');
  L.push('  ⚠ 纪律：主盘直断的只有骨架；时柱直接所主（子女宫、晚景、时干十神、时支神煞）一律待验。');

  if (md) {
    const M2 = [];
    M2.push(`| 项目 | ${mainZhi}时盘（主盘） | ${nbZhi}时盘（对照） | 对骨架的影响 |`);
    M2.push('|---|---|---|---|');
    rows.forEach(r => M2.push('| ' + r.join(' | ') + ' |'));
    console.log(M2.join('\n'));
  } else {
    console.log(L.join('\n'));
  }
}

main();
