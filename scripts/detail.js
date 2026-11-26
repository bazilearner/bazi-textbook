#!/usr/bin/env node
/**
 * detail.js — 教学式「盘面明细」生成器（零外部依赖，只 require 本目录 paipan.js）
 *
 * 解决什么问题：paipan.js 给的是「一行式摘要」（四柱、十神、五行一行字），
 * 但教学式/细致型报告需要的是**分层分栏的明细表**——五行要分「天干/支本气/藏干」三栏，
 * 十神要带配置表与统计，生克要逐对列出，刑冲合害会要**逐类核（含「无」）**，
 * 神煞要带**查法**，十二长生要带**宫意**。这些以前全靠手写，故报告一细就错。
 *
 * 用法：
 *   node detail.js all   "庚午 辛巳 庚辰 癸未"
 *   node detail.js all   "庚午 辛巳 庚辰 癸未" "1990-05-15 14:20" 1   # 生辰与性别各作一个参数，另出大运十神
 *   node detail.js wuxing|shishen|shengke|xingchong|changsheng|shensha|xunkong "<四柱>"
 *
 * 注：命令中的四柱与生辰均为**演示数据（虚构）**，不得换成真实命主资料。
 */
const P = require('./paipan.js');

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GAN_WX = P.GAN_WX;
const ZHI_HIDE = P.ZHI_HIDE;
const WX = ['木', '火', '土', '金', '水'];
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const POS = ['年柱', '月柱', '日柱', '时柱'];

/* ---------- 十二长生（阳顺阴逆） ---------- */
const CHANG = {
  甲: '亥子丑寅卯辰巳午未申酉戌', 乙: '午巳辰卯寅丑子亥戌酉申未',
  丙: '寅卯辰巳午未申酉戌亥子丑', 丁: '酉申未午巳辰卯寅丑子亥戌',
  戊: '寅卯辰巳午未申酉戌亥子丑', 己: '酉申未午巳辰卯寅丑子亥戌',
  庚: '巳午未申酉戌亥子丑寅卯辰', 辛: '子亥戌酉申未午巳辰卯寅丑',
  壬: '申酉戌亥子丑寅卯辰巳午未', 癸: '卯寅丑子亥戌酉申未午巳辰'
};
const CHANG_NAME = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
const CHANG_MEAN = {
  长生: '初生之始，有生机', 沐浴: '初试之地，多变未定', 冠带: '渐成规模，可自立',
  临官: '禄地，得位而能任事', 帝旺: '旺极之地，力最强而须防过',
  衰: '气始退，宜守', 病: '气弱，须扶', 死: '气尽而不动',
  墓: '造化收藏，埋于土', 绝: '气绝而待续', 胎: '后继之气结聚', 养: '受育而渐复'
};

