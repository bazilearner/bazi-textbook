#!/usr/bin/env node
/**
 * geju.js —— 教学式「辨格局」推导器（只 require 本目录 paipan.js）
 *
 * 解决什么问题：《子平真诠》的取格—顺逆—成败—相神是一条完整链，
 * 但坊间报告多只写一句「XX格，身弱，喜木火」，**链条断在中间**。
 * 教学式报告要求把「月令透出什么 → 为何取此格 → 顺用还是逆用 →
 * 相神在哪一个字 → 有没有被伤 → 成格还是破格 → 有无救应」逐环写出来。
 * 本脚本把其中**可算的部分**全部算掉（透干对照、藏干通根、关系扫描、
 * 相神候选清单、破格嫌疑项），判读部分留给人写。
 *
 * 用法：
 *   node geju.js all "<四柱>"
 *   node geju.js touchu|quge|shunni|xiangshen|chengbai|sixiong "<四柱>"
 *
 * 注：命令中的四柱均为**演示数据（虚构）**，不得换成真实命主资料。
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

/* 人元用事分野与四库月常量——一律取自 paipan.js，不在本文件另存一份 */
const KU = P.KU_MONTH;

/* 八格：顺用（四吉神）／逆用（四凶神）——《子平真诠·论用神》 */
const SHUN = ['正官', '正财', '偏财', '正印', '偏印', '食神'];   // 善而顺用
const NI = ['七杀', '伤官'];                                     // 不善而逆用
const GE_NAME = { 正官: '正官格', 七杀: '七杀格', 正财: '正财格', 偏财: '偏财格', 正印: '正印格', 偏印: '偏印格', 食神: '食神格', 伤官: '伤官格' };

/* 相神速查：格 → 可充相神之十神（须独立于日主，比肩只列次一等）
   依据《子平真诠》各格篇：官格以财或印为相；杀格以食或印为相；财格以食伤生财、官杀护财；
   印格以官杀或比劫为相；食神格以比劫护食或财泄食；伤官格以印或财为相。
   注：**比肩与日主同类**，按 judgment-core.md 第十节规则 2 不取为相神；
   下表保留比肩是为了如实列出「经典所列的护印一路」，但打表时会标为 ☆（次一等），
   取用时优先劫财与官杀。 */
const XIANGSHEN = {
  正官: { 相: ['正财', '偏财', '正印', '偏印'], 说明: '财生官、印护官（防伤官夺官）' },
  七杀: { 相: ['食神', '正印', '偏印'], 说明: '食神制杀、印化杀（二者得一即可）' },
  正财: { 相: ['食神', '伤官', '正官', '七杀'], 说明: '食伤生财；官杀护财（防比劫夺财）' },
  偏财: { 相: ['食神', '伤官', '正官', '七杀'], 说明: '食伤生财、杀官护财；偏财尤喜食伤流通' },
  正印: { 相: ['正官', '七杀', '劫财', '比肩'], 说明: '官杀生印（杀印相生）、比劫护印（防财坏印）' },
  偏印: { 相: ['正官', '七杀', '劫财', '比肩'], 说明: '官杀生印；偏印尤须财制或比劫化解孤克' },
  食神: { 相: ['劫财', '比肩', '正财', '偏财'], 说明: '比劫护食（防枭夺食）、财泄食成「食神生财」' },
  伤官: { 相: ['正印', '偏印', '正财', '偏财'], 说明: '伤官配印（贵）、伤官生财（富）' }
};

function parseChart(s) {
  const p = String(s).replace(/[,，、]/g, ' ').split(/\s+/).filter(Boolean);
  if (p.length !== 4) throw new Error('四柱格式应为「年柱 月柱 日柱 时柱」');
  return p.map(x => {
    if (x.length !== 2 || GAN.indexOf(x[0]) < 0 || ZHI.indexOf(x[1]) < 0) throw new Error('非法柱：' + x);
    return { gan: x[0], zhi: x[1] };
  });
}


