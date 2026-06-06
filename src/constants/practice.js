/**
 * 练习模块常量集中管理
 *
 * 把散落在 Practice.vue / adaptiveEngine.js 的魔法数字统一到这里。
 * 命名规范：
 *  - 反馈时延：FEEDBACK_DELAYS
 *  - 评价阈值：EVAL_THRESHOLDS
 *  - 评语分级：COMMENT_THRESHOLDS
 *  - 自适应速度：SPEED_THRESHOLDS
 *  - 自适应正确率：ACCURACY_THRESHOLDS
 *  - 小组最小组数：MIN_GROUPS_PER_DIMENSION
 *
 * 调用方：Practice.vue、adaptiveEngine.js、useAdaptiveSession.js 等
 */

/* ============================================================
   反馈时延（毫秒）
   ============================================================ */
// 答对/答错后到自动跳下一题 / 清除反馈的等待时间
export const FEEDBACK_DELAYS = {
  correct: 800,           // 答对后 0.8s 自动 next
  wrong: 1500,            // 答错后 1.5s 清空提示
  assessmentAbort: 1500,  // 评估模式下连续错 2 次，提前结束的反馈时延
}

/* ============================================================
   评价阈值（正确率 %）
   ============================================================ */
// 用于评语分级（emoji/comment/颜色）
// 语义：rate >= minRate 命中该档；COMMENT_THRESHOLDS 末尾有 minRate=0 兜底
export const COMMENT_THRESHOLDS = [
  { minRate: 95, emoji: '🏆', comment: '太棒了！你是数学小达人！', color: '#27ae60' },
  { minRate: 80, emoji: '🌟', comment: '做得很好！继续保持！',     color: '#27ae60' },
  { minRate: 60, emoji: '💪', comment: '不错哦！每次练习都会进步！', color: '#e6a23c' },
  { minRate: 0,  emoji: '🌱', comment: '没关系，多练几次就能掌握！', color: '#e74c3c' },
]

/**
 * 根据正确率返回评语配置
 * @param {number} rate - 正确率百分比（0~100）
 * @returns {{emoji:string,comment:string,color:string}}
 *
 * 实现：从高到低遍历，找到第一个 `rate >= minRate` 的档位
 * 边界正确性：rate=95 → 🏆；rate=80 → 🌟（80 >= 80 命中 80 档，不继续落到 60 档）
 */
export function getCommentByRate(rate) {
  for (const t of COMMENT_THRESHOLDS) {
    if (rate >= t.minRate) return t
  }
  return COMMENT_THRESHOLDS[COMMENT_THRESHOLDS.length - 1]
}

/* ============================================================
   自适应速度阈值（毫秒 / 题）
   ============================================================ */
// 单题平均用时对应 speedAdjust 偏移量
// speedAdjust 用于调整下一组的题数（getGroupSize 公式）
// 2026-06-04 调整：整体阈值上调 +2s（原 3000/5000/8000/12000/Infinity）
// 原因：原阈值偏严，难度提升概率低；上调后更能让学生"够得到"进阶。
export const SPEED_THRESHOLDS = [
  { maxTime: 5000,  adjust: 2,  label: '极快' },        // 原 3000 → 5000
  { maxTime: 7000,  adjust: 1,  label: '快'   },        // 原 5000 → 7000
  { maxTime: 10000, adjust: 0,  label: '正常' },        // 原 8000 → 10000
  { maxTime: 14000, adjust: -1, label: '慢'   },        // 原 12000 → 14000
  { maxTime: Infinity, adjust: -2, label: '极慢' },
]

/* ============================================================
   自适应正确率阈值
   ============================================================ */
// 连续答好多 → 升阶；连续答差 → 降阶
export const ACCURACY_THRESHOLDS = {
  good: 0.80,   // ≥ 80% 视为本组答好
  bad:  0.50,   // < 50% 视为本组答差
}

/* ============================================================
   评价模式阈值
   ============================================================ */
// 评估模式下：连续错 N 题则提前结束评估
export const ASSESSMENT_ABORT_WRONG_STREAK = 2

// 自适应引擎：同一维度至少练 N 组才考虑变动
// 2026-06-06：从 6 降到 5（配合画像出题策略 G1/G2/G3/G4/GN 五组节奏）
export const MIN_GROUPS_PER_DIMENSION = 5

// 自适应引擎：连续答好多组才升阶
export const CONSECUTIVE_GOOD_TO_ADVANCE = 3

/* ============================================================
   小组评语（自适应）
   ============================================================ */
