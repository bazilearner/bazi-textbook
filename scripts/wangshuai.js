#!/usr/bin/env node
/**
 * wangshuai.js —— 教学式「定旺衰」推导器（只 require 本目录 paipan.js）
 *
 * 解决什么问题：判日主强弱，坊间多是「一看就知道」，于是**过程写不出来**。
 * 教学式报告要求「日主旺衰怎么一项项数」——即古法的四问：
 *   ① 得令否（月令） ② 得地否（通根） ③ 得生否（印） ④ 得助否（比劫）
 * 再减去「克泄耗」三方。本脚本把这四问**逐项落成可复算的表**，并另给一份
 * 声明了口径的**力量计分**（同类 vs 异类），供报告直接引用。
 *
 * 用法：
 *   node wangshuai.js all   "庚午 辛巳 庚辰 癸未"
 *   node wangshuai.js all   "庚午 辛巳 庚辰 癸未" "1990-05-15 14:20"    # 加生辰可算「节气后第几日」与司令分野
 *   node wangshuai.js deling|dedi|desheng|dezhu|kexie|score|summary "<四柱>" ["<生辰>"]
 *   node wangshuai.js bazi  "<四柱>"        # 另给「八字本体」口径（干1/支本气1，最能看偏枯）
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
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };


const WX_ORDER = ['木', '火', '土', '金', '水'];

/* 日主之禄 / 刃 / 墓（墓取五行之墓） */
const LU = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
const REN = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };  // 阴干无刃（流派不一，只列不判）
const MU = { 木: '未', 火: '戌', 土: '戌', 金: '丑', 水: '辰' };

function parseChart(s) {
  const p = String(s).replace(/[,，、]/g, ' ').split(/\s+/).filter(Boolean);
  if (p.length !== 4) throw new Error('四柱格式应为「年柱 月柱 日柱 时柱」');
  return p.map(x => {
    if (x.length !== 2 || GAN.indexOf(x[0]) < 0 || ZHI.indexOf(x[1]) < 0) throw new Error('非法柱：' + x);
    return { gan: x[0], zhi: x[1] };
  });
}
const classOf = ss => (ss === '比肩' || ss === '劫财' || ss === '正印' || ss === '偏印' || ss === '日主')
  ? '同类' : '异类';

/* ---------- 月令与司令 ---------- */
function monthLing(ch, dt) {
  const day = ch[2].gan, monthZhi = ch[1].zhi;
  const dayWx = GAN_WX[day], mWx = GAN_WX[ZHI_HIDE[monthZhi][0]];
  const out = [];
  out.push('── 月令与司令 ──');
  out.push(`  日主：${day}（${dayWx}，${GAN.indexOf(day) % 2 === 0 ? '阳' : '阴'}干）　月支：${monthZhi}　月令五行：${mWx}`);
  // 节气日
  let jieTxt = '（未提供生辰，只按月支本气论司令）';
  let renyuanNow = null, dayIdx = null;
  if (dt) {
    // 一律调 paipan.js 的 renYuan()——节气查表只此一处实现（曾因重复实现而算错司令）
    const RY = P.renYuan(dt, monthZhi);
    if (RY) {
      renyuanNow = RY.gan; dayIdx = RY.day;
      jieTxt = `距上一节「${RY.jie}」（${RY.jieTime}）→ 生于节后第 ${RY.day} 日`;
    } else {
      jieTxt = '（节气查询失败：请核对生辰格式「YYYY-MM-DD HH:MM」）';
    }
  }
  out.push(`  ${jieTxt}`);
  const segs = P.RENYUAN[monthZhi].map(([g, n]) => `${g}(${n}日)`).join(' → ');
  out.push(`  分野表（${monthZhi}月）：${segs}`);
  if (renyuanNow) {
    out.push(`  → 当值人元（司令）：**${renyuanNow}（${GAN_WX[renyuanNow]}，${P.shiShen(day, renyuanNow)}）**` +
      `　→ 取格当以此字为主看`);
  } else {
    out.push(`  → 未提供生辰：一律以月支本气「${ZHI_HIDE[monthZhi][0]}（${P.shiShen(day, ZHI_HIDE[monthZhi][0])}）」为司令论`);
  }
  out.push(`  月支藏干逐字：` + ZHI_HIDE[monthZhi].map((h, i) =>
    `${h}(${i === 0 ? '本气' : i === 1 ? '中气' : '余气'}·${P.shiShen(day, h)})`).join('　'));
  return out.join('\n');
}