/* ---------- 神煞查法（与 paipan.js 的算法对应） ---------- */
const SHENSHA_CHAFA = {
  '天乙贵人(日干)': '以日干查：甲戊庚见丑未；乙己见子申；丙丁见亥酉；辛见午寅；壬癸见卯巳',
  '天乙贵人(年干)': '以年干查，法同日干',
  '文昌贵人': '以日干查：甲巳 乙午 丙戊申 丁己酉 庚亥 辛子 壬寅 癸卯（本质为食神得禄）',
  '禄神': '日干之临官位：甲寅 乙卯 丙巳 丁午 戊巳 己午 庚申 辛酉 壬亥 癸子',
  '羊刃': '日干之帝旺位（阳干）：甲卯 丙午 戊午 庚酉 壬子。阴干无刃（一说有，流派不一）',
  '金舆': '日干禄前二位：甲辰 乙巳 丙未 丁申 戊未 己申 庚戌 辛亥 壬丑 癸寅',
  '国印贵人': '本气之克：甲戌 乙亥 丙丑 丁寅 戊丑 己寅 庚辰 辛巳 壬未 癸申',
  '国印贵人(年干)': '以年干查，法同日干',
  '太极贵人': '以日干查：甲乙子午；丙丁卯酉；戊己辰戌丑未；庚辛寅亥；壬癸巳申',
  '孤辰': '以年支查：亥子丑见寅；寅卯辰见巳；巳午未见申；申酉戌见亥',
  '寡宿': '以年支查：亥子丑见戌；寅卯辰见丑；巳午未见辰；申酉戌见未',
  '驿马': '年支（或日支）三合局之冲：申子辰见寅；寅午戌见申；巳酉丑见亥；亥卯未见巳',
  '桃花': '三合局之沐浴：申子辰见酉；寅午戌见卯；巳酉丑见午；亥卯未见子',
  '华盖': '三合局之墓：申子辰见辰；寅午戌见戌；巳酉丑见丑；亥卯未见未',
  '将星': '三合局之旺（中神）：申子辰见子；寅午戌见午；巳酉丑见酉；亥卯未见卯',
  '劫煞': '三合局之绝：申子辰见巳；寅午戌见亥；巳酉丑见寅；亥卯未见申（多无五行根据，只作色彩）',
  '亡神': '三合局之临官：申子辰见亥；寅午戌见巳；巳酉丑见申；亥卯未见寅（同劫煞，只作色彩）',
  '天德贵人': '以月支查天干：寅丁 卯申 辰壬 巳辛 午亥 未甲 申癸 酉寅 戌丙 亥乙 子巳 丑庚',
  '月德贵人(藏)': '以月支三合局查：寅午戌见丙；亥卯未见甲；申子辰见壬；巳酉丑见庚',
  '阴阳差错日': '固定日柱：丙子 丁丑 戊寅 辛卯 壬辰 癸巳 丙午 丁未 戊申 辛酉 壬戌 癸亥',
  '十恶大败日': '固定日柱：甲辰 乙巳 丙申 丁亥 戊戌 己丑 庚辰 辛巳 壬申 癸亥',
  '魁罡': '固定日柱：庚辰 庚戌 壬辰 戊戌',
  '天赦': '春戊寅、夏甲午、秋戊申、冬甲子'
};

function parseChart(s) {
  const p = String(s).replace(/[,，、]/g, ' ').split(/\s+/).filter(Boolean);
  if (p.length !== 4) throw new Error('四柱格式应为「年柱 月柱 日柱 时柱」');
  return p.map(x => {
    if (x.length !== 2 || GAN.indexOf(x[0]) < 0 || ZHI.indexOf(x[1]) < 0) throw new Error('非法柱：' + x);
    return { gan: x[0], zhi: x[1] };
  });
}

/* ============ 1. 五行分布（分栏计数） ============ */
function wuxing(ch) {
  const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const ganList = { 木: [], 火: [], 土: [], 金: [], 水: [] };
  const zhiList = { 木: [], 火: [], 土: [], 金: [], 水: [] };
  const hideList = { 木: [], 火: [], 土: [], 金: [], 水: [] };
  ch.forEach((p, i) => {
    ganList[GAN_WX[p.gan]].push(POS[i][0] + p.gan);
    c[GAN_WX[p.gan]] += 1;
    ZHI_HIDE[p.zhi].forEach((h, k) => {
      if (k === 0) { zhiList[GAN_WX[h]].push(POS[i][0] + p.zhi); c[GAN_WX[h]] += 1; }
      else { hideList[GAN_WX[h]].push(POS[i][0] + p.zhi + '藏' + h); c[GAN_WX[h]] += 0.5; }
    });
  });
  // ⚠ 这张表与 wangshuai.js 的「力量计分」用的是**两把尺子**，别混：
  //     本表（看「多少」· 粗口径）：干 1／支本气 1／**藏干（中气·余气）各 0.5**
  //     wangshuai.js（看「强弱」· 细口径）：干 1／日干本体 1／支本气 1／中气 0.5／余气 0.25；月支×2
  //   曾把本表标注写成「余气0.5」——既漏了中气、又与 SKILL.md 声明的 0.25 冲突，
  //   于是一份报告里出现两个「余气」权重，读者拿细口径去验本表，会误判「五行表算错了」。
  const out = ['── 五行分布（口径：**粗口径·看多少** —— 干1 / 支本气1 / **藏干(中·余)各0.5**；支本气与藏干不重复计）──'];
  out.push('   ⚠ 与「力量计分」口径（中气0.5／余气0.25、月支×2）不是一把尺子：两表**不可相加、不可互相核对**');
  out.push('  五行 | 天干 | 地支本气 | 藏干(中/余) | 合计');
  WX.forEach(w => {
    const g = ganList[w].join('、') || '—';
    const z = zhiList[w].join('、') || '—';
    const h = hideList[w].join('、') || '—';
    const tot = Math.round(c[w] * 10) / 10;
    out.push(`  ${w} | ${g} | ${z} | ${h} | ${tot}`);
  });
  const arr = WX.map(w => [w, Math.round(c[w] * 10) / 10]).sort((a, b) => b[1] - a[1]);
  const mx = arr[0][1], mn = arr[4][1];
  const maxNames = arr.filter(x => x[1] === mx).map(x => x[0] + x[1]);
  const minNames = arr.filter(x => x[1] === mn).map(x => x[0] + x[1]);
  out.push(`  → 最旺：${maxNames.join('、')}${maxNames.length > 1 ? '（并列）' : ''}` +
    `；最弱：${minNames.join('、')}${minNames.length > 1 ? '（并列，并列时无先后之分）' : ''}`);
  const mid = arr.filter(x => x[1] !== mx && x[1] !== mn).map(x => x[0] + x[1]);
  if (mid.length) out.push(`  → 居中：${mid.join('、')}`);
  const zero = WX.filter(w => c[w] === 0);
  if (zero.length) out.push('  ⚠ 全无之行：' + zero.join('、') + '（「不及」之最，取用时优先看）');
  return out.join('\n');
}

