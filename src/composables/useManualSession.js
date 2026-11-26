/**
 * 自定义练习（手动题单）分组会话
 *
 * 解决的问题：自定义练习现在把 N 张卷子的题目拍平成一个 listPractices，
 * 一组做完就直接跳整轮总结 —— 没有组反馈、没有自评、没有「还有下一组」。
 *
 * 这里只补「组边界」这一段：本组最后一题答完 →
 *   组反馈音 → 自评弹窗 → 写组 checkpoint → 跳到下一组起点
 * 最后一组仍然交给 Practice.vue 的 handlePracticeComplete 出整轮总结。
 *
 * 三条硬约束（见 designDocs/18-PLAN-manual-groups.md）：
 *  1. **不清 session.answers** —— 手动路径整轮答案都在里面，
 *     清掉会让 correctCount / 整轮汇总只剩最后一组（自适应才按组清）
 *  2. **不碰自适应引擎** —— 不调 evaluateGroup / adjustNextQuestion，
 *     否则题目会被引擎改写（"手动题单做完就是结束，不能被自适应接管"）
 *  3. **同轮共用一个 practiceSessionId** —— 组 checkpoint 只是同轮的多条记录，
 *     PracticeSession.list 会按 pid 合并，轮次数不变
 *
 * @see services/PracticeSession.js — computeSessionStats 的 practiceType 判据
 * @see composables/usePracticeSaver.js — saveManualGroupCheckpoint
 */

import { ref } from 'vue'
import { usePracticeStore } from '@/stores/practice'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { playSfx } from '@/utils/sound/sfx'
import { getGroupComment } from '@/constants/practice'
import { sumResponseTimes } from '@/utils/score'
import { formatDuration } from '@/utils/time/timeFormat'
import { Answer } from '@/services'
import { buildGroupRanges, rangeOfGroup } from '@/utils/groupPlan'

/**
 * @param {object} [options]
 * @param {object} [options.dialogs] 弹窗 composable（测试注入）
 * @param {object} [options.saver]   持久化 composable（测试注入）
 * @param {Function} [options.playSound] 音效函数（测试注入）
 */
export function useManualSession(options = {}) {
  const practiceStore = usePracticeStore()
  const dialogs = options.dialogs || usePracticeDialogs()
  const saver = options.saver || usePracticeSaver()
  const playSound = options.playSound || playSfx

  /** 本轮的分组区间（由 Generate.vue 的组计划换算而来） */
  const manualGroupRanges = ref([])
  /** 当前组序号（1 基） */
  const manualGroupIndex = ref(1)

  /**
   * 设置本轮分组计划
   * @param {number[]} plan 每组的题数（一张卷子 = 一组）
   */
  function setGroupPlan(plan) {
    manualGroupRanges.value = buildGroupRanges(plan)
    manualGroupIndex.value = 1
  }

  /** 清空（换新一轮 / 退出练习时） */
  function resetGroupPlan() {
    manualGroupRanges.value = []
    manualGroupIndex.value = 1
  }

  /** 是否还有下一组 */
  function hasNextGroup() {
    return manualGroupIndex.value < manualGroupRanges.value.length
  }

  /** 本组题号区间（按当前题号算） */
  function currentRange() {
    return rangeOfGroup(manualGroupRanges.value, practiceStore.session.currentIndex)
  }

  /**
   * 一组做完：组反馈 → 自评 → checkpoint → 跳到下一组起点
   *
   * @returns {Promise<'continue' | 'last'>}
   *   'continue' 已进入下一组（调用方不要再做整轮总结）
   *   'last'     最后一组，调用方交给 handlePracticeComplete
   */
  async function completeManualGroup() {
    const range = currentRange()
    if (!range) return 'last'

    const all = practiceStore.session.answers || []
    const instances = all.map(a => (a instanceof Answer ? a : new Answer(a)))
    // 取「本组」的答案：answers 是整轮累计，按题号区间切
    const groupAnswers = instances.slice(range.start)
    const groupCorrect = groupAnswers.filter(a => a.isCorrect).length
    const groupTime = sumResponseTimes(groupAnswers)
    const total = groupAnswers.length
    const correctRate = total > 0 ? Math.round((groupCorrect / total) * 100) : 0

    // ── 组反馈音 + 自评弹窗 ──
    let evaluationScore = 3
    try {
      playSound('group', { perfect: total > 0 && groupCorrect === total })
      evaluationScore = (await dialogs.showSelfEvaluationDialog({
        groupIndex: manualGroupIndex.value,
        correctCount: groupCorrect,
        totalCount: total,
        timeText: formatDuration(groupTime),
        comment: getGroupComment(correctRate, groupTime, total),
      })) ?? 3
    } catch { /* 弹窗关闭异常 → 保持默认 3 */ }

    // ── 组 checkpoint（同轮共用 pid，completed:false）──
    try {
      await saver.saveManualGroupCheckpoint({
        groupIndex: manualGroupIndex.value,
        score: evaluationScore,
        count: total,
      })
    } catch { /* 落库失败不影响继续练 */ }

    if (!hasNextGroup()) return 'last'

    // ── 进入下一组：只跳题号 + 重置每题输入状态，**不清 session.answers** ──
    const nextGroup = manualGroupRanges.value[manualGroupIndex.value] // index 1-based → 下一组
    manualGroupIndex.value = nextGroup.index
    practiceStore.session.currentIndex = nextGroup.start
    practiceStore.currentGroupIndex = nextGroup.index
    practiceStore.resetQuestionInputState()
    practiceStore.resetCurrentIndex?.()
    // resetCurrentIndex 会把 currentIndex 归零，这里重新定位到下一组起点
    practiceStore.session.currentIndex = nextGroup.start
    return 'continue'
  }

  return {
    manualGroupRanges,
    manualGroupIndex,
    setGroupPlan,
    resetGroupPlan,
    hasNextGroup,
    completeManualGroup,
  }
}