/* ---------- 一、得令 ---------- */
function deling(ch, dt) {
  const day = ch[2].gan, monthZhi = ch[1].zhi;
  const dayWx = GAN_WX[day], mWx = GAN_WX[ZHI_HIDE[monthZhi][0]];
  const st = P.wangXiang(mWx);
  const self = st[dayWx];
  const out = ['── ① 得令（月令为纲：一月之令当一季之气）──'];
  out.push(`  月令五行 ${mWx} 为「我」时：` + WX_ORDER.map(w => `${w}${st[w]}`).join('　'));
  out.push(`  日主 ${day}（${dayWx}）在 ${monthZhi} 月处「${self}」`);
  const lvl = (self === '旺' || self === '相') ? '得令' : (self === '休' ? '失令（休，略有余气）' : '失令（' + self + '）');
  out.push(`  → 得令判定：**${lvl}**`);
  const why = {
    旺: '日主五行即当令之行，气最盛',
    相: '月令生我，气得生扶，亦作得令',
    休: '我生月令，泄气之地，属失令',
    囚: '我克月令（一说克令者囚），受制，属失令',
    死: '月令克我，受克最重，属失令'
  }[self];
  out.push(`  依据：${why}`);
  // 司令分野若与日主同类，另作说明
  if (dt) {
    const RY = P.renYuan(dt, monthZhi);
    const ry = RY ? RY.gan : null;
    if (ry) {
      const rel = P.shiShen(day, ry);
      out.push(`  司令加成：月令当值人元为 ${ry}（${rel}）——` +
        (classOf(rel) === '同类'
          ? `与日主同类，故**虽月支本气不为我用，当值人元仍帮我**，此即「得令为体、司令为用」之分`
          : `非日主同类，帮身之力须另从通根与印比处找`));
    }
  }
  return out.join('\n');
}

/* ---------- 二、得地（通根） ---------- */
function dedi(ch) {
  const day = ch[2].gan, dayWx = GAN_WX[day];
  const out = ['── ② 得地（通根：日主五行在地支有无落脚的根）──'];
  out.push('  柱 | 地支 | 藏干（十神） | 日主同类之根 | 根的力量');
  const tally = { 本气: [], 中气: [], 余气: [] };
  const yinRoots = [];
  ch.forEach((p, i) => {
    const rels = ZHI_HIDE[p.zhi].map(h => h + '(' + P.shiShen(day, h) + ')');
    const roots = [];
    ZHI_HIDE[p.zhi].forEach((h, k) => {
      if (GAN_WX[h] === dayWx) {
        const typ = k === 0 ? '本气' : k === 1 ? '中气' : '余气';
        roots.push(h + '·' + typ);
        tally[typ].push(POS[i] + h);
      }
      if (P.shiShen(day, h) === '正印' || P.shiShen(day, h) === '偏印') {
        yinRoots.push(POS[i] + p.zhi + '藏' + h + '(' + (k === 0 ? '本气' : k === 1 ? '中气' : '余气') + ')');
      }
    });
    out.push(`  ${POS[i][0]} | ${p.zhi} | ${rels.join(' ')} | ${roots.length ? roots.join('、') : '—'} | ` +
      (roots.length ? (roots.some(r => r.includes('本气')) ? '有力' : '偏轻') : '无'));
  });
  out.push(`  → 通根合计：本气根 ${tally.本气.length ? tally.本气.join('、') : '无'}` +
    `；中气根 ${tally.中气.length ? tally.中气.join('、') : '无'}` +
    `；余气根 ${tally.余气.length ? tally.余气.join('、') : '无'}`);
  const zhiArr = ch.map(p => p.zhi);
  out.push(`  → 禄位 ${LU[day]}（命局${zhiArr.includes(LU[day]) ? '有' : '无'}）` +
    `　刃位 ${REN[day] || '（阴干不列）'}（命局${REN[day] ? (zhiArr.includes(REN[day]) ? '有' : '无') : '—'}）` +
    `　日主${dayWx}之墓 ${MU[dayWx]}（命局${zhiArr.includes(MU[dayWx]) ? '有（墓库根，气藏而不显）' : '无'}）`);
  const judge = tally.本气.length ? '得地（有本气根，根深能任财官）'
    : (tally.中气.length || tally.余气.length) ? '得地而根浅（只有中／余气根，遇冲泄即拔）'
      : '失地（四支无日主同类之根）';
  out.push(`  → 得地判定：**${judge}**`);
  if (yinRoots.length) out.push(`  → 另记（供「得生」用）：印星之根 ${yinRoots.join('、')}`);
  return out.join('\n');
}

