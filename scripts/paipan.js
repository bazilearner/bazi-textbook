#!/usr/bin/env node
/**
 * 八字全流程排盘引擎
 * 用法：
 *   node paipan.js chart "1990-05-15 14:20" 1
 *   node paipan.js full  "1990-05-15 14:20" 1 2026 2038
 *   node paipan.js rel   "庚午 辛巳 庚辰 癸未" 壬午 丙午
 * 参数：性别 1=男 0=女
 * 依赖：lunar-typescript（装在 node 工作区；见 SKILL.md「前置：依赖」）
 * 运行：NODE_PATH=<bin>/node/workspace/node_modules node paipan.js ...
 * 注：以上命例为演示用虚构数据，非任何真实命主。
 */
const { Solar } = require('lunar-typescript');

const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const GAN_WX = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
const GAN_YY = {甲:1,乙:0,丙:1,丁:0,戊:1,己:0,庚:1,辛:0,壬:1,癸:0}; // 1=阳
const ZHI_HIDE = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'], 卯:['乙'],
  辰:['戊','乙','癸'], 巳:['丙','庚','戊'], 午:['丁','己'], 未:['己','丁','乙'],
  申:['庚','壬','戊'], 酉:['辛'], 戌:['戊','辛','丁'], 亥:['壬','甲']
};

/** 十神：以日干为我，论目标干的十神 */
function shiShen(dayGan, target) {
  const me = GAN_WX[dayGan], it = GAN_WX[target];
  const same = GAN_YY[dayGan] === GAN_YY[target];
  const sheng = {木:'火',火:'土',土:'金',金:'水',水:'木'};
  const ke = {木:'土',土:'水',水:'火',火:'金',金:'木'};
  if (me === it) return same ? '比肩' : '劫财';
  if (sheng[me] === it) return same ? '食神' : '伤官';
  if (ke[me] === it) return same ? '偏财' : '正财';
  if (ke[it] === me) return same ? '七杀' : '正官';
  return same ? '偏印' : '正印';
}

/* ---------------- 神煞表 ---------------- */
const TIANYI = {甲:'丑未',戊:'丑未',庚:'丑未',乙:'子申',己:'子申',丙:'亥酉',丁:'亥酉',辛:'午寅',壬:'卯巳',癸:'卯巳'};
const WENCHANG = {甲:'巳',乙:'午',丙:'申',丁:'酉',戊:'申',己:'酉',庚:'亥',辛:'子',壬:'寅',癸:'卯'};
const LUSHEN = {甲:'寅',乙:'卯',丙:'巳',丁:'午',戊:'巳',己:'午',庚:'申',辛:'酉',壬:'亥',癸:'子'};
const JINYU = {甲:'辰',乙:'巳',丙:'未',丁:'申',戊:'未',己:'申',庚:'戌',辛:'亥',壬:'丑',癸:'寅'};
const GUOYIN = {甲:'戌',乙:'亥',丙:'丑',丁:'寅',戊:'丑',己:'寅',庚:'辰',辛:'巳',壬:'未',癸:'申'};
const TAICHI = {甲:'子午',乙:'子午',丙:'卯酉',丁:'卯酉',戊:'辰戌丑未',己:'辰戌丑未',庚:'寅亥',辛:'寅亥',壬:'巳申',癸:'巳申'};
const YANGREN = {甲:'卯',丙:'午',戊:'午',庚:'酉',壬:'子'};
const TIANDE = {寅:'丁',卯:'申',辰:'壬',巳:'辛',午:'亥',未:'甲',申:'癸',酉:'寅',戌:'丙',亥:'乙',子:'巳',丑:'庚'};
const YUEDE = {寅:'丙',午:'丙',戌:'丙',申:'壬',子:'壬',辰:'壬',亥:'甲',卯:'甲',未:'甲',巳:'庚',酉:'庚',丑:'庚'};
const YINYANG_CUO = ['丙子','丁丑','戊寅','辛卯','壬辰','癸巳','丙午','丁未','戊申','辛酉','壬戌','癸亥'];
const SHIE_DABAI = ['甲辰','乙巳','丙申','丁亥','戊戌','己丑','庚辰','辛巳','壬申','癸亥'];
const KUIGANG = ['庚辰','庚戌','壬辰','戊戌'];