/* ---------- 一、月令透出对照 ---------- */
function touchu(ch, dt) {
  const day = ch[2].gan, mz = ch[1].zhi;
  const gans = ch.map((p, i) => ({ i, gan: p.gan }));
  const others = [];            // 其他支藏干（看「通根于他支」）
  ch.forEach((p, i) => { if (i !== 1) ZHI_HIDE[p.zhi].forEach(h => others.push({ h, i })); });
  const out = ['── 月令透出对照（《子平真诠》：「八字用神，专求月令」）──'];
  const ry = P.renYuan(dt, ch[1].zhi);
  if (ry) out.push(`  人元司令（节后第 ${ry.day} 日）：**${ry.gan}（${P.shiShen(day, ry.gan)}）**`);
  out.push('  月支藏干 | 十神 | 是否透干 | 透于何处 | 另通根于他支');
  const list = [];
  ZHI_HIDE[mz].forEach((h, k) => {
    const ss = P.shiShen(day, h);
    const t = k === 0 ? '本气' : k === 1 ? '中气' : '余气';
    const hits = gans.filter(g => g.gan === h);
    const tou = hits.length ? hits.map(g => POS[g.i] + '干' + (g.i === 2 ? '（即日主本身，不作「透」看）' : '')).join('、') : '否';
    const root = others.filter(o => o.h === h).map(o => POS[o.i] + '支' + ch[o.i].zhi + '藏' + o.h).join('、') || '—';
    out.push(`  ${h}（${t}） | ${ss} | ${hits.length ? '透' : '不透'} | ${tou} | ${root}`);
    list.push({ h, ss, t, touCount: hits.filter(g => g.i !== 2).length, hasTou: hits.length > 0, root });
  });
  out.push(`  → 月支被冲：` + (() => {
    const r = P.relations(ch.map((p, i) => ({ label: POS[i][0], zhi: p.zhi })));
    const hit = r.冲.filter(x => x.includes('月'));
    return hit.length ? hit.join('；') + '　⚠ 月令受冲，格局不牢（须看是被冲开还是被冲破）' : '无（月令安静，格局有根）';
  })());
  out.push('  读法（**两路，不可混**）：');
  out.push('    · **四生（寅申巳亥）／四正（子午卯酉）**：先看**人元司令**（按节后日数定当权之神）——' +
    '司令透干则「格显」，不透则「藏用」（格仍取司令，须待运年引出）。');
  out.push('    · **四库（辰戌丑未，杂气）**：〈论杂气如何取用〉「以**透干与会合**为准」——' +
    '本气不透时，中气／余气之透干者即可取格。');
  out.push('    · 月支本气即日主之比劫者 → **建禄格／月刃格**，不以八格论，于月令之外求用。');
  return { text: out.join('\n'), list, jie: ry };
}

/* ---------- 二、取格 ----------
   取格不是「看本气透不透」一句话，须分两路（《子平真诠》论八格与论杂气两篇）：
     · 四生（寅申巳亥）／四正（子午卯酉）：**先以人元司令定当权之神**，
       司令透干则「格显」，不透则「藏用」（格仍取司令，只是须待运年引出）；
       此时若中／余气另有透干者，**并列列出**备参（两派取法不同，报告须写明取舍）。
     · 四库（辰戌丑未，杂气）：《论杂气如何取用》——「以透干与会合为准」，
       本气不透亦可取中气／余气之透干者。
     · 月支恰为日主之**禄位／刃位**者 → 建禄格／月刃格，**不以八格论**，
       于月令之外求财官食伤（判据是「月支＝禄位」，**不是**「月支本气与日主同类」）。
   ------------------------------------------------------------------ */
