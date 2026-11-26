#!/usr/bin/env node
/**
 * suiyun.js —— 教学式「断岁运」推导器（只 require 本目录 paipan.js）
 *
 * 解决什么问题：坊间报告写岁运，多是一句「此运吉／此运凶」，**说不出「引动」是怎么发生的**。
 * 教学式报告要求把「大运流年**如何引动命局**」写出来，即：
 *   哪一个字 × 哪一个字 → 什么关系 → **被引动的是哪一柱** → 该柱/该字所主何事 → 该字十神为何。
 * 本脚本把这条链**逐项列成表**（可复算），并另做两件事：
 *   ① **填实检查**：命局／大运之间的「虚拱」逢流年填实（峰值之年最常出在这里）；
 *   ② **引动强度排序**：只作**参考**，不作判据（判据永远是「用神／相神是否到位」）。
 *
 * 用法：
 *   node suiyun.js dayun "<四柱>" "<大运干支>"
 *   node suiyun.js year  "<四柱>" "<大运干支>" "<流年干支>"
 *   node suiyun.js fill  "<四柱>" "<大运干支>"
 *   node suiyun.js scan  "<四柱>" "<生辰 YYYY-MM-DD HH:MM>" <性别1男0女> <年0> <年1>
 *   node suiyun.js roles                          # 打印「柱 → 宫位 → 所主」对照（固定表）
 *
 * 注：命令中的四柱与生辰均为**演示数据（虚构）**，不得换成真实命主资料。
 *     （见 SKILL.md 开头〈第一条维护纪律〉）
 */
const P = require('./paipan.js');

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GAN_WX = P.GAN_WX;
const ZHI_HIDE = P.ZHI_HIDE;
const POS = ['年柱', '月柱', '日柱', '时柱'];

/* 柱 → 宫位 → 所主（六亲与人生段落） */
const GONG = {
  年柱: '祖上宫／幼年（1—16 岁）；父母之外的环境与出身根基',
  月柱: '父母兄弟宫／青年（17—32 岁）；事业根基、家庭供养、同侪',
  日柱: '夫妻宫／中年（33—48 岁）；自身与配偶（女命为夫宫）',
  时柱: '子女宫／晚年（49 岁后）；子嗣、下属、晚景与寄托'
};

function parseChart(s) {
  const p = String(s).replace(/[,，、]/g, ' ').split(/\s+/).filter(Boolean);
  if (p.length !== 4) throw new Error('四柱格式应为「年柱 月柱 日柱 时柱」');
  return p.map(x => {
    if (x.length !== 2 || GAN.indexOf(x[0]) < 0 || ZHI.indexOf(x[1]) < 0) throw new Error('非法柱：' + x);
    return { gan: x[0], zhi: x[1] };
  });
}

function nodesOf(ch, extra = []) {
  const n = ch.map((p, i) => ({ label: POS[i][0], zhi: p.zhi, i, pillar: POS[i] }));
  extra.forEach(e => n.push({ label: e.label, zhi: e.zhi, pillar: e.label }));
  return n;
}

/* 某支在命局或运年中的「字」有哪些（含藏干） */
function zhiChars(node, dayGan) {
  return ZHI_HIDE[node.zhi].map((h, k) => ({
    h, k, ss: P.shiShen(dayGan, h), wx: GAN_WX[h],
    pos: node.pillar + node.zhi + (k === 0 ? '（本气）' : k === 1 ? '（中气）' : '（余气）')
  }));
}