function sanheGroup(z) { // 三合局归属
  if ('申子辰'.includes(z)) return '水';
  if ('寅午戌'.includes(z)) return '火';
  if ('巳酉丑'.includes(z)) return '金';
  if ('亥卯未'.includes(z)) return '木';
  return '';
}
const YIMA = {水:'寅',火:'申',金:'亥',木:'巳'};
const TAOHUA = {水:'酉',火:'卯',金:'午',木:'子'};
const HUAGAI = {水:'辰',火:'戌',金:'丑',木:'未'};
const JIANGXING = {水:'子',火:'午',金:'酉',木:'卯'};
const JIESHA = {水:'巳',火:'亥',金:'寅',木:'申'};
const WANGSHEN = {水:'亥',火:'巳',金:'申',木:'寅'};
function guChen(yearZhi) {
  const g = '亥子丑'.includes(yearZhi) ? ['寅','戌']
    : '寅卯辰'.includes(yearZhi) ? ['巳','丑']
    : '巳午未'.includes(yearZhi) ? ['申','辰'] : ['亥','未'];
  return {孤辰:g[0], 寡宿:g[1]};
}
function tianShe(dayGanZhi, monthZhi) {
  const season = '寅卯辰'.includes(monthZhi) ? '春' : '巳午未'.includes(monthZhi) ? '夏'
    : '申酉戌'.includes(monthZhi) ? '秋' : '冬';
  const map = {春:'戊寅',夏:'甲午',秋:'戊申',冬:'甲子'};
  return map[season] === dayGanZhi;
}

/** 神煞：年柱与日柱各起一遍（传统上两套都看） */
function shenSha(p) {
  const y = p.year, m = p.month, d = p.day, t = p.time;
  const zg = [y[1], m[1], d[1], t[1]];
  const gz = [y, m, d, t];
  const dayGan = d[0], yearZhi = y[1];
  const out = [];
  const push = (name, v, base) => out.push({ name, zhi: v, base });
  const hit = (set, name, base) => set.split('').forEach(z => { if (zg.includes(z)) push(name, z, base); });

  hit(TIANYI[dayGan], '天乙贵人(日干)', '日干');
  hit(TIANYI[y[0]], '天乙贵人(年干)', '年干');
  hit(WENCHANG[dayGan], '文昌贵人', '日干');
  hit(LUSHEN[dayGan], '禄神', '日干');
  if (YANGREN[dayGan]) hit(YANGREN[dayGan], '羊刃', '日干');
  hit(JINYU[dayGan], '金舆', '日干');
  hit(GUOYIN[dayGan], '国印贵人', '日干');
  hit(GUOYIN[y[0]], '国印贵人(年干)', '年干');
  hit(TAICHI[dayGan], '太极贵人', '日干');
  const [gc, gs] = [guChen(yearZhi).孤辰, guChen(yearZhi).寡宿];
  if (zg.includes(gc)) push('孤辰', gc, '年支');
  if (zg.includes(gs)) push('寡宿', gs, '年支');
  const yg = sanheGroup(yearZhi), dg = sanheGroup(d[1]);
  [['年支', yg], ['日支', dg]].forEach(([base, g]) => {
    if (!g) return;
    if (zg.includes(YIMA[g])) push('驿马', YIMA[g], base);
    if (zg.includes(TAOHUA[g])) push('桃花', TAOHUA[g], base);
    if (zg.includes(HUAGAI[g])) push('华盖', HUAGAI[g], base);
    if (zg.includes(JIANGXING[g])) push('将星', JIANGXING[g], base);
    if (zg.includes(JIESHA[g])) push('劫煞', JIESHA[g], base);
    if (zg.includes(WANGSHEN[g])) push('亡神', WANGSHEN[g], base);
  });
  if (TIANDE[m[1]] === dayGan) push('天德贵人', '日干', '月支');
  if (YUEDE[m[1]]) { zg.forEach(z => { if (ZHI_HIDE[z].includes(YUEDE[m[1]])) push('月德贵人(藏)', z, '月支'); }); }
  if (YINYANG_CUO.includes(d)) push('阴阳差错日', d, '日柱');
  if (SHIE_DABAI.includes(d)) push('十恶大败日', d, '日柱');
  if (KUIGANG.includes(d)) push('魁罡', d, '日柱');
  if (tianShe(d, m[1])) push('天赦', d, '日柱');
  // 去重
  const seen = new Set(); const uniq = [];
  for (const x of out) { const k = x.name + x.zhi; if (!seen.has(k)) { seen.add(k); uniq.push(x); } }
  return uniq;
}