function quge(ch, dt) {
  const day = ch[2].gan, mz = ch[1].zhi;
  const dayWx = GAN_WX[day];
  const t = touchu(ch, dt);
  const ben = t.list[0], mid = t.list[1], yu = t.list[2];
  const ry = P.renYuan(dt, ch[1].zhi);
  /* ⚠ 建禄格／月刃格的判据是「月支恰为日主之禄位／刃位」，**不是**「月支本气与日主同类」。
     例：己土日主生于丑月——丑之本气为己（同类），但己之禄在午、丑只是杂气月，
     须走〈论杂气如何取用〉（以透干与会合为准），**不作建禄格论**。
     这个松判据曾把杂气月误判成建禄格（本技能实测踩过）。 */
  const LU = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
  const RENGR = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };   // 阴干无刃
  const isLu = mz === LU[day];
  const isRen = RENGR[day] === mz;
  const isKu = KU.includes(mz);

  const out = ['── 取格 ──'];
  out.push(`  日主 ${day}（${dayWx}），月支 ${mz}（${isKu ? '四库·杂气月' : '四生／四正'}）`);
  out.push(`  人元司令：` + (ry
    ? `距上一节「${ry.jie}」(${ry.jieTime}) ${ry.day} 日 → 当权之神为 **${ry.gan}（${P.shiShen(day, ry.gan)}）**`
    : '（未提供生辰，无法按「节后日数」定司令；以下按「本气＝司令」处理，实作时请补生辰）'));

  let pick, reason, alt = null;
  /* geH / geSS：**实际取为格神的那一个字及其十神**。
     ⚠ 这一步不能省：四库月取格取的是「透干之字」，四生月取格取的是「司令」，
     两者都可能**不是月支本气**。后文的顺逆／相神／忌神若一律用「月支本气之十神」，
     就会张冠李戴——本技能实测：己日主生丑月，定格为「偏财格」（中气癸透），
     而顺逆却按本气「比肩」判，落到「四凶神逆用」，且相神查表查不到「比肩」直接抛
     TypeError 崩掉。故格神必须随格走。 */
  let geH, geSS;
  if (isLu || isRen) {
    pick = isLu ? '建禄格' : '月刃格';
    geH = ZHI_HIDE[mz][0]; geSS = P.shiShen(day, geH);
    reason = `月支 ${mz} 本气 ${ZHI_HIDE[mz][0]}（${geSS}）即日主自坐禄／刃之地——` +
      '**禄刃不以八格论**，《子平真诠》另立〈论建禄月劫〉：禄刃之格**于月令之外求用**（透干之财官食伤），月令本身不作格神。';
  } else if (isKu) {
    if (ben.touCount > 0) { pick = GE_NAME[ben.ss]; geH = ben.h; geSS = ben.ss; reason = `四库月以「透干」为准：本气 ${ben.h}（${ben.ss}）透干 → 取本气为格`; }
    else if (mid && mid.touCount > 0) { pick = GE_NAME[mid.ss]; geH = mid.h; geSS = mid.ss; reason = `四库月以「透干」为准：本气 ${ben.h}（${ben.ss}）不透，**中气 ${mid.h}（${mid.ss}）透干** → 取中气为格（杂气取用正法）`; }
    else if (yu && yu.touCount > 0) { pick = GE_NAME[yu.ss]; geH = yu.h; geSS = yu.ss; reason = `四库月以「透干」为准：本气、中气皆不透，余气 ${yu.h}（${yu.ss}）透干 → 取之`; }
    else {
      geH = ry ? ry.gan : ben.h; geSS = P.shiShen(day, geH);
      pick = (GE_NAME[geSS] || geSS + '格') + '（藏而不透）';
      reason = `四库月而三字皆不透：以司令 ${geH} 取格，**格藏不显**，须待运年引出（或逢会合而出）`;
    }
  } else {
    // 四生／四正：先看司令
    const ryGan = ry ? ry.gan : ben.h;
    const ryIsBen = ryGan === ben.h, ryIsMid = mid && ryGan === mid.h, ryIsYu = yu && ryGan === yu.h;
    const touOf = x => (x === ryGan) ? (ryIsBen ? ben.touCount : ryIsMid ? mid.touCount : ryIsYu ? yu.touCount : 0) : 0;
    if (ryIsBen) {
      geH = ben.h; geSS = ben.ss;
      if (ben.touCount > 0) { pick = GE_NAME[ben.ss]; reason = `司令即本气 ${ben.h}（${ben.ss}），且**透干** → 取之为格（格显，力最足）`; }
      else { pick = GE_NAME[ben.ss] + '（藏而不透）'; reason = `司令即本气 ${ben.h}（${ben.ss}），**不透天干** → 仍取本气为格，属「**藏用**」：格是真的，但须待运年引出该字方显`; }
      const cand = [mid, yu].filter(x => x && x.touCount > 0);
      if (cand.length) alt = cand.map(x => `${GE_NAME[x.ss]}（${x.h}·${x.ss}透干）`).join('、');
    } else if (ryIsMid) {
      geH = mid.h; geSS = mid.ss;
      if (mid.touCount > 0) { pick = GE_NAME[mid.ss]; reason = `本气不透，而**司令为中气 ${mid.h}（${mid.ss}）且透干** → 取中气为格（司令当权，最正）`; }
      else { pick = GE_NAME[mid.ss] + '（藏而不透）'; reason = `司令为中气 ${mid.h}（${mid.ss}）而不透 → 以司令取格，属「藏用」`; }
      if (ben.touCount > 0) alt = `${GE_NAME[ben.ss]}（${ben.h}·本气透干）`;
    } else {
      geH = ben.h; geSS = ben.ss;
      pick = GE_NAME[ben.ss]; reason = `以月支本气 ${ben.h}（${ben.ss}）取格`;
      const cand = [mid, yu].filter(x => x && x.touCount > 0);
      if (cand.length) alt = cand.map(x => `${GE_NAME[x.ss]}（${x.h}·${x.ss}透干）`).join('、');
    }
    if (touOf(ryGan) === 0 && !alt && !ben.touCount && !(mid && mid.touCount) && !(yu && yu.touCount))
      reason += '；三字皆不透，全盘无一处显格，须靠运年';
  }
  out.push(`  → 定格：**${pick}**`);
  out.push(`  依据：${reason}`);
  if (geSS && geH !== ben.h)
    out.push(`  → 格神与月支本气不同字，本步之后（顺逆／相神／忌神）**一律以格神 ${geH}（${geSS}）为准**，` +
      `不以本气 ${ben.h}（${ben.ss}）论——否则张冠李戴。`);
  if (alt) {
    out.push(`  ⚠ **另有可作格神之透干字**：${alt}——「透干取格」一派会取此字。` +
      '本技能的取舍：**四生四正先看司令**（本气／中气当权者优先），透干者作**格神之外的辅助或相神用**；' +
      '报告须写明此处取舍，不可两说并列而不裁。');
  }
  return { text: out.join('\n'), pick, ben, mid, yu, ry, geH, geSS, ...luChu(ch, day, geSS) };
}