/* ---------- 三、得生（印） ---------- */
function desheng(ch) {
  const day = ch[2].gan;
  const out = ['── ③ 得生（印星：生我者为源）──'];
  out.push('  位置 | 干支 | 天干十神 | 印星落点与力量');
  // 注意：变量名一律 ASCII —— JS 会把 `let 透` 解析成标识符 `let透`（见 SKILL.md 已知坑）
  let touN = 0, benN = 0, midN = 0;
  ch.forEach((p, i) => {
    const gs = i === 2 ? '日主' : P.shiShen(day, p.gan);
    const pts = [];
    if (i !== 2 && (gs === '正印' || gs === '偏印')) { pts.push(`天干透${gs}（力显）`); touN++; }
    ZHI_HIDE[p.zhi].forEach((h, k) => {
      const s = P.shiShen(day, h);
      if (s === '正印' || s === '偏印') {
        const t = k === 0 ? '本气' : k === 1 ? '中气' : '余气';
        pts.push(`${p.zhi}藏${h}（${s}·${t}）`);
        if (k === 0) benN++; else midN++;
      }
    });
    out.push(`  ${POS[i]} | ${p.gan}${p.zhi} | ${gs} | ${pts.length ? pts.join('；') : '—'}`);
  });
  out.push(`  → 印星合计：透干 ${touN} 处、地支本气根 ${benN} 处、中／余气 ${midN} 处`);
  const judge = touN ? '得生有力（印透天干，源有显路）'
    : benN ? '得生（印居地支本气，源厚而不显）'
      : midN ? '得生而力薄（印藏中／余气，须运年引出）'
        : '无生（全局无印，日主无源）';
  out.push(`  → 得生判定：**${judge}**`);
  out.push('  注：印为「源」而非「力」。源厚者不惧克泄，源薄者虽得体而无根；' +
    '又须看印是否被财坏、被合去（属「格局成败」一节的事）。');
  return out.join('\n');
}

/* ---------- 四、得助（比劫） ---------- */
function dezhu(ch) {
  const day = ch[2].gan;
  const out = ['── ④ 得助（比劫：同我者为助）──'];
  out.push('  位置 | 干支 | 天干十神 | 比劫落点与力量');
  // 三个层次分开记：透干 / 支中有比劫（含中气余气）/ 其中属本气者。
  // ⚠ 判定必须看「支中有无比劫」（藏支即算得助，只是「力藏」），
  //   不能只看本气根——否则 ④ 段判「无助」而 ⑦ 汇总判「得助」，同一份输出里自相矛盾。
  const touArr = [], hideArr = [], rootArr = [];
  ch.forEach((p, i) => {
    const gs = i === 2 ? '日主' : P.shiShen(day, p.gan);
    const pts = [];
    if (i !== 2 && (gs === '比肩' || gs === '劫财')) { pts.push(`天干透${gs}（力显）`); touArr.push(POS[i] + p.gan); }
    ZHI_HIDE[p.zhi].forEach((h, k) => {
      const s = P.shiShen(day, h);
      if (s === '比肩' || s === '劫财') {
        const t = k === 0 ? '本气' : k === 1 ? '中气' : '余气';
        pts.push(`${p.zhi}藏${h}（${s}·${t}）`);
        hideArr.push(POS[i] + p.zhi + h);
        if (k === 0) rootArr.push(POS[i] + p.zhi + h);
      }
    });
    out.push(`  ${POS[i]} | ${p.gan}${p.zhi} | ${gs} | ${pts.length ? pts.join('；') : '—'}`);
  });
  out.push(`  → 比劫合计：透干 ${touArr.length ? touArr.join('、') : '无'}；` +
    `支中比劫 ${hideArr.length ? hideArr.join('、') : '无'}` +
    `（其中本气根 ${rootArr.length ? rootArr.join('、') : '无'}）`);
  const judge = touArr.length ? '得助（比劫透干，可分担财官）'
    : hideArr.length ? '得助（比劫居支，力藏）' : '无助（无反手相帮之神）';
  out.push(`  → 得助判定：**${judge}**`);
  out.push('  注（精微规则，见 judgment-core.md 第十节规则 2）：阴干日主的比肩力弱于劫财；' +
    '且**比肩与日主同类，不取为相神**——相神须是日主之外的独立得力之字。');
  return out.join('\n');
}