/* ---------------- 关系运算 ---------------- */
const CHONG = [['子','午'],['丑','未'],['寅','申'],['卯','酉'],['辰','戌'],['巳','亥']];
const HE6 = [['子','丑'],['寅','亥'],['卯','戌'],['辰','酉'],['巳','申'],['午','未']];
const SANHE = [{ z:['申','子','辰'], w:'水' }, { z:['寅','午','戌'], w:'火' }, { z:['巳','酉','丑'], w:'金' }, { z:['亥','卯','未'], w:'木' }];
const SANHUI = [{ z:['寅','卯','辰'], w:'木' }, { z:['巳','午','未'], w:'火' }, { z:['申','酉','戌'], w:'金' }, { z:['亥','子','丑'], w:'水' }];
const XING = [
  { z:['寅','巳','申'], n:'无恩之刑' },
  { z:['丑','戌','未'], n:'恃势之刑' },
  { z:['子','卯'], n:'无礼之刑' }
];
const ZIXING = ['辰','午','酉','亥'];
const HAI6 = [['子','未'],['丑','午'],['寅','巳'],['卯','辰'],['申','亥'],['酉','戌']];
const PO6 = [['子','酉'],['丑','辰'],['寅','亥'],['卯','午'],['巳','申'],['未','戌']];
const mk = (a, b) => [a, b].sort().join('');

/**
 * 组合关系运算。传入 {label, zhi} 数组（可含命局四支、大运、流年、他盘）。
 */