/* ---------- 禄刃格／格神为比劫：用神取「月令之外」之字 ----------
   建禄月劫二格，月令本身不作格神，须于月令之外求财官食伤为用
   （《子平真诠·论建禄月劫》）。用神定在哪一字，相神与忌神随之定——
   故在此**一次算清**，供顺逆／相神／成败三处共用。
   否则三处各判一次，必然互相矛盾（本技能实测：顺逆按「本气比肩」判成四凶神逆用，
   相神查表查不到「比肩」直接抛错）。
   次序依原文：**透财而逢食伤 → 透官而逢财印 → 透煞而遇制伏**；无透干者则用神待运。 */
function luChu(ch, day, geSS) {
  if (geSS && geSS !== '比肩' && geSS !== '劫财') return { geKey: geSS, luUse: null };
  const ORDER = ['正财', '偏财', '正官', '七杀', '食神', '伤官'];
  const WORD = {
    正财: '透财而逢食伤', 偏财: '透财而逢食伤',
    正官: '透官而逢财印', 七杀: '透煞而遇制伏',
    食神: '透食伤而逢财', 伤官: '透食伤而逢财'
  };
  const tou = [];
  ch.forEach((p, i) => {
    if (i === 2) return;
    const s = P.shiShen(day, p.gan);
    if (ORDER.includes(s)) tou.push(s);
  });
  const first = ORDER.find(t => tou.includes(t));
  if (!first) {
    return {
      geKey: null,
      luUse: { yong: null, word: '月令之外未见财／官杀／食伤透干', tou: tou.join('、') || '无' }
    };
  }
  const pos = ch.map((p, i) => ({ i, p })).filter(x => x.i !== 2 && P.shiShen(day, x.p.gan) === first);
  return {
    geKey: first,
    luUse: { yong: first, word: WORD[first], tou: tou.join('、'), gan: pos.length ? pos[0].p.gan : null }
  };
}