/* ---------- 五、克泄耗 ---------- */
function kexie(ch) {
  const day = ch[2].gan;
  const out = ['── ⑤ 克泄耗（异类三方，即耗身之力）──'];
  const bucket = { '克我·官杀': [], '我生·食伤': [], '我克·财': [] };
  ch.forEach((p, i) => {
    const gs = i === 2 ? '日主' : P.shiShen(day, p.gan);
    const put = (s, tag) => {
      const k = (s === '正官' || s === '七杀') ? '克我·官杀' : (s === '食神' || s === '伤官') ? '我生·食伤'
        : (s === '正财' || s === '偏财') ? '我克·财' : null;
      if (k) bucket[k].push(tag + s);
    };
    if (i !== 2) put(gs, POS[i][0] + '干' + p.gan + '·');
    ZHI_HIDE[p.zhi].forEach((h, k) => put(P.shiShen(day, h), POS[i][0] + '支' + p.zhi + '藏' + h + '·'));
  });
  out.push('  类别 | 落点（含干支与藏干） | 计数');
  Object.keys(bucket).forEach(k => out.push(`  ${k} | ${bucket[k].length ? bucket[k].join('　') : '无'} | ${bucket[k].length}`));
  return out.join('\n');
}

/* ---------- 六、力量计分（口径声明） ---------- */
function score(ch) {
  const day = ch[2].gan;
  const items = [];
  const add = (zi, pos, base, ling) => items.push({ zi, pos, ss: P.shiShen(day, zi), base, ling });
  ch.forEach((p, i) => {
    if (i !== 2) add(p.gan, POS[i] + '天干', 1, false);
    ZHI_HIDE[p.zhi].forEach((h, k) => {
      add(h, POS[i] + p.zhi + (k === 0 ? '本气' : k === 1 ? '中气' : '余气'),
        k === 0 ? 1 : k === 1 ? 0.5 : 0.25, i === 1);
    });
  });
  items.push({ zi: day, pos: '日干本体', ss: '日主', base: 1, ling: false, self: true });
  const out = ['── ⑥ 力量计分（口径声明，可逐项复算）──'];
  out.push('  口径：天干（年／月／时）各 1 分；日干本体 1 分（计入同类，以示自带的「一分」）；' +
    '地支本气 1 分、中气 0.5 分、余气 0.25 分；**月支各项再乘 2**（月令司权，一月之令当一季之气）。');
  out.push('  序 | 字 | 位置 | 十神 | 基础分 | 月令加权 | 得分 | 归类');
  let same = 0, diff = 0;
  items.forEach((it, i) => {
    const f = it.base * (it.ling ? 2 : 1);
    const c = classOf(it.ss);
    if (c === '同类') same += f; else diff += f;
    out.push(`  ${i + 1} | ${it.zi} | ${it.pos} | ${it.ss} | ${it.base} | ${it.ling ? '×2' : '—'} | ${r(f)} | ${c}`);
  });
  const tot = same + diff;
  const pct = tot ? (same / tot * 100) : 0;
  out.push(`  → 同类合计（比劫＋印）**${r(same)}** 分；异类合计（财＋官杀＋食伤）**${r(diff)}** 分；总计 ${r(tot)}`);
  out.push(`  → 同类占比 **${pct.toFixed(1)}%**`);
  const judge = pct >= 55 ? '身强倾向' : pct >= 45 ? '中和倾向' : '身弱倾向';
  out.push(`  → 判定线（本技能口径）：≥55% 身强倾向；45%—55% 中和倾向；<45% 身弱倾向　→ **${judge}**`);
  out.push('  ⚠ 计分只是**辅助**，不是结论。它给出的是一个可核的数字；' +
    '真正的判定必须与「得令／得地／得生／得助」四问合看——' +
    '尤其两种情形必须以四问为准：① **得令且得地**而计分不足的（月令之权大于零散之数）；' +
    '② 计分虽高而**全无本气根**的（无根之扶，虚而不实）。');
  return out.join('\n');
}
const r = x => Math.round(x * 100) / 100;

