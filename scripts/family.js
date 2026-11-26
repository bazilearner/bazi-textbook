#!/usr/bin/env node
/**
 * 家庭成员合参：夫妻合婚 / 亲子缘分 / 全家喜用交集 / 跨盘地支关系
 * 用法：
 *   1) 命令行直接给八字典（示例为虚构数据）：
 *        node family.js "<称谓A>:庚午 辛巳 庚辰 癸未" "<称谓B>:乙丑 己卯 丁酉 甲辰"
 *   2) 或先 node paipan.js chart 取四柱后粘贴过来
 *   2) 或先 node paipan.js chart 取四柱后粘贴过来
 *
 * 判读要点（合参只看三样，别过度解读）：
 *   A. 日柱互看：天干相合/相生/相克、地支合冲刑害 —— 夫妻宫质量
 *   B. 日主互生：一方日主是另一方喜用神 → 缘分深、能补益
 *   C. 跨盘会局：两盘地支凑成三合/三会/三刑 → 家庭气场聚散
 * 全部输出都是「民俗象」，不作吉凶断语，尤其不预言离散。
 */
const { relations, shiShen, ZHI_HIDE, GAN_WX } = require('./paipan.js');

const argv = process.argv.slice(2);
if (!argv.length) {
  console.log('用法：node family.js "称谓:年柱 月柱 日柱 时柱" ["称谓:..." ...]');
  process.exit(0);
}

const members = argv.map(s => {
  const i = s.indexOf(':');
  const name = s.slice(0, i);
  const p = s.slice(i + 1).trim().split(/\s+/);
  return { name, pillars: p, year: p[0], month: p[1], day: p[2], time: p[3], dayGan: p[2][0] };
});

console.log('=== 成员总览 ===');
const GA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function wuxing(p) {
  const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  [p[0], p[1], p[2], p[3]].forEach(gz => {
    c[GAN_WX[gz[0]]] += 1;
    ZHI_HIDE[gz[1]].forEach((h, i) => c[GAN_WX[h]] += (i === 0 ? 1 : 0.5));
  });
  return c;
}
const WX = members.map(m => {
  const c = wuxing(m.pillars);
  console.log(`${m.name.padEnd(6)} ${m.pillars.join(' ')}   日主${m.dayGan}(${GAN_WX[m.dayGan]})   五行 ` +
    Object.entries(c).map(([k, v]) => k + v).join(' '));
  return c;
});

console.log('\n=== 五行喜用交集（取五行计数最低的两项为「宜」，最高一项为「忌」） ===');
const tally = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
WX.forEach(c => Object.keys(tally).forEach(k => tally[k] += c[k]));
console.log('全盘合计：' + Object.entries(tally).map(([k, v]) => k + v).join(' '));
const sorted = Object.entries(tally).sort((a, b) => a[1] - b[1]);
console.log('全盘偏少：' + sorted.slice(0, 2).map(x => x[0]).join('、') + ' ；偏多：' + sorted.slice(-1)[0][0]);

console.log('\n=== 两两合参 ===');
for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
  const A = members[i], B = members[j];
  const gA = A.dayGan, gB = B.dayGan;
  const sAB = shiShen(gA, gB), sBA = shiShen(gB, gA);
  // 日干支关系
  const g = members.length;
  const nodes = [];
  [['年', 'year'], ['月', 'month'], ['日', 'day'], ['时', 'time']].forEach(([lbl, key]) => {
    nodes.push({ label: A.name + lbl, zhi: A[key][1], grp: i });
    nodes.push({ label: B.name + lbl, zhi: B[key][1], grp: j });
  });
  const r = relations(nodes, { crossOnly: true });
  const pair = Object.entries(r).filter(([, v]) => v.length)
    .map(([k, v]) => k + '：' + v.join('、'));
  console.log(`\n【${A.name} × ${B.name}】`);
  console.log(`  日主：${A.name}${gA}(${GAN_WX[gA]}) → ${B.name}${gB} 为「${sAB}」；反之「${sBA}」`);
  console.log(`  日柱：${A.day} / ${B.day}`);
  console.log(`  跨盘地支关系：${pair.join(' ； ') || '无直接刑冲合害'}`);
}