/* ---------- 三、顺逆用 ---------- */
function shunni(ch, dt) {
  const g = quge(ch, dt);
  const ss = g.geSS;                    // ⚠ 用格神之十神，不用月支本气之十神
  const out = ['── 顺用 / 逆用（《子平真诠·论用神》）──'];
  out.push('  原文：「财官印食，此用神之善而**顺用**之者也；杀伤枭刃，此用神之不善而**逆用**之者也。」');
  let kind, how;
  if (g.pick.includes('建禄') || g.pick.includes('月刃')) {
    kind = '禄刃格外论';
    how = g.luUse && g.luUse.yong
      ? `禄刃不以月令取用，**于月令之外求财官食伤为用**——命中天干以 ${g.luUse.yong} 透（${g.luUse.word}），` +
        `故用神定在 ${g.luUse.yong}；相神即随之定（见下节）。`
      : '禄刃不以月令取用，**于月令之外求财官食伤为用**；然天干未见财／官杀／食伤透出，用神须待运年。';
  } else if (ss === '比肩' || ss === '劫财') {
    kind = '禄刃格外论（格神与日主同类）';
    how = `格神 ${ss} 即日主同类，比劫不列四吉四凶——不以八格论，` +
      '于月令之外求财官食伤为用（此即〈论建禄月劫〉的用法）。';
  } else if (SHUN.includes(ss)) {
    kind = '顺用（四吉神）'; how = `月令之神为 ${ss}，属「善」——顺其性而**生之护之**：${ss === '正官' || ss === '七杀' ? '（官杀为善者指正官）' : ''}顺用之法是「生扶此神、护卫此神」，忌其被夺被伤。`;
  } else {
    kind = '逆用（四凶神）'; how = `月令之神为 ${ss}，属「不善」——逆其性而**制之化之**：${ss === '七杀' ? '七杀以食制、以印化；' : ''}${ss === '伤官' ? '伤官以印制、以财泄；' : ''}忌其肆而无制。`;
  }
  out.push(`  → 本格取用方向：**${kind}**`);
  out.push(`  落地：${how}`);
  out.push('  ⚠ 反直觉提醒（《子平真诠》专有两篇）：《论四吉神能破格》《论四凶神能成格》——' +
    '**名字的好坏不等于作用的好坏，吉凶全在是否合于需要**。故下结论前须走「成败救应」，不可见吉字即称吉。');
  return out.join('\n');
}