function relations(nodes, opts = {}) {
  const res = { 冲: [], 六合: [], 三合: [], 三会: [], 刑: [], 自刑: [], 害: [], 破: [] };
  const detail = opts.detail !== false;
  const crossOnly = !!opts.crossOnly;      // true 时只算来自不同 grp 的两两关系
  const N = nodes;
  const ok = (a, b) => !crossOnly || a.grp === undefined || b.grp === undefined || a.grp !== b.grp;
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
    const a = N[i], b = N[j];
    if (!ok(a, b)) continue;
    const k = mk(a.zhi, b.zhi);
    const tag = `${a.label}${a.zhi} × ${b.label}${b.zhi}`;
    if (CHONG.some(p => mk(p[0], p[1]) === k)) res.冲.push(tag);
    if (HE6.some(p => mk(p[0], p[1]) === k)) res.六合.push(tag);
    if (XING.some(x => x.z.length === 3 && [mk(x.z[0], x.z[1]), mk(x.z[1], x.z[2]), mk(x.z[0], x.z[2])].includes(k)))
      res.刑.push(tag + '（' + XING.find(x => x.z.length === 3 && x.z.includes(a.zhi) && x.z.includes(b.zhi)).n + '）');
    if (k === mk('子', '卯')) res.刑.push(tag + '（无礼之刑）');
    if (a.zhi === b.zhi && ZIXING.includes(a.zhi)) res.自刑.push(tag);
    if (HAI6.some(p => mk(p[0], p[1]) === k)) res.害.push(tag);
    if (PO6.some(p => mk(p[0], p[1]) === k)) res.破.push(tag);
  }
  // 三合 / 三会 / 三刑全 —— 跨盘时不重复统计同一人内部
  const zset = N.map(x => x.zhi);
  const span = (s) => {   // 该局涉及的 grp 数（无 grp 视为同一组）
    const gs = new Set(N.filter(x => s.includes(x.zhi)).map(x => x.grp === undefined ? '_' : x.grp));
    return { has: s.filter(z => zset.includes(z)), grps: gs };
  };
  SANHE.forEach(s => {
    const { has, grps } = span(s.z);
    if (s.z.every(z => zset.includes(z)) && (!crossOnly || grps.size > 1))
      res.三合.push(`${s.z.join('')}三合${s.w}局：` + N.filter(x => s.z.includes(x.zhi)).map(x => x.label + x.zhi).join('、'));
  });
  SANHUI.forEach(s => {
    const { has, grps } = span(s.z);
    if (s.z.every(z => zset.includes(z)) && (!crossOnly || grps.size > 1))
      res.三会.push(`${s.z.join('')}三会${s.w}方：` + N.filter(x => s.z.includes(x.zhi)).map(x => x.label + x.zhi).join('、'));
  });
  SANHE.forEach(s => { // 半合（含中神）／拱合（缺中神，虚拱）
    const mid = s.z[1], has = s.z.filter(z => zset.includes(z));
    if (s.z.every(z => zset.includes(z)) || has.length !== 2) return;
    const cross = !crossOnly || span(has).grps.size > 1;
    if (!cross) return;
    if (has.includes(mid))
      res.三合.push(`${has.join('')}半合${s.w}（缺${s.z.find(z => !zset.includes(z))}）`);
    else
      res.三合.push(`${has.join('')}拱合${s.w}（虚拱${mid}，力弱）`);
  });
  XING.forEach(x => { // 三刑全
    if (x.z.length === 3 && x.z.every(z => zset.includes(z)))
      res.刑.push(`${x.z.join('')}三刑全（${x.n}）`);
  });
  XING.filter(x => x.z.length === 3).forEach(x => {
    for (let i = 0; i < x.z.length; i++) for (let j = i + 1; j < x.z.length; j++) {
      const k2 = mk(x.z[i], x.z[j]);
      if (zset.includes(x.z[i]) && zset.includes(x.z[j]) && !x.z.every(z => zset.includes(z))
          && (!crossOnly || (() => { const g = span([x.z[i], x.z[j]]); return g.grps.size > 1; })()))
        res.刑.push(`${x.z[i]}${x.z[j]}相刑（${x.n}不全）`);
    }
  });
  ['自刑'].forEach(() => { });
  Object.keys(res).forEach(k => { res[k] = [...new Set(res[k])]; });
  return res;
}

/* ---------------- 天干关系（运/年 vs 命局，必须单独算） ---------------- */
const GAN_HE5 = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
const GAN_CHONG4 = [['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸']]; // 戊己居中，无冲

/**
 * 天干层的关系运算——地支那一套管不到这里，而运年的天干合冲往往是应期的关键
 * （例：流年甲冲命局庚＝直冲财星/父星；大运乙合命局庚＝合去印星）。
 * 传入 [{label, gan}]，label 如「年干」「运干」「流年干」。
 */