/* ---------- 七、四问汇总 ---------- */
function summary(ch, dt) {
  const day = ch[2].gan, dayWx = GAN_WX[day];
  const monthZhi = ch[1].zhi, mWx = GAN_WX[ZHI_HIDE[monthZhi][0]];
  const self = P.wangXiang(mWx)[dayWx];
  const zhiArr = ch.map(p => p.zhi);
  let rootBen = false, rootMid = false;
  ch.forEach(p => ZHI_HIDE[p.zhi].forEach((h, k) => {
    if (GAN_WX[h] === dayWx) { if (k === 0) rootBen = true; else rootMid = true; }
  }));
  let hasYin = false, hasYinTou = false, hasBi = false, hasBiTou = false;
  ch.forEach((p, i) => {
    if (i !== 2) {
      const s = P.shiShen(day, p.gan);
      if (s === '正印' || s === '偏印') hasYinTou = true;
      if (s === '比肩' || s === '劫财') hasBiTou = true;
    }
    ZHI_HIDE[p.zhi].forEach(h => {
      const s = P.shiShen(day, h);
      if (s === '正印' || s === '偏印') hasYin = true;
      if (s === '比肩' || s === '劫财') hasBi = true;
    });
  });
  const a1 = (self === '旺' || self === '相') ? '得令' : `失令（${self}）`;
  const a2 = rootBen ? '得地（本气根）' : rootMid ? '得地而根浅' : '失地（无同类之根）';
  const a3 = hasYinTou ? '得生（印透干）' : hasYin ? '得生（印藏支）' : '无生';
  const a4 = hasBiTou ? '得助（比劫透干）' : hasBi ? '得助（比劫藏支）' : '无助';
  const good = [a1.startsWith('得令'), rootBen || rootMid, hasYin || hasYinTou, hasBi || hasBiTou].filter(Boolean).length;
  const delingOK = (self === '旺' || self === '相');
  const out = ['── ⑦ 四问汇总 ──'];
  out.push('  问 | 答 | 要点');
  out.push(`  ① 得令否 | ${a1} | 月支 ${monthZhi}（${mWx}），日主 ${dayWx} 处「${self}」`);
  out.push(`  ② 得地否 | ${a2} | ` + (rootBen ? '有本气根，根深' : rootMid ? '仅中／余气根，遇冲泄即拔' : '四支无日主之根'));
  out.push(`  ③ 得生否 | ${a3} | ` + (hasYinTou ? '印星透干，源有显路' : hasYin ? '印居地支，源厚不显' : '全局无印'));
  out.push(`  ④ 得助否 | ${a4} | ` + (hasBiTou ? '比劫透干，可分担财官' : hasBi ? '比劫藏支，力藏' : '无反手相帮'));
  out.push(`  → 四问中「占」${good} 项（供参考，不作权重）`);

  /* 综合判定：月令与根优先，计分只作校验——两条互校，不一致时明说 */
  const sc = score(ch);
  const m = sc.match(/同类占比 \*\*([\d.]+)%\*\*/);
  const pct = m ? Number(m[1]) : null;
  const pctJudge = pct === null ? '—' : pct >= 55 ? '身强倾向' : pct >= 45 ? '中和倾向' : '身弱倾向';
  const pctDir = pctJudge === '—' ? '中' : (pctJudge.includes('强') ? '强' : pctJudge.includes('弱') ? '弱' : '中');
  let concl, conclDir, why;
  if (delingOK && rootBen) {
    concl = '**身强**'; conclDir = '强';
    why = '得令且得地——月令与根本俱得。月令之权大于零散之数，纵计分不足亦以身强论';
  } else if (!delingOK && !rootBen && !rootMid) {
    concl = '**身弱**'; conclDir = '弱';
    why = '既失令、又无同类之根。纵天干有比印，无根之扶虚而不实';
  } else if (!delingOK && rootMid) {
    if (pct !== null && pct >= 55) { concl = '**中和偏强**'; conclDir = '中'; why = '失令而根浅，然比印成势——宜以调候与格局定用，不宜纯作扶抑'; }
    else { concl = '**身弱倾向**'; conclDir = '弱'; why = '失令、根浅，帮身之力多在天干浮位（无本气根可依）'; }
  } else {
    if (pct !== null && pct < 45) { concl = '**身弱倾向（得令而力不从心）**'; conclDir = '弱'; why = '虽得月令之气，然四支无本气根可依，克泄三方又重，气不落地'; }
    else if (pct !== null && pct >= 55) { concl = '**偏强**'; conclDir = '强'; why = '得令而比印成势，虽无本气根，天干有显路可依'; }
    else { concl = '**中和（强弱之界）**'; conclDir = '中'; why = '得令而根浅，同类与异类相当——须以格局与调候定用，扶抑退居其次'; }
  }
  const consistent = (conclDir === pctDir) || conclDir === '中' || pctDir === '中';
  out.push('  → 综合：' + concl + '　依据：' + why);
  out.push(`  → 两法互校：四问占 ${good}／4；计分同类占比 ${pct === null ? '—' : pct + '%'}（${pctJudge}）`
    + (consistent
      ? '　→ 两法方向一致（或其一为「中和」），取用可按常法走。'
      : '　⚠ **两法方向不一致**（四问与小计分数背离）：此类盘最须小心——'
        + '一律以「**月令＋有无本气根**」为准（已体现在上面的综合结论里），'
        + '并须在报告中写明分歧与取舍理由，**不可只报一个数**。'));
  out.push('  ⚠ 两条例外（《滴天髓》）：**旺极宜泄不宜克，弱极宜克不宜生**。' +
    '若日主旺极（三合／三会成局而全局无一处克泄），或弱极（全局皆克泄而无一丝印比），' +
    '则不可按常规「扶弱抑强」取用，须走从格／专旺一路——' +
    '此事归「取用神」一节判，本节的强弱只是**常法之强弱**。');
  return out.join('\n');
}