/* ============ 2. 十神配置 + 统计 ============ */
function shishen(ch) {
  const day = ch[2].gan;
  const out = ['── 十神配置 ──'];
  out.push('  位置 | 干支 | 干十神 | 支藏干（十神）');
  ch.forEach((p, i) => {
    const gs = i === 2 ? '日主' : P.shiShen(day, p.gan);
    const hs = ZHI_HIDE[p.zhi].map(h => h + '(' + P.shiShen(day, h) + ')').join(' ');
    out.push(`  ${POS[i]} | ${p.gan}${p.zhi} | ${gs} | ${hs}`);
  });
  const tally = {};
  const bump = n => tally[n] = (tally[n] || 0) + 1;
  ch.forEach((p, i) => {
    if (i !== 2) bump(P.shiShen(day, p.gan));
    ZHI_HIDE[p.zhi].forEach(h => bump(P.shiShen(day, h)));
  });
  const order = ['比肩', '劫财', '食神', '伤官', '正财', '偏财', '正官', '七杀', '正印', '偏印'];
  out.push('  → 十神统计：' + order.map(n => n + (tally[n] || 0)).join('  '));
  const miss = ['比肩', '劫财', '食神', '伤官', '正财', '偏财', '正官', '七杀', '正印', '偏印']
    .filter(n => !tally[n]);
  if (miss.length) out.push('  ⚠ 十神不全：缺 ' + miss.join('、') +
    '（传统认为在该十神所主的一面有所欠缺，须靠后天补足，属结构性描述，不作吉凶）');
  return out.join('\n');
}

/* ============ 3. 生克制化（逐对） ============ */
function shengke(ch) {
  const day = ch[2].gan;
  const rep = {};
  ch.forEach((p, i) => {
    // rank: 0=天干 1=地支本气 2=中气 3=余气（取代表字时优先用靠前的）
    const push = (w, s, r) => { (rep[w] = rep[w] || []).push({ s, r }); };
    push(GAN_WX[p.gan], POS[i][0] + p.gan, 0);
    ZHI_HIDE[p.zhi].forEach((h, k) => push(GAN_WX[h], POS[i][0] + p.zhi + '藏' + h, k === 0 ? 1 : k + 1));
  });
  const nm = w => {
    const L = (rep[w] || []).slice().sort((a, b) => a.r - b.r);
    const top = L.filter(x => x.r <= 1).map(x => x.s);
    const rest = L.filter(x => x.r > 1).map(x => x.s);
    const use = (top.length ? top : rest).slice(0, 4);
    return use.join('、') + (top.length && rest.length > 1 ? ' 等' : '');
  };
  const out = ['── 生克制化（逐对列出；只列命局中确实并存的两行）──'];
  WX.forEach(a => {
    if (!rep[a]) return;
    const bK = KE[a], bS = SHENG[a];
    if (rep[bK]) out.push(`  ${a}克${bK}：${nm(a)} 克 ${nm(bK)}`);
    if (rep[bS]) out.push(`  ${a}生${bS}：${nm(a)} 生 ${nm(bS)}`);
  });
  out.push('  提示：上列每条请自行补「对命局的影响」——判断标准只有一条：该作用对**用神**是有益还是受损。');
  return out.join('\n');
}