function ganRelations(gans) {
  const 合 = [], 冲 = [], note = [];
  for (let i = 0; i < gans.length; i++) {
    for (let j = i + 1; j < gans.length; j++) {
      const a = gans[i], b = gans[j];
      const tag = (x, y) => `${x.label}${x.gan} × ${y.label}${y.gan}`;
      if (GAN_HE5.some(p => (p[0] === a.gan && p[1] === b.gan) || (p[1] === a.gan && p[0] === b.gan))) {
        const w = GAN_HE5.find(p => p.includes(a.gan) && p.includes(b.gan));
        // 化气：以日主与所化之行的关系判其得失，但只作提示，不轻论化
        const hua = { 甲己: '土', 乙庚: '金', 丙辛: '水', 丁壬: '木', 戊癸: '火' };
        const key = w.join('');
        const k2 = hua[key] || hua[[...key].reverse().join('')];
        合.push(`${tag(a, b)} 五合${key}（若化则作${k2}论，须有化神；无化神只论「合则羁绊，贪合减力」）`);
      }
      if (GAN_CHONG4.some(p => (p[0] === a.gan && p[1] === b.gan) || (p[1] === a.gan && p[0] === b.gan)))
        冲.push(`${tag(a, b)} 相冲（同性克，力大且不留情）`);
    }
  }
  // 争合：同一字被两处以上合，被合者力分（同字之间不构成合，须排除）
  gans.forEach(x => {
    const hit = gans.filter(y => y !== x && y.gan !== x.gan &&
      GAN_HE5.some(p => p.includes(x.gan) && p.includes(y.gan)));
    if (hit.length >= 2) note.push(`「${x.label}${x.gan}」被 ${hit.length} 处争合（${hit.map(h => h.label + h.gan).join('、')}）——被合者力分，合之者亦减力。`);
  });
  return { 合: [...new Set(合)], 冲: [...new Set(冲)], note: [...new Set(note)] };
}

/* ---------------- 人元用事（节气分野）——唯一定义处 ----------------
   wangshuai.js 与 geju.js 都调这里，**不得各写一份**（曾因重复实现，
   两处对同一命盘算出不同的司令之神）。
   ⚠ 坑：lunar-typescript 的 getJieQiTable() 里「上一个农历年的节气」用拼音大写键
   （DA_XUE/DONG_ZHI/XIAO_HAN/DA_HAN/LI_CHUN/YU_SHUI），与中文键**同名不同年**。
   若把两者都当同名处理并取「最后一个」，会取到次年那个 → 节后天数算成负数 → 司令为空。
   正确做法：**在所有同名候选中，取「不晚于出生时刻」的那个（即最近的）**。 */
const RENYUAN = {
  寅: [['戊', 7], ['丙', 7], ['甲', 16.5]], 卯: [['甲', 7], ['乙', 23]],
  辰: [['乙', 7], ['癸', 7], ['戊', 16.5]], 巳: [['戊', 7], ['庚', 7], ['丙', 16.5]],
  午: [['丙', 7], ['己', 7], ['丁', 16.5]], 未: [['丁', 7], ['乙', 7], ['己', 16.5]],
  申: [['戊', 7], ['壬', 7], ['庚', 16.5]], 酉: [['庚', 7], ['辛', 23]],
  戌: [['辛', 7], ['丁', 7], ['戊', 16.5]], 亥: [['戊', 7], ['甲', 7], ['壬', 16.5]],
  子: [['壬', 7], ['癸', 23]], 丑: [['癸', 7], ['辛', 7], ['己', 16.5]]
};
const JIE_OF_MONTH = { 寅: '立春', 卯: '惊蛰', 辰: '清明', 巳: '立夏', 午: '芒种', 未: '小暑',
  申: '立秋', 酉: '白露', 戌: '寒露', 亥: '立冬', 子: '大雪', 丑: '小寒' };
const JIEQI_ALIAS = { DA_XUE: '大雪', DONG_ZHI: '冬至', XIAO_HAN: '小寒', DA_HAN: '大寒',
  LI_CHUN: '立春', YU_SHUI: '雨水' };
const KU_MONTH = '辰戌丑未';

/**
 * 求「月支所对应的那个节」在出生前的最近一次交节，及节后天数、当值人元。
 * @param {string} dt 出生「YYYY-MM-DD HH:MM」
 * @param {string} monthZhi 月支
 * @returns {{gan:string, day:number, jie:string, jieTime:string}|null}
 */
