#!/usr/bin/env node
/**
 * tiaohou.js — 调候用神查表与命中标注（零依赖，可离线）
 *
 * 数据源：references/tiaohou-table.md（《穷通宝鉴》余氏调候用神表，内置）
 *
 * 用法：
 *   node tiaohou.js lookup 庚 巳
 *   node tiaohou.js check "庚午 辛巳 庚辰 癸未"   # 命例为演示用虚构数据
 *   node tiaohou.js all 庚            # 列出庚金十二个月的调候用神
 *
 * 设计纪律：本脚本只做「查表 + 标注有无多寡」，**不下吉凶结论**。
 * 结论一律由 SKILL.md 第 3—4 步（定强弱 → 取用神 → 四门并参）给出。
 */

var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 月支顺序：正月寅 → 十二月丑（与本表列序一致）
var MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
var MONTH_NAME = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// 地支藏干：本气 / 中气 / 余气
var HIDDEN = {
  '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'], '卯': ['乙'],
  '辰': ['戊', '乙', '癸'], '巳': ['丙', '戊', '庚'], '午': ['丁', '己'], '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'], '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
};

// 天干五行
var GAN_WX = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水'
};

// 日干 → 临官(禄) / 帝旺(刃)
var LU = { '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳', '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子' };
var REN = { '甲': '卯', '乙': '辰', '丙': '午', '丁': '未', '戊': '午', '己': '未', '庚': '酉', '辛': '戌', '壬': '子', '癸': '丑' };

// 调候用神表（余氏表），列序：寅卯辰巳午未申酉戌亥子丑
var TIAOHOU = {
  '甲': [['丙', '癸'], ['庚', '丙', '丁', '戊', '己'], ['庚', '丁', '壬'], ['癸', '丁', '庚'], ['癸', '丁', '庚'], ['癸', '丁', '庚'], ['庚', '丁', '壬'], ['庚', '丁', '丙'], ['庚', '甲', '丁', '壬', '癸'], ['庚', '丁', '丙', '戊'], ['丁', '庚', '丙', '戊'], ['丁', '庚', '丙']],
  '乙': [['丙', '癸'], ['丙', '癸'], ['癸', '丙'], ['癸'], ['癸', '丙'], ['癸', '丙'], ['丙', '癸', '己'], ['癸', '丙'], ['癸'], ['丙', '戊'], ['丙'], ['丙']],
  '丙': [['壬', '庚'], ['壬', '己'], ['壬', '甲'], ['壬', '庚', '癸'], ['壬', '庚'], ['壬', '庚'], ['壬', '戊'], ['壬', '癸'], ['甲', '壬'], ['壬', '甲', '戊'], ['壬', '戊', '己'], ['壬', '甲']],
  '丁': [['甲', '庚'], ['庚', '甲'], ['甲', '庚'], ['甲', '庚'], ['壬', '庚', '癸'], ['甲', '壬', '庚'], ['甲', '庚', '丙', '戊'], ['甲', '庚', '丙', '戊'], ['甲', '庚', '丙', '戊'], ['甲', '庚'], ['甲', '庚'], ['甲', '庚']],
  '戊': [['丙', '甲', '癸'], ['丙', '甲', '癸'], ['甲', '丙', '癸'], ['甲', '丙', '癸'], ['壬', '甲', '丙'], ['癸', '丙', '甲'], ['丙', '癸', '甲'], ['丙', '癸'], ['甲', '丙', '癸'], ['甲', '丙'], ['丙', '甲'], ['丙', '甲']],
  '己': [['丙', '甲', '庚'], ['甲', '丙', '癸'], ['丙', '甲', '癸'], ['癸', '丙'], ['癸', '丙'], ['癸', '丙'], ['丙', '癸'], ['丙', '癸'], ['甲', '丙', '癸'], ['丙', '甲', '戊'], ['丙', '甲', '戊'], ['丙', '甲', '戊']],
  '庚': [['戊', '丙', '丁', '壬'], ['丁', '甲', '丙'], ['甲', '丁', '壬'], ['壬', '戊', '丙', '丁'], ['壬', '癸'], ['丁', '甲'], ['丁', '甲'], ['丁', '甲', '丙'], ['甲', '壬'], ['丁', '丙'], ['丁', '甲', '丙'], ['丙', '丁', '甲']],
  '辛': [['己', '壬', '庚'], ['壬', '甲'], ['壬', '甲'], ['壬', '甲', '癸'], ['壬', '己', '癸'], ['壬', '庚', '甲'], ['壬', '甲', '戊'], ['壬', '甲'], ['壬', '甲'], ['壬', '丙'], ['丙', '戊', '壬'], ['丙', '壬', '戊', '己']],
  '壬': [['庚', '丙', '戊'], ['戊', '辛', '庚'], ['甲', '庚', '壬'], ['壬', '辛', '庚', '癸'], ['癸', '庚', '辛'], ['辛', '甲'], ['戊', '丁', '甲'], ['甲', '庚'], ['甲', '丙'], ['戊', '丙', '庚'], ['戊', '丙'], ['丙', '丁', '甲']],
  '癸': [['辛', '丙'], ['庚', '辛'], ['丙', '辛', '甲'], ['辛'], ['庚', '壬', '癸'], ['庚', '壬', '癸'], ['丁'], ['辛', '丙'], ['辛', '甲', '壬', '癸'], ['庚', '辛', '戊', '丁'], ['丙', '辛'], ['丙', '丁']]
};

