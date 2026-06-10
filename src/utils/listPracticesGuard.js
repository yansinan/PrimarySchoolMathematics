/**
 * listPractices 状态转换决策（纯函数，可测）
 *
 * 抽离自 components/Practice.vue 的 watch(listPractices) 防御性逻辑：
 * - 题目非空 → 准备开始新一组
 * - 题目空 + 有画像 + adaptiveEngine 未就绪 → 启动新自适应会话
 * - 题目空 + 练习模式 + 无画像 → 重新进入诊断
 *
 * 设计原则：纯函数 + 不可变输入 → 接收上下文，输出 decision 对象。
 * 调用方（Practice.vue）负责副作用：resetGroupAnswers / initPractice / startNewAdaptiveSession 等。
 *
 * @see components/Practice.vue — 调用方
 */

/**
 * @typedef {Object} TransitionContext
 * @property {Array}  newList - 新的题目列表
 * @property {Array}  [savedAnswers=[]] - 上一组累积的 answers（adaptive 第 2+ 组传入）
 * @property {boolean} [isAdaptiveTransition=false] - 是否 adaptive 组间切换（第 2+ 组）
 * @property {boolean} hasAdaptiveEngine - adaptiveEngine 是否就绪
 * @property {boolean} hasProfile - abilityProfile 是否存在
 * @property {string}  phase - 当前 phase ('idle' | 'assessment' | 'practice')
 */

/**
 * @typedef {Object} GroupStartAction
 * @property {Array}  savedAnswers - 需保留的旧 answers（自适应第 2+ 组恢复用）
 * @property {number} offset - groupAnswerOffset 起点
 * @property {boolean} shouldResetCurrentIndex - 是否调用 resetCurrentIndex
 * @property {boolean} shouldReinitPractice - 是否调用 initPractice
 * @property {boolean} shouldRestoreAnswers - 是否在 init 后恢复 session.answers
 */

/**
 * @typedef {'START_ADAPTIVE' | 'RESTART_DIAGNOSTIC'} CompletionKind
 */

/**
 * @typedef {Object} CompletionAction
 * @property {CompletionKind} kind
 */

/**
 * @typedef {Object} TransitionDecision
 * @property {'GROUP_START' | 'COMPLETION' | 'NOOP'} type
 * @property {GroupStartAction | CompletionAction | null} action
 */

/**
 * 计算 listPractices 变化时的状态转换决策
 *
 * 三种决策：
 * 1. GROUP_START - newList 非空，进入新一组准备
 * 2. COMPLETION  - newList 为空，根据画像/engine 状态选择下一步
 * 3. NOOP       - 不需要任何处理
 *
 * @param {TransitionContext} ctx
 * @returns {TransitionDecision}
 */
export function decideListPracticesTransition(ctx) {
  const {
    newList,
    savedAnswers = [],
    isAdaptiveTransition = false,
    hasAdaptiveEngine,
    hasProfile,
    phase,
  } = ctx

  // 分支 1: 题目非空 → 准备开始新一组
  if (newList.length > 0) {
    return {
      type: 'GROUP_START',
      action: {
        savedAnswers: isAdaptiveTransition ? [...savedAnswers] : [],
        offset: savedAnswers.length,
        shouldResetCurrentIndex: true,
        shouldReinitPractice: true,
        shouldRestoreAnswers: isAdaptiveTransition,
      },
    }
  }

  // 分支 2: 题目空 + 有画像 + adaptiveEngine 未就绪 → 启动新自适应
  if (hasProfile && !hasAdaptiveEngine) {
    return { type: 'COMPLETION', action: { kind: 'START_ADAPTIVE' } }
  }

  // 分支 3: 题目空 + 练习模式 + 无画像 → 重新进入诊断
  if (phase === 'practice' && !hasProfile) {
    return { type: 'COMPLETION', action: { kind: 'RESTART_DIAGNOSTIC' } }
  }

  return { type: 'NOOP', action: null }
}