/* ---------- 四、相神候选 ---------- */
function xiangshen(ch, dt) {
  const g = quge(ch, dt);
  const day = ch[2].gan;
  const key = g.geKey;                  // 禄刃格时为「月令之外透干之用神」之十神；无透干则 null
  const out = ['── 相神候选（《论相神紧要》：「伤用神甚于伤身，**伤相甚于伤用**」）──'];
  const xs = key ? XIANGSHEN[key] : null;
  if (!key && g.luUse) {
    out.push('  本格为禄刃格：月令不作格神，用神取月令之外那一分——' + g.luUse.word + '。' +
      '本命天干未见财／官杀／食伤透出，**用神与相神皆须待运年到场**。');
  } else if (!key) {
    out.push('  本格格神与日主同类（比劫），不列四吉四凶，故无传统相神速查条目；' +
      '然「伤相甚于伤用」之理不变——相神须于**日主之外的得力之字**里别求。');
  } else if (!xs) {
    out.push(`  本格格神为 ${key}，无传统相神速查条目；相神须于日主之外的得力之字里别求。`);
  } else if (g.luUse) {
    out.push(`  本格为禄刃格，月令不作格神：**用神取月令之外的透干之 ${key}**（${g.luUse.word}），` +
      `相神即随之定——${xs.相.join('、')}（${xs.说明}）。`);
  } else {
    out.push(`  本格为 ${GE_NAME[key]}（格神 ${g.geH}），传统相神取向：${xs.相.join('、')}（${xs.说明}）`);
  }
  // 命局实况：逐字列十神与落点，标出落在相神候选里的字
  out.push('  命局实况（标 ★ 者为落在相神候选内的字）：');
  out.push('  位置 | 字 | 十神 | 是否相神候选 | 力量');
  const cand = xs ? xs.相 : [];
  const found = [];
  ch.forEach((p, i) => {
    const add = (zi, where, k) => {
      const ss = P.shiShen(day, zi);
      const isC = cand.includes(ss);
      const mark = !isC ? '否' : (ss === '比肩' ? '☆ 是（同类）' : '★ 是');
      if (isC) found.push({ zi, where, ss, strong: k === 0, bi: ss === '比肩' });
      out.push(`  ${where} | ${zi} | ${ss} | ${mark} | ${k === 0 ? '本气（力厚）' : k === 1 ? '中气' : k === 2 ? '余气（力薄）' : '透干（力显）'}`);
    };
    if (i !== 2) add(p.gan, POS[i] + '天干', 3);
    ZHI_HIDE[p.zhi].forEach((h, k) => add(h, POS[i] + p.zhi + (k === 0 ? '本气' : k === 1 ? '中气' : '余气'), k));
  });
  out.push(`  → 可用之相神：${found.length ? found.map(f => `${f.zi}（${f.where}·${f.ss}）`).join('、') : '**命局中尚无相神**——相神缺位，格不能立，须待运年到场'}`);
  const hasBi = found.some(f => f.bi);
  out.push('  ⚠ **日主本身不作相神**（相神必须是日主之外的独立得力之字，见 judgment-core.md 第十节规则 2）。' +
    (hasBi
      ? '上表中标 ☆ 者为**比肩**——与日主同类，本技能列为**次一等的候选**：可用，但取其时优先劫财与官杀（阴干日主的比肩力尤弱于劫财）。'
      : '（本命局中无比肩落在候选内。）'));
  return out.join('\n');
}