// 四时气候总则（供提示，不参与运算）
var SEASON = {
  '寅': '初春·余寒未尽，专用丙火暖木，可少水',
  '卯': '仲春·阳气渐壮，水火并用（丙丁同功，不能无水）',
  '辰': '暮春·阳壮木渴，非水不可，无水则根槁',
  '巳': '初夏·火旺木槁，调候为急，最需水',
  '午': '仲夏·火旺乘权，逢水制则免自焚，忌木助',
  '未': '季夏·土燥，喜水滋润；木忌厚土（厚则财多身弱）',
  '申': '初秋·金神渐旺，木气内敛，用金须有火制',
  '酉': '仲秋·金当权得令，火炼成器，土多反惹顽浊',
  '戌': '暮秋·土燥木枯，用金须有水配',
  '亥': '初冬·水旺木甫萌，寒木向阳，最需火',
  '子': '仲冬·天寒地冻，非火不化；喜土培、忌金多',
  '丑': '季冬·冻木枯枝，见丙有回春之意，别无用神可取'
};

function zhiIndex(z) { return ZHI.indexOf(z); }

function parseChart(s) {
  var parts = String(s).replace(/[,，、]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length !== 4) {
    throw new Error('四柱格式应为「年柱 月柱 日柱 时柱」，例：庚午 辛巳 庚辰 癸未（虚构示例）');
  }
  var pillars = parts.map(function (p) {
    if (p.length !== 2 || GAN.indexOf(p[0]) < 0 || ZHI.indexOf(p[1]) < 0) {
      throw new Error('非法柱：「' + p + '」');
    }
    return { gan: p[0], zhi: p[1] };
  });
  return pillars;
}

function lookup(dayGan, monthZhi) {
  var mi = MONTH_ZHI.indexOf(monthZhi);
  if (GAN.indexOf(dayGan) < 0) throw new Error('非法日干：' + dayGan);
  if (mi < 0) throw new Error('非法月支：' + monthZhi);
  return { monthIndex: mi, gods: TIAOHOU[dayGan][mi].slice() };
}

// 统计某天干在命局中的落点
function locate(chart, dayGanIdx, god) {
  var hits = [];
  chart.forEach(function (p, i) {
    if (i === dayGanIdx) return; // 日干为日主自身，不计
    var posName = ['年', '月', '日', '时'][i];
    if (p.gan === god) hits.push({ where: posName + '干', kind: '透干' });
  });
  chart.forEach(function (p, i) {
    var posName = ['年', '月', '日', '时'][i];
    var h = HIDDEN[p.zhi] || [];
    h.forEach(function (g, k) {
      if (g === god) {
        hits.push({
          where: posName + '支' + p.zhi,
          kind: k === 0 ? '藏·本气' : (k === 1 ? '藏·中气' : '藏·余气')
        });
      }
    });
  });
  return hits;
}

function verdict(hits, god) {
  var nTou = hits.filter(function (h) { return h.kind === '透干'; }).length;
  if (hits.length === 0) return { tag: '【全无】', score: 0 };
  var strong = hits.some(function (h) { return h.kind === '藏·本气' || h.kind === '透干'; });
  if (nTou >= 2) return { tag: '【已多】', score: 3 };
  if (nTou >= 1 && strong) return { tag: '【有力】', score: 2 };
  return { tag: '【偏弱】', score: 1 };
}

function cmdLookup(args) {
  var dayGan = args[0], monthZhi = args[1];
  var r = lookup(dayGan, monthZhi);
  var out = [];
  out.push('日干 ' + dayGan + '（' + GAN_WX[dayGan] + '） · ' + MONTH_NAME[r.monthIndex] + '（月支 ' + monthZhi + '）');
  out.push('调候候补神： ' + r.gods.join(' · ') + '   （前一字为主神）');
  out.push('气候总则： ' + SEASON[monthZhi]);
  out.push('');
  out.push('同干十二个月全表：');
  MONTH_ZHI.forEach(function (z, i) {
    out.push('  ' + MONTH_NAME[i] + '（' + z + '）: ' + TIAOHOU[dayGan][i].join(' '));
  });
  return out.join('\n');
}