// 一组题做完后给学生的简短评语（区别于本轮总结）
// 基于正确率 + 平均用时
export const GROUP_COMMENT_RULES = [
  {
    check: (rate, time, count) => rate === 100 && time < count * 5000,
    text: '又快又准！👍',
  },
  {
    check: (rate) => rate >= 80,
    text: '表现不错！💪',
  },
  {
    check: (rate) => rate >= 60,
    text: '继续加油！📝',
  },
  {
    check: () => true,
    text: '别灰心，再来一组！',
  },
]

/**
 * 根据小组表现返回评语文案
 * @param {number} rate - 正确率百分比
 * @param {number} time - 总用时（毫秒）
 * @param {number} count - 题目数
 * @returns {string}
 */
export function getGroupComment(rate, time, count) {
  const rule = GROUP_COMMENT_RULES.find(r => r.check(rate, time, count))
  return rule ? rule.text : '继续努力！'
}

/* ============================================================
   画像出题策略 — 组比例配置（P5 v2.3.0）
   ============================================================ */
// 各组的强/弱/挑战题比例
// weak 为区间值 [base, max]：实际取值 = base + weakSeverity × (max - base)
// weakSeverity = 1 - 该 weakLevel 历史准确率（越高越严重 → 弱项占比越高）
export const PROFILE_RATIOS = {
  confidence: { strong: 0.60, weakMin: 0.20, weakMax: 0.40, challenge: 0.15 },
  repair:     { strong: 0.40, weakMin: 0.40, weakMax: 0.60, challenge: 0 },
  mixed:      { strong: 0.40, weak: 0.40, challenge: 0.20 },
}

/** 出题时额外生成的备用题池大小（用于动态微调替换） */
export const RESERVE_POOL_SIZE = 3

/* ============================================================
   画像阈值 — 统一口径（P2 B7/B9）
   ============================================================ */
/** 强项正确率下限：≥此值算强项 */
export const STRONG_THRESHOLD = 0.95
/** 弱项正确率上限：<此值算弱项 */
export const WEAK_THRESHOLD = 0.5

/* ============================================================
   输入辅助模式 — 降低认知负荷，帮学生建立信心
//
// 难度顺序（从易→难）：choice2(最简单) < choice4 < vertical_keypad(竖式标准) < horizontal_keypad(横式掌握验证)
// 索引对应：0 = 最易（二选一），2 = 标准（竖式），3 = 横式验证（特殊触发）
*/
export const ASSIST_LEVELS = [
  { key: 'choice2',           label: '二选一', layout: 'horizontal', input: 'options', optionCount: 2 },
  { key: 'choice4',           label: '四选一', layout: 'horizontal', input: 'options', optionCount: 4 },
  { key: 'vertical_keypad',   label: '竖式',   layout: 'vertical',   input: 'keypad',  optionCount: 0 },
  { key: 'horizontal_keypad', label: '横式',   layout: 'horizontal', input: 'keypad',  optionCount: 0 },
]
/** assistLevel 常规范围上限（排除 horizontal_keypad 特殊模式） */
export const MAX_NORMAL_ASSIST_LEVEL = 2

/* ============================================================
   横式掌握验证（Mastery Check）配置
   ============================================================ */
// 参数集中在 constants 中，不写死在引擎逻辑里，后续可随时微调。
export const MASTERY_CHECK_CONFIG = {
  triggerThreshold: 1,        // vertical 连续答对 N 道后才考虑触发；=1 表示每答对都有机会
  triggerProbability: 0.5,    // 触发判定时的概率 (0.5 = 50%)
  targetPasses: 2,            // 横式答对 N 道算通过 → 升难度
  requiredAssistLevel: 0,     // 仅在 assistLevel=N 下触发 (0 = 标准模式)
}

/* ============================================================
   题目最大重试次数 (PR-fix-7.1 新增)
   ============================================================ */
/**
 * 题目最大重试次数 (PR-fix-7.1 新增)
 *
 * 设计:
 *   - attemptCount 1: 首次答题
 *   - attemptCount 2-3: 重试机会
 *   - attemptCount 4+: 强制跳过 (P2-15 阶段 score 已衰减为 0)
 *
 * UI 行为:
 *   - 第 1 次答错: 留当前题, 清空输入让用户重答
 *   - 第 2-3 次答错: 留当前题, 提示已重试 N 次
 *   - 第 4 次答错 (attemptCount >= 4): 强制跳下一题, ElMessage 提示
 */
export const MAX_ATTEMPT_PER_QUESTION = 3