/* ============ 4. 刑冲合害会（逐类核，含「无」） ============ */
function xingchong(ch) {
  const r = P.relations(ch.map((p, i) => ({ label: POS[i][0], zhi: p.zhi })));
  const r2 = P.relations(ch.map((p, i) => ({ label: POS[i][0], zhi: p.zhi })), {});
  const out = ['── 刑冲合害会（逐类核，含「无」）──'];
  const item = (label, arr) => out.push(`  ${label}：${arr.length ? arr.join(' ； ') : '无'}`);
  item('六合', r.六合);
  item('三合（含半合/拱合）', r.三合);
  item('三会', r.三会);
  item('六冲', r.冲);
  item('刑', r.刑.concat(r.自刑));
  item('六害', r.害);
  item('相破', r.破);
  // 天干层 —— 一律调 paipan.js 的 ganRelations()，不在此另写一份
  //（曾经各脚本各写一份，导致「天干层」在不同报告里结论不一）
  const gans = ch.map((p, i) => ({ label: POS[i][0] + '干', gan: p.gan }));
  const gr = P.ganRelations(gans);
  out.push(`  天干五合：${gr.合.length ? gr.合.join(' ； ') : '无'}`);
  out.push(`  天干相冲：${gr.冲.length ? gr.冲.join(' ； ') : '无'}`);
  if (gr.note.length) out.push(`  提示（争合）：${gr.note.join(' ； ')}`);
  const hasChong = r.冲.length > 0, hasXing = r.刑.length > 0;
  const hasGan = gr.合.length > 0 || gr.冲.length > 0;
  let panxing;
  if (hasChong || hasGan) panxing = '动盘（命局自身已含对冲或天干合冲，有自发张力，不必全靠运年引动）';
  else if (hasXing) panxing = '半动盘（有刑无冲；张力为刑一类，属「缠绕」而非「对撞」）';
  else panxing = '静盘（天干无合无冲、地支无冲；破害只作轻者。一切事件须由运年引动）';
  out.push(`  → 盘性判定：${panxing}`);
  return out.join('\n');
}

/* ============ 5. 十二长生（逐支 + 宫意） ============ */
function changsheng(ch) {
  const day = ch[2].gan;
  const seq = CHANG[day];
  const out = [`── 十二长生（日干 ${day}，${GAN[GAN.indexOf(day)] && (GAN.indexOf(day) % 2 === 0 ? '阳' : '阴')}干顺逆按表）──`];
  ch.forEach((p, i) => {
    const idx = seq.indexOf(p.zhi);
    const name = idx >= 0 ? CHANG_NAME[idx] : '?';
    out.push(`  ${POS[i]} ${p.zhi} → ${name}（${CHANG_MEAN[name]}）`);
  });
  const lu = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
  const ren = { 甲: '卯', 乙: '辰', 丙: '午', 丁: '未', 戊: '午', 己: '未', 庚: '酉', 辛: '戌', 壬: '子', 癸: '丑' };
  const zg = ch.map(p => p.zhi);
  out.push(`  → 日主禄位 ${lu[day]}（命局${zg.includes(lu[day]) ? '有' : '全无'}）、刃位 ${ren[day]}（命局${zg.includes(ren[day]) ? '有' : '全无'}）`);
  if (!zg.includes(lu[day]) && !zg.includes(ren[day]))
    out.push('  ⚠ 日主全无禄刃之地 → 与「身弱」互为印证（无禄之人须自食其力）');
  return out.join('\n');
}