function cmdCheck(args) {
  var chart = parseChart(args.join(' '));
  var dayGan = chart[2].gan;
  var monthZhi = chart[1].zhi;
  var r = lookup(dayGan, monthZhi);
  var out = [];

  out.push('四柱： ' + chart.map(function (p) { return p.gan + p.zhi; }).join(' '));
  out.push('日主： ' + dayGan + '（' + GAN_WX[dayGan] + '）  月令： ' + MONTH_NAME[r.monthIndex] + '（' + monthZhi + '）');
  out.push('气候总则： ' + SEASON[monthZhi]);
  out.push('调候候补神： ' + r.gods.join(' · '));
  out.push('');
  out.push('── 各神在本命的落点 ──');

  var summary = [];
  r.gods.forEach(function (god, i) {
    var hits = locate(chart, 2, god);
    var v = verdict(hits, god);
    var role = (i === 0) ? '主神' : '辅神';
    var lines = hits.length
      ? hits.map(function (h) { return h.where + '（' + h.kind + '）'; }).join('，')
      : '四柱不见';
    out.push('  ' + god + '（' + GAN_WX[god] + '，' + role + '）' + v.tag + ' ' + lines);
    summary.push({ god: god, role: role, score: v.score, tag: v.tag });
  });

  // 禄刃旁证：主神是否恰为日主之禄/刃所在（过量信号）
  out.push('');
  out.push('── 过量/缺位提示（仅提示，不下结论）──');
  var main = summary[0];
  var mainHits = locate(chart, 2, main.god);
  if (mainHits.length === 0) {
    out.push('  · 主神「' + main.god + '」四柱全无 → 调候之「不及」，此神即为调候门第一顺位用神。');
  } else if (main.score >= 3) {
    out.push('  · 主神「' + main.god + '」已两三见 → 属「太过」，须舍之或抑之，改取次神（损其太过）。');
    var next = summary.filter(function (s) { return s.score === 0; })[0];
    if (next) out.push('    → 表中全无的「' + next.god + '」可作替代候选。');
  } else {
    out.push('  · 主神「' + main.god + '」在命有根但未成势 → 常法可用，仍须与格局门对表。');
  }
  // 辅神若已过量，同样要点出来（常见：表列之神命局已两三见，此神亦须舍）
  summary.slice(1).forEach(function (s) {
    if (s.score >= 3) {
      out.push('  · 辅神「' + s.god + '」亦已两三见 → 此神在命中「已足」，' +
        '调候无取之之理，应径取表中其余缺位之神。');
    }
  });

  // 五行粗计数
  var wxCount = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  chart.forEach(function (p, i) {
    wxCount[GAN_WX[p.gan]] += 1;
    var h = HIDDEN[p.zhi] || [];
    h.forEach(function (g, k) { wxCount[GAN_WX[g]] += (k === 0 ? 1 : 0.5); });
  });
  out.push('');
  out.push('── 五行粗计数（干1分，支本气1分、中余气0.5分）──');
  out.push('  ' + Object.keys(wxCount).map(function (k) {
    return k + ' ' + (Math.round(wxCount[k] * 10) / 10);
  }).join('   '));

  // 五行层面的「太过/不及」提示（这一层比单字计数更重要）
  out.push('');
  out.push('── 五行层面的太过/不及（此层优先于单字计数）──');
  var notes = [];
  r.gods.forEach(function (god, i) {
    var wx = GAN_WX[god];
    var v = Math.round(wxCount[wx] * 10) / 10;
    var role = (i === 0) ? '主神' : '辅神';
    if (v >= 3.5) {
      notes.push('  · ' + role + '「' + god + '」所属【' + wx + '】达 ' + v +
        ' → 该行已成势／太过。即便此字本身只透一次，亦当视为「已足」甚至「须抑」，' +
        '优先改取表中其余字（损其太过）。');
    } else if (v <= 1.0 && v > 0) {
      notes.push('  · ' + role + '「' + god + '」所属【' + wx + '】仅 ' + v +
        ' → 该行偏弱（不及），宜扶。');
    }
  });
  if (notes.length === 0) out.push('  · 各调候神所属五行分量均在中段，未见明显太过/不及，常法可直接用。');
  else notes.forEach(function (n) { out.push(n); });
  out.push('  （数个为感觉量级，非精确权重；最终仍按 SKILL.md 第 3 步逐项判强弱。）');

  out.push('');
  out.push('※ 本输出只做查表与标注。用神结论必须走第 3 步定强弱 + 第 4 步四门并参。');
  return out.join('\n');
}

function main() {
  var argv = process.argv.slice(2);
  var cmd = argv[0];
  try {
    if (cmd === 'lookup') return console.log(cmdLookup(argv.slice(1)));
    if (cmd === 'check') return console.log(cmdCheck(argv.slice(1)));
    if (cmd === 'all') return console.log(cmdLookup([argv[1], '寅']));
    console.log('用法：');
    console.log('  node tiaohou.js lookup <日干> <月支>     例：node tiaohou.js lookup 丁 寅');
    console.log('  node tiaohou.js check  "<四柱>"          例：node tiaohou.js check "庚午 辛巳 庚辰 癸未"');
  } catch (e) {
    console.error('错误：' + e.message);
    process.exit(1);
  }
}

main();