/* ---------- 五、成败检查 ---------- */
function chengbai(ch, dt) {
  const g = quge(ch, dt);
  const day = ch[2].gan;
  const mz = ch[1].zhi;
  const nodes = ch.map((p, i) => ({ label: POS[i][0], zhi: p.zhi, gan: p.gan, i }));
  const r = P.relations(nodes);
  const gr = P.ganRelations(nodes.map(n => ({ label: POS[n.i] + '干', gan: n.gan })));
  const key = g.geSS;                   // ⚠ 格神之十神（四库月可能来自中／余气）
  const out = ['── 成败检查（逐条核，含「无」）──'];
  const line = (k, v) => out.push(`  ${k}：${v}`);

  // ① 用神本身有无受伤。
  //    ⚠ 禄刃格／格神为比劫时，用神在**月令之外**（透干之财官食伤），故①与②要改口：
  //    ① 只论「月令（禄位）之根基稳不稳」；② 改论「月令之外那一分用神」的干头与根气。
  const isLuRen = !!g.luUse;
  let yongZhi = mz, yongGan = g.geH;
  if (isLuRen && g.luUse.yong && g.luUse.gan) yongGan = g.luUse.gan;
  const chongYue = r.冲.filter(x => x.includes('月'));
  const heYue = r.六合.filter(x => x.includes('月'));
  line('① ' + (isLuRen
    ? '月令（禄位 ' + mz + '）之根基是否受制　※ 禄刃格月令不作格神，用神在月令之外（见②）'
    : '用神（格神 ' + yongGan + '·' + key +
      (g.geH === g.ben.h ? '，即月支本气' : '，取自月支中／余气（透干取格）') + '）是否受制'),
    (chongYue.length ? '**月令被冲**：' + chongYue.join('；') + '　' : '月令无冲　') +
    (heYue.length ? '**月令被合**：' + heYue.join('；') + '（合则羁绊，与冲同看其得失）　' : '月令无合　') +
    (chongYue.length || heYue.length ? '→ 须判：冲／合去的是**忌神**还是**用神**（去忌为福，去用为祸）' : '→ 月令安静，根气不摇'));

  // ② 用神之干（若透）有无被合被冲；禄刃格另附「月令之外用神」的支中根气
  const touWhere = nodes.filter(n => n.i !== 2 && n.gan === yongGan).map(n => POS[n.i] + '干' + n.gan);
  if (touWhere.length) {
    const s = touWhere.map(t => {
      const g0 = t.slice(-1);
      const hasHe = gr.合.filter(x => x.includes(g0));
      const hasChong = gr.冲.filter(x => x.includes(g0));
      return `${t}：` + (hasHe.length ? '被合（' + hasHe.join('；') + '）' : '') +
        (hasChong.length ? '被冲（' + hasChong.join('；') + '）' : '') +
        (!hasHe.length && !hasChong.length ? '无合无冲，用神立于干头' : '');
    });
    line('② ' + (isLuRen ? '月令之外用神（' + yongGan + '·' + g.luUse.yong + '）在干头是否受扰'
      : '用神透干处是否被合被冲'), s.join('　｜　'));
  } else {
    line('② ' + (isLuRen ? '月令之外用神' : '用神透干处是否被合被冲'),
      isLuRen ? '月令之外未见该字透干' : '用神未透干（藏于月支），干头无合冲可论；**格藏不显，须待运年引出**');
  }
  if (isLuRen && g.luUse.yong) {
    const yw = GAN_WX[yongGan];
    const roots = [];
    ch.forEach((p, i) => ZHI_HIDE[p.zhi].forEach((h, k) => {
      if (GAN_WX[h] === yw) roots.push(POS[i] + p.zhi + (k === 0 ? '本气' : k === 1 ? '中气' : '余气') + h);
    }));
    line('②之二 月令之外用神（' + yongGan + '·' + g.luUse.yong + '）之根气',
      roots.length ? '同五行之根：' + roots.join('、') + '　→ 透干有根，用神可任事'
        : '无（支中无同五行之字）→ 用神孤立，须待运年补根');
  }

  // ③ 忌神（伤用伤相之首）是否当道
  const jiCand = isLuRen
    ? ['比肩', '劫财', '偏印']        // 禄刃格：比劫夺财、偏印夺食
    : ({ 正官: ['伤官', '七杀'], 七杀: ['正官', '偏财'], 正财: ['比肩', '劫财'], 偏财: ['比肩', '劫财'],
        正印: ['正财', '偏财'], 偏印: ['正财', '偏财'], 食神: ['偏印', '七杀'], 伤官: ['正官', '偏印'] }[key] || []);
  const jiFound = [];
  ch.forEach((p, i) => {
    if (i !== 2) { const s = P.shiShen(day, p.gan); if (jiCand.includes(s)) jiFound.push(POS[i] + '干' + p.gan + '·' + s); }
    ZHI_HIDE[p.zhi].forEach((h, k) => { const s = P.shiShen(day, h); if (jiCand.includes(s)) jiFound.push(POS[i] + p.zhi + (k === 0 ? '本气' : k === 1 ? '中气' : '余气') + h + '·' + s); });
  });
  line('③ 忌神（' + (jiCand.join('/') || '—') + '）是否当道',
    jiFound.length ? jiFound.join('　') + '　→ 忌神在局，是「带忌」；**带忌不等于破格，要看有无救应**' : '无（命局中不见这一类字）');

  // ④ 相神有无（重复 call 一份，便于单跑本子命令）
  const xg = xiangshen(ch, dt);
  const xgLine = xg.split('\n').find(l => l.trim().startsWith('→ 可用之相神'));
  line('④ 相神有无（成格之钥）', (xgLine || '').replace(/^\s*→\s*/, '') || '见「相神」一节');

  // ⑤ 全局关系（格局的「运」）
  line('⑤ 地支层关系（成格／破格的实际作用力）',
    ['冲', '六合', '三合', '三会', '刑', '自刑', '害', '破'].map(k => `${k}：${r[k].length ? r[k].join('；') : '无'}`).join('　'));
  line('⑥ 天干层关系（易被漏，却是破格常见处）',
    `五合：${gr.合.length ? gr.合.join('；') : '无'}　相冲：${gr.冲.length ? gr.冲.join('；') : '无'}　争合：${gr.note.length ? gr.note.join('；') : '无'}`);

  out.push('  → 判定口径（照着走，不要跳）：');
  out.push('     a. **有相神 且 相神未被伤** → 成格（格立得住，纵带忌亦有救）；');
  out.push('     b. **有相神 但相神被合／被冲／被克** → 格败（先找救应，救应到则「败而复成」）；');
  out.push('     c. **无相神** → 格不成，须待运年补出相神，此即「运补格局」；');
  out.push('     d. 用神与相神**同时受制** → 破格，退而以「调候与病药」另取一路。');
  return out.join('\n');
}