/* ---------- 引动清单 ---------- */
function yindong(ch, dayun, liunian) {
  const day = ch[2].gan;
  const extra = [{ label: '运', zhi: dayun[1] }];
  if (liunian) extra.push({ label: '流年', zhi: liunian[1] });
  const ns = nodesOf(ch, extra);
  const r = P.relations(ns);
  const rows = [];
  const push = (rel, tag) => {
    const pillarOf = L => L === '运' ? '大运' : L === '流年' ? '流年' : L + '柱';
    const gongOf = pl => GONG[pl] || (pl === '大运'
      ? '十年之气候（运为「地」，主整体环境之冷暖）'
      : '一年之气候（年为「天」，主触发之机与兑现之期）');
    // 天干层：形如「年干辛 × 流年干丙 五合丙辛（…）」
    const mg = tag.match(/^(年|月|日|时|运|流年)干(.)\s*×\s*(年|月|日|时|运|流年)干(.)/);
    if (mg) {
      [[mg[1], mg[2]], [mg[3], mg[4]]].forEach(([L, G]) => {
        const pl = pillarOf(L);
        rows.push([rel, tag.replace(/（.*?）/, '（合则羁绊；无化神不轻论化）'),
          `${L}干${G}`, `${G}（${P.shiShen(day, G)}·天干，力显）`, pl, gongOf(pl), relScore(rel)]);
      });
      return;
    }
    const m = tag.match(/^(年|月|日|时|运|流年)(.)\s*×\s*(年|月|日|时|运|流年)(.)/);
    if (!m) { rows.push([rel, tag, '（复合局）', '—', '—', '—', 0]); return; }
    const [_, la, za, lb, zb] = m;
    const labelOf = x => x === '运' ? '运' : x === '流年' ? '流年' : x + '柱';
    [[la, za], [lb, zb]].forEach(([L, Z]) => {
      const pillar = pillarOf(L);
      const chars = ZHI_HIDE[Z].map((h, k) => `${h}（${P.shiShen(day, h)}·${k === 0 ? '本气' : k === 1 ? '中气' : '余气'}）`).join('、');
      rows.push([rel, tag, `${labelOf(L)}${Z}`, chars, pillar, gongOf(pillar), relScore(rel)]);
    });
  };
  ['冲', '六合', '三合', '三会', '刑', '自刑', '害', '破'].forEach(k => r[k].forEach(t => push(k, t)));

  // 天干层
  const gans = ch.map((p, i) => ({ label: POS[i][0] + '干', gan: p.gan, pillar: POS[i] }));
  gans.push({ label: '运干', gan: dayun[0], pillar: '大运' });
  if (liunian) gans.push({ label: '流年干', gan: liunian[0], pillar: '流年' });
  const gr = P.ganRelations(gans);
  gr.冲.forEach(t => push('天干相冲', t.replace(' × ', ' × ')));
  gr.合.forEach(t => push('天干五合', t.replace(' × ', ' × ')));
  gr.note.forEach(t => rows.push(['争合', t, '—', '—', '—', '被合者力分，合之者亦减力', 2]));

  const out = [];
  out.push(`── 引动清单（命局 × ${dayun} 运${liunian ? ' × ' + liunian + ' 年' : ''}）──`);
  out.push('  关系 | 作用双方 | 被引动之字 | 该字（十神·力气） | 落宫 | 所主事项 | 权重(参考)');
  if (!rows.length) out.push('  （本运与本局无任何冲合会刑害破，天干亦无合冲——**引动为空**：该十年以命局自身的静态结构论，不看外来变化）');
  rows.forEach(x => out.push('  ' + x.slice(0, 6).join(' | ') + ' | ' + x[6]));
  const total = rows.reduce((a, b) => a + b[6], 0);
  out.push(`  → 引动合计权重（**仅供参考，不作判据**）：${total}`);
  out.push('  ⚠ 判大运**必须先走四层权重**（judgment-core.md 第八节）：' +
    '① 用神／相神是否到位（定性质）→ ② 日主是否得根 → ③ 调候燥湿寒暖 → ④ 冲刑合害（**只作色彩**）。' +
    '上表是第④层的内容，**倒置顺序会把重要的十年判反**。');
  return out.join('\n');
}

function relScore(rel) {
  return { '冲': 5, '三会': 4, '六合': 3, '三合': 3, '刑': 2, '自刑': 1, '害': 1, '破': 1,
    '天干相冲': 4, '天干五合': 2 }[rel] || 1;
}

/* ---------- 填实检查（虚拱逢填实 = 峰值之年） ---------- */
const SANHE = [{ z: ['申', '子', '辰'], w: '水' }, { z: ['寅', '午', '戌'], w: '火' },
  { z: ['巳', '酉', '丑'], w: '金' }, { z: ['亥', '卯', '未'], w: '木' }];