function renYuan(dt, monthZhi) {
  if (!dt || !RENYUAN[monthZhi]) return null;
  try {
    const [d, t] = String(dt).split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    const solar = Solar.fromYmdHms(Y, M, D, h, mi, 0);
    const tbl = solar.getLunar().getJieQiTable();
    const target = JIE_OF_MONTH[monthZhi];
    const bornMs = Date.UTC(Y, M - 1, D, h, mi, 0);
    let best = null;
    Object.keys(tbl).forEach(k => {
      const nm = JIEQI_ALIAS[k] || k;
      if (nm !== target || !tbl[k]) return;
      const s = tbl[k];
      const ms = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
      if (ms > bornMs) return;                       // 交节晚于出生 → 不是它
      if (!best || ms > best.ms) best = { ms, s, nm };  // 同名候选取最近的
    });
    if (!best) return null;
    const idx = Math.floor((bornMs - best.ms) / 86400000) + 1;
    if (idx < 1) return null;
    const seg = RENYUAN[monthZhi];
    let acc = 0, hit = seg[seg.length - 1][0];
    for (const [g, n] of seg) { acc += n; if (idx <= acc) { hit = g; break; } }
    return { gan: hit, day: idx, jie: best.nm, jieTime: best.s.toYmdHms() };
  } catch (e) { return null; }
}

/** 旺相休囚死：以月令之五行为「我」——当令者旺、令生者相、生令者休、克令者囚、令克者死 */
function wangXiang(monthWx) {
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  const m = {};
  m[monthWx] = '旺';
  m[SHENG[monthWx]] = '相';
  m[Object.keys(SHENG).find(k => SHENG[k] === monthWx)] = '休';
  m[Object.keys(KE).find(k => KE[k] === monthWx)] = '囚';
  m[KE[monthWx]] = '死';
  return m;
}