/* ---------- 六、四凶神成格 / 四吉神破格 速查 ---------- */
function sixiong() {
  const L = [
    '── 反直觉两篇速查（《子平真诠》）──',
    '  《论四吉神能破格》：财官印食四吉神，**过了头、或被错用，一样破格**——',
    '    财旺身弱而无比劫（财多身弱，格败）；官重印轻而透伤官（官星被夺）；',
    '    印重而又见印（印重身强，无所用其印）；食神多而杂以枭（枭夺食）。',
    '  《论四凶神能成格》：杀伤枭刃四凶神，**制得宜、化得法，反成大格**——',
    '    七杀有食神制（食神制杀，贵）、有印绶化（杀印相生，贵）；',
    '    伤官配印（贵）、伤官生财（富）；偏印得财制（不孤）；阳刃得官杀制（威权）。',
    '  → 用法：**看这个字在全局里「合于需要」还是「不合需要」**，',
    '    不要看它的名字。这是本技能「格局门」最要紧的一条判断纪律。'
  ];
  return L.join('\n');
}

/* ---------- CLI ---------- */
function main() {
  const a = process.argv.slice(2);
  const cmd = a[0], chartStr = a[1];
  if (!chartStr) { console.log('用法：node geju.js all|touchu|quge|shunni|xiangshen|chengbai|sixiong "<四柱>"'); return; }
  const ch = parseChart(chartStr);
  const dt = a[2] || null;
  const blocks = {
    touchu: () => touchu(ch, dt).text,
    quge: () => quge(ch, dt).text,
    shunni: () => shunni(ch, dt),
    xiangshen: () => xiangshen(ch, dt),
    chengbai: () => chengbai(ch, dt),
    sixiong: () => sixiong()
  };
  if (cmd === 'all') {
    console.log('四柱：' + chartStr);
    ['touchu', 'quge', 'shunni', 'xiangshen', 'chengbai'].forEach(k => {
      console.log('\n' + blocks[k]());
    });
  } else if (blocks[cmd]) console.log(blocks[cmd]());
  else console.log('未知子命令：' + cmd);
}
main();