function fill(ch, dayun) {
  const zs = ch.map(p => p.zhi).concat([dayun[1]]);
  const out = ['── 填实检查（虚拱逢填实即成局——峰值之年最常出在这里）──'];
  let any = false;
  SANHE.forEach(s => {
    const has = s.z.filter(z => zs.includes(z));
    if (has.length === 2 && !has.includes(s.z[1])) {
      any = true;
      out.push(`  ${has.join('')}拱${s.z[1]}（${s.w}局虚拱中神）：` +
        `**流年见「${s.z[1]}」即填实成 ${s.z.join('')}${s.w}局**——此年常为该运的峰值之年（吉则大吉，凶则大凶）。`);
    }
    if (s.z.every(z => zs.includes(z)) && !ch.map(p => p.zhi).every(z => s.z.includes(z))) {
      any = true;
      out.push(`  ${s.z.join('')}三合${s.w}局**已因大运而全**（命局不全、运来补足）：此运即成局，威力按整局论。`);
    }
  });
  if (!any) out.push('  本运无虚拱可填，亦未补足任何三合局——该十年以「用神到位与否」论，无「填实引爆」之事。');
  return out.join('\n');
}

/* ---------- 逐年扫描 ---------- */
function scan(ch, dt, gender, y0, y1) {
  const P2 = P.makeChart(dt, gender);
  const out = [`── 逐年引动扫描 ${y0}—${y1}（命局 ${ch.map(p => p.gan + p.zhi).join(' ')}）──`];
  out.push('  年 | 干支 | 运 | 引动项（关系｜被引动之字） | 天干层 | 权重');
  for (let y = y0; y <= y1; y++) {
    const d = P2.daYun.find(x => y >= x.getStartYear() && y <= x.getEndYear());
    if (!d) continue;
    const dz = d.getGanZhi();
    const ln = d.getLiuNian().find(x => x.getYear() === y);
    if (!ln) continue;
    const gz = ln.getGanZhi();
    const ns = nodesOf(ch, [{ label: '运', zhi: dz[1] }, { label: '流年', zhi: gz[1] }]);
    const r = P.relations(ns);
    const rel = [];
    ['冲', '六合', '三合', '三会', '刑', '自刑', '害', '破'].forEach(k => r[k].forEach(t => {
      if (t.includes('流年') || t.includes('运')) rel.push(`${k}:${t}`);
    }));
    const gans = ch.map((p, i) => ({ label: POS[i][0] + '干', gan: p.gan }));
    gans.push({ label: '运干', gan: dz[0] }, { label: '流年干', gan: gz[0] });
    const gr = P.ganRelations(gans);
    const gt = [];
    gr.冲.filter(t => t.includes('流年') || t.includes('运')).forEach(t => gt.push('冲:' + t));
    gr.合.filter(t => t.includes('流年') || t.includes('运')).forEach(t => gt.push('合:' + t));
    gr.note.forEach(t => gt.push('争合:' + t));
    let s = 0;
    rel.forEach(t => s += relScore(t.split(':')[0]));
    gt.forEach(t => s += t.startsWith('冲:') ? 4 : t.startsWith('合:') ? 2 : 2);
    out.push(`  ${y} | ${gz} | ${dz} | ${rel.length ? rel.join('；') : '—'} | ${gt.length ? gt.join('；') : '—'} | ${s}`);
  }
  out.push('  → 权重只是把「关系的大小」量化后的**排序参考**；真正的吉凶仍取决于被引动之字是**用神还是忌神**。');
  return out.join('\n');
}

/* ---------- 主入口 ---------- */
function main() {
  const a = process.argv.slice(2);
  const cmd = a[0];
  if (cmd === 'roles') {
    console.log('── 柱 → 宫位 → 所主（固定表，六亲与人生段落）──');
    Object.keys(GONG).forEach(k => console.log(`  ${k}：${GONG[k]}`));
    console.log('  大运：十年之气候（运为「地」，主整体环境之冷暖）');
    console.log('  流年：一年之气候（年为「天」，主触发之机与兑现之期）');
    return;
  }
  const chartStr = a[1];
  if (!chartStr) {
    console.log('用法：node suiyun.js dayun|year|fill|scan "<四柱>" [...]；node suiyun.js roles');
    return;
  }
  const ch = parseChart(chartStr);
  if (cmd === 'dayun') { console.log(yindong(ch, a[2]) + '\n\n' + fill(ch, a[2])); return; }
  if (cmd === 'year') { console.log(yindong(ch, a[2], a[3])); return; }
  if (cmd === 'fill') { console.log(fill(ch, a[2])); return; }
  if (cmd === 'scan') { console.log(scan(ch, a[2], Number(a[3] ?? 1), Number(a[4]), Number(a[5]))); return; }
  console.log('未知子命令：' + cmd);
}
main();