/* ---------------- 主排盘 ---------------- */
function makeChart(dt, gender) {
  const [d, t] = dt.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const solar = Solar.fromYmdHms(Y, M, D, h, mi, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  const p = { year: ec.getYear(), month: ec.getMonth(), day: ec.getDay(), time: ec.getTime() };
  const dayGan = p.day[0];
  const yun = ec.getYun(gender);
  const daYun = yun.getDaYun().filter(x => x.getGanZhi());
  return {
    solar: solar.toYmdHms(), lunar: lunar.toString(), gender, p, ec, dayGan, yun, daYun,
    wuxing: countWuXing(p),
    shiShen: {
      gan: [p.year[0], p.month[0], dayGan, p.time[0]].map(g => g === dayGan ? '日主' : shiShen(dayGan, g)),
      zhi: [p.year[1], p.month[1], p.day[1], p.time[1]].map(z => ZHI_HIDE[z].map(h2 => shiShen(dayGan, h2)))
    },
    shensha: shenSha(p)
  };
}

function countWuXing(p) {
  const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const w = { 木: [], 火: [], 土: [], 金: [], 水: [] };
  const pillars = [['年', p.year], ['月', p.month], ['日', p.day], ['时', p.time]];
  for (const [nm, gz] of pillars) {
    const g = gz[0];
    c[GAN_WX[g]]++; w[GAN_WX[g]].push(nm + '干' + g);
    ZHI_HIDE[gz[1]].forEach((hg, i) => {
      const weight = i === 0 ? 1 : 0.5;
      c[GAN_WX[hg]] += weight; w[GAN_WX[hg]].push(nm + '支' + gz[1] + '藏' + hg);
    });
  }
  return { count: c, where: w };
}

function printChart(c) {
  const { p, ec, dayGan } = c;
  const gz = [p.year, p.month, p.day, p.time];
  console.log(`公历 ${c.solar} ｜ 农历 ${c.lunar} ｜ ${c.gender === 1 ? '男' : '女'}`);
  console.log(`四柱：${gz.join('　')}`);
  console.log(`干十神：${c.shiShen.gan.join('　')}`);
  console.log(`支藏干：` + [p.year, p.month, p.day, p.time].map(z => ZHI_HIDE[z[1]].join('')).join('　'));
  console.log(`支十神：` + c.shiShen.zhi.map(a => '[' + a.join(',') + ']').join(' '));
  console.log(`纳音：${[ec.getYearNaYin(), ec.getMonthNaYin(), ec.getDayNaYin(), ec.getTimeNaYin()].join('　')}`);
  console.log(`地势：年${ec.getYearDiShi()} 月${ec.getMonthDiShi()} 日${ec.getDayDiShi()} 时${ec.getTimeDiShi()}`);
  console.log(`旬空：年${ec.getYearXunKong()} 月${ec.getMonthXunKong()} 日${ec.getDayXunKong()} 时${ec.getTimeXunKong()}`);
  console.log(`胎元${ec.getTaiYuan()} 命宫${ec.getMingGong()} 身宫${ec.getShenGong()}`);
  const ws = countWuXing(p).count;
  console.log(`五行：` + Object.entries(ws).map(([k, v]) => `${k}${v}`).join(' '));
  console.log(`神煞：` + c.shensha.map(s => s.name + s.zhi + `(${s.base})`).join('、'));
  console.log(`大运（起运 ${c.yun.getStartYear()}年${c.yun.getStartMonth()}月${c.yun.getStartDay()}天）：`);
  c.daYun.forEach((d, i) => {
    const g = d.getGanZhi();
    console.log(`  ${String(i).padStart(2)} ${g}  ${d.getStartYear()}-${d.getEndYear()}  ${d.getStartAge()}-${d.getEndAge()}岁  干[${shiShen(dayGan, g[0])}] 支[${ZHI_HIDE[g[1]].map(h => shiShen(dayGan, h)).join(',')}]`);
  });
}

function nodes4(c, extra = []) {
  const p = c.p;
  return [
    { label: '年', zhi: p.year[1] }, { label: '月', zhi: p.month[1] },
    { label: '日', zhi: p.day[1] }, { label: '时', zhi: p.time[1] },
    ...extra
  ];
}

/* ---------------- CLI ---------------- */
// 必须加 require.main 守卫：本文件被 family.js 等 require 时，不应执行 CLI 分支，
// 否则会把「用法」提示打出来，污染调用方的输出。
if (require.main === module) {
  const [, , cmd, ...args] = process.argv;
  cli(cmd, args);
}

/* 性别参数必须显式给：`args[1] ?? 1` 的缺省值是「男」。
   女命若漏传 0，大运顺逆会**整体反向**、起运岁数也跟着错好几年，而**不报任何错**——
   输出的干支全都是合法干支，「看起来正常」，只有表头那个「男／女」与方向反了。
   这类错在报告里极难看出来，故在此高声提醒。 */
function warnGender(args) {
  if (args[1] === undefined || args[1] === '') {
    console.log('⚠ 未指定性别参数，已按「男」推大运。');
    console.log('  性别 1=男 0=女 —— **女命必须显式传 0**，否则大运顺逆整体反向');
    console.log('  （阳男阴女顺行、阴男阳女逆行；方向错则运干支与起运岁数一起错）。');
  }
}

function cli(cmd, args) {
  const NODE_HINT = 'NODE_PATH=<bin>/node/workspace/node_modules';

  if (cmd === 'chart') {
    warnGender(args);
    const c = makeChart(args[0], Number(args[1] ?? 1));
    printChart(c);
  } else if (cmd === 'rel') {
    // node paipan.js rel "庚午 辛巳 庚辰 癸未" 壬午 丙午
    const pillars = args[0].split(/\s+/);
    const nodes = [{ label: '年', zhi: pillars[0][1] }, { label: '月', zhi: pillars[1][1] }, { label: '日', zhi: pillars[2][1] }, { label: '时', zhi: pillars[3][1] }];
    const gans = [{ label: '年干', gan: pillars[0][0] }, { label: '月干', gan: pillars[1][0] }, { label: '日干', gan: pillars[2][0] }, { label: '时干', gan: pillars[3][0] }];
    if (args[1]) { nodes.push({ label: '运', zhi: args[1][1] }); gans.push({ label: '运干', gan: args[1][0] }); }
    if (args[2]) { nodes.push({ label: '流年', zhi: args[2][1] }); gans.push({ label: '流年干', gan: args[2][0] }); }
    const r = relations(nodes, { detail: true });
    console.log('参与运算：' + nodes.map(n => n.label + n.zhi).join(' '));
    for (const k of Object.keys(r)) if (r[k].length) console.log(`  ${k}：${r[k].join(' ； ')}`);
    const gr = ganRelations(gans);
    console.log('  ── 天干层 ──');
    for (const k of ['合', '冲', 'note']) if (gr[k].length) console.log(`  ${k === 'note' ? '提示' : k}：${gr[k].join(' ； ')}`);
    if (!gr.合.length && !gr.冲.length) console.log('  天干：无合无冲');
  } else if (cmd === 'full') {
    warnGender(args);
    const c = makeChart(args[0], Number(args[1] ?? 1));
    printChart(c);
    const y0 = Number(args[2] ?? new Date().getFullYear() - 5);
    const y1 = Number(args[3] ?? y0 + 10);
    console.log(`\n===== 流年关系扫描 ${y0}-${y1} =====`);
    const pg = [c.p.year[0], c.p.month[0], c.p.day[0], c.p.time[0]];
    const pl = ['年干', '月干', '日干', '时干'];
    for (let y = y0; y <= y1; y++) {
      const ln = c.daYun.find(d => y >= d.getStartYear() && y <= d.getEndYear());
      const gz = ln ? (ln.getLiuNian().find(x => x.getYear() === y) || {}).getGanZhi?.() : null;
      if (!gz) continue;
      const extra = [{ label: '运', zhi: ln.getGanZhi()[1] }, { label: '流年', zhi: gz[1] }];
      const r = relations(nodes4(c, extra));
      const all = Object.entries(r).filter(([, v]) => v.length).map(([k, v]) => `${k}:${v.join('、')}`);
      const gans = pg.map((g, i) => ({ label: pl[i], gan: g }))
        .concat([{ label: '运干', gan: ln.getGanZhi()[0] }, { label: '流年干', gan: gz[0] }]);
      const gr = ganRelations(gans);
      const gtxt = [gr.合.length ? '干合:' + gr.合.join('、') : '',
                    gr.冲.length ? '干冲:' + gr.冲.join('、') : '',
                    gr.note.join('、')].filter(Boolean).join(' | ');
      console.log(`${y} ${gz} (${ln.getGanZhi()}运) ` + ([...all, gtxt].filter(Boolean).join(' | ') || '—'));
    }
  } else {
    console.log('用法：');
    console.log(`  ${NODE_HINT} node paipan.js chart "1990-05-15 14:20" 1`);
    console.log(`  ${NODE_HINT} node paipan.js full  "1990-05-15 14:20" 1 2020 2035`);
    console.log(`  ${NODE_HINT} node paipan.js rel   "庚午 辛巳 庚辰 癸未" 壬午 丙午   # 后两个参数为干支，不是年份`);
    console.log('  第 2 个参数是**性别**：1=男　0=女 —— 女命漏传会按「男」推大运，方向整体反向。');
  }
}

module.exports = {
  makeChart, relations, shiShen, ZHI_HIDE, GAN_WX, countWuXing,
  // 天干层关系（五合／相冲／争合）——detail.js、geju.js、suiyun.js 共用此一处实现，
  // 避免各脚本各写一份而算法走样（曾因重复实现导致「天干层」在不同报告里结论不一）。
  ganRelations, GAN_HE5, GAN_CHONG4,
  // 人元用事（节气分野）＋旺相休囚死——wangshuai.js / geju.js 共用此一处实现
  renYuan, wangXiang, RENYUAN, JIE_OF_MONTH, KU_MONTH
};
