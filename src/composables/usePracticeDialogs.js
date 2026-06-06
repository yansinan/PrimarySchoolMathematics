/**
 * 练习弹窗 composable
 *
 * 把 Practice.vue 中的两处 ElMessageBox 调用替换为 Promise 化的接口：
 *  - showPracticeSummaryDialog(opts): 返回 Promise<'confirm' | 'cancel' | 'close'>
 *  - showSelfEvaluationDialog(opts): 返回 Promise<1|2|3|4|5>
 *
 * 配合 PracticeSummaryDialog.vue / SelfEvaluationDialog.vue 使用。
 *
 * 用法：
 *   const dialogs = usePracticeDialogs()
 *   const action = await dialogs.showPracticeSummaryDialog({ ... })
 *   const score = await dialogs.showSelfEvaluationDialog({ ... })
 */

import { ref } from 'vue'

export function usePracticeDialogs() {
  // ── PracticeSummaryDialog 状态 ──
  const summaryVisible = ref(false)
  const summaryProps = ref({})
  /** @type {Promise<'confirm' | 'cancel' | 'close'> | null} */
  let summaryResolver = null

  // ── SelfEvaluationDialog 状态 ──
  const evalVisible = ref(false)
  const evalProps = ref({})
  /** @type {Promise<number> | null} */
  let evalResolver = null

  /**
   * 显示练习汇总弹窗
   * @param {{
   *   emoji?: string,
   *   comment?: string,
   *   totalAnswers: number,
   *   correctAnswers: number,
   *   rate: number,
   *   rateColor: string,
   *   totalTime?: string,
   *   confirmText?: string,
   *   cancelText?: string,
   * }} opts
   * @returns {Promise<'confirm' | 'cancel' | 'close'>}
   */
  function showPracticeSummaryDialog(opts) {
    summaryProps.value = {
      emoji: '🏆',
      comment: '',
      totalAnswers: 0,
      correctAnswers: 0,
      rate: 0,
      rateColor: '#27ae60',
      totalTime: '',
      confirmText: '📊 分析',
      cancelText: '🏠 首页',
      ...opts,
    }
    summaryVisible.value = true
    return new Promise((resolve) => {
      summaryResolver = resolve
    })
  }

  function onSummarySelect(action) {
    if (summaryResolver) {
      summaryResolver(action)
      summaryResolver = null
    }
  }

  /**
   * 显示自我评价弹窗
   * @param {{
   *   groupIndex: number,
   *   correctCount: number,
   *   totalCount: number,
   *   timeText: string,
   *   comment: string,
   *   groupAnswers?: Array,  // P2 阶段 11：本组 answers（v2 弱项/强项分析用）
   * }} opts
   * @returns {Promise<number>} score 1-5
   */
  function showSelfEvaluationDialog(opts) {
    evalProps.value = {
      groupIndex: 1,
      correctCount: 0,
      totalCount: 0,
      timeText: '00:00',
      comment: '',
      groupAnswers: [],
      ...opts,
    }
    evalVisible.value = true
    return new Promise((resolve) => {
      evalResolver = resolve
    })
  }

  function onEvalSelect(score) {
    if (evalResolver) {
      evalResolver(score)
      evalResolver = null
    }
    // 在 select 事件处理（completeGroup）恢复之前关 dialog
    // 避免 completeGroup 执行过程中 watch 重开 dialog
    evalVisible.value = false
  }

  return {
    // 汇总弹窗
    summaryVisible,
    summaryProps,
    showPracticeSummaryDialog,
    onSummarySelect,
    // 自我评价弹窗
    evalVisible,
    evalProps,
    showSelfEvaluationDialog,
    onEvalSelect,
  }
}