/* ============ 6. 旬空 ============ */
function xunkong(ch) {
  const day = ch[2].gan + ch[2].zhi;
  const XUN = [['甲子', '戌亥'], ['甲戌', '申酉'], ['甲申', '午未'], ['甲午', '辰巳'], ['甲辰', '寅卯'], ['甲寅', '子丑']];
  const gj = GAN.indexOf(ch[2].gan), zj = ZHI.indexOf(ch[2].zhi);
  const xunIdx = ((zj - gj) % 12 + 12) % 12;
  const out = [`── 旬空（以日柱 ${day} 取）──`];
  for (const [s, k] of XUN) {
    const g = GAN.indexOf(s[0]), z = ZHI.indexOf(s[1]);
    if (((zj - gj) % 12 + 12) % 12 === ((z - g) % 12 + 12) % 12) {
      out.push(`  日柱 ${day} 属 ${s}旬（${s}—…）→ 旬空：${k}`);
      const hit = ch.map((p, i) => k.includes(p.zhi) ? POS[i] + p.zhi : null).filter(Boolean);
      out.push(`  落点：${hit.length ? hit.join('、') : '四支无落空'}`);
      out.push('  取象：落空之支所主事物「有而不实」——吉神落空主「有此缘而不实」，须自己主动兑现；' +
        '空亡只减其力不灭其性，逢冲合填实可出空而显。不可单凭空亡定吉凶。');
      break;
    }
  }
  return out.join('\n');
}

/* ============ 7. 神煞（带查法） ============ */
function shensha(ch, chart) {
  if (!chart || !chart.shensha) return '（神煞需由 paipan.js makeChart 提供；此处请用 all 模式带生辰）';
  const out = ['── 神煞（带查法；只取有五行根据者）──'];
  out.push('  神煞 | 查法 | 落点');
  chart.shensha.forEach(s => {
    out.push(`  ${s.name} | ${SHENSHA_CHAFA[s.name] || '（查法见表）'} | ${s.zhi}（基：${s.base}）`);
  });
  out.push('  纪律：神煞只作色彩，不单独定吉凶，优先级永远低于 L4。');
  return out.join('\n');
}

/* ============ all ============ */
function main() {
  const a = process.argv.slice(2);
  const cmd = a[0];
  const chartStr = a[1];
  if (!chartStr) {
    console.log('用法：node detail.js all|wuxing|shishen|shengke|xingchong|changsheng|xunkong|shensha "<四柱>" [出生"YYYY-MM-DD HH:MM"] [性别1男0女]');
    return;
  }
  const ch = parseChart(chartStr);
  let chart = null;
  if (a[2] && a[3] !== undefined) {
    try { chart = P.makeChart(a[2], Number(a[3])); } catch (e) { chart = null; }
  }
  const blocks = {
    wuxing: () => wuxing(ch),
    shishen: () => shishen(ch),
    shengke: () => shengke(ch),
    xingchong: () => xingchong(ch),
    changsheng: () => changsheng(ch),
    xunkong: () => xunkong(ch),
    shensha: () => shensha(ch, chart)
  };
  if (cmd === 'all') {
    console.log('四柱：' + chartStr);
    WX && ['wuxing', 'shishen', 'shengke', 'xingchong', 'changsheng', 'xunkong'].forEach(k => {
      console.log('\n' + blocks[k]());
    });
    if (chart) {
      console.log('\n' + blocks.shensha());
      console.log('\n── 大运（含十神）──');
      chart.daYun.forEach((d, i) => {
        const g = d.getGanZhi();
        console.log(`  ${g}  ${d.getStartYear()}-${d.getEndYear()}  ${d.getStartAge()}-${d.getEndAge()}岁  ` +
          `干[${P.shiShen(ch[2].gan, g[0])}] 支[${ZHI_HIDE[g[1]].map(h => P.shiShen(ch[2].gan, h)).join(',')}]`);
      });
    }
  } else if (blocks[cmd]) {
    console.log(blocks[cmd]());
  } else {
    console.log('未知子命令：' + cmd);
  }
}
main();