/* ---------- 附：八字本体口径 ---------- */
function bazi(ch) {
  const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  ch.forEach(p => { c[GAN_WX[p.gan]] += 1; c[GAN_WX[ZHI_HIDE[p.zhi][0]]] += 1; });
  const out = ['── 附：八字本体口径（四干＋四支本气，各 1 分，最能看偏枯）──'];
  out.push('  五行 | 分');
  WX_ORDER.forEach(w => out.push(`  ${w} | ${c[w]}`));
  const arr = WX_ORDER.map(w => [w, c[w]]).sort((a, b) => b[1] - a[1]);
  out.push(`  → 最旺 ${arr[0][0]}${arr[0][1]}；最弱 ${arr[4][0]}${arr[4][1]}` +
    (arr[4][1] === 0 ? `；**全无之行：${WX_ORDER.filter(w => !c[w]).join('、')}**` : ''));
  return out.join('\n');
}

/* ---------- CLI ---------- */
function main() {
  const a = process.argv.slice(2);
  const cmd = a[0], chartStr = a[1];
  if (!chartStr) {
    console.log('用法：node wangshuai.js all|deling|dedi|desheng|dezhu|kexie|score|summary|bazi "<四柱>" ["<生辰 YYYY-MM-DD HH:MM>"]');
    return;
  }
  const ch = parseChart(chartStr);
  const dt = a[2] || null;
  const blocks = {
    deling: () => deling(ch, dt), dedi: () => dedi(ch), desheng: () => desheng(ch),
    dezhu: () => dezhu(ch), kexie: () => kexie(ch), score: () => score(ch),
    summary: () => summary(ch, dt), bazi: () => bazi(ch)
  };
  if (cmd === 'all') {
    console.log('四柱：' + chartStr + (dt ? '　生辰：' + dt : ''));
    console.log('\n' + monthLing(ch, dt));
    ['deling', 'dedi', 'desheng', 'dezhu', 'kexie', 'score', 'summary', 'bazi'].forEach(k => {
      console.log('\n' + blocks[k]());
    });
  } else if (blocks[cmd]) console.log(blocks[cmd]());
  else console.log('未知子命令：' + cmd);
}
main();
