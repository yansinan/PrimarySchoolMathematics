/**
 * 题目展示策略 composable
 *
 * 抽离自 Practice.vue:
 *   - displayStats ref (L142)
 *   - applyDisplayModeForCurrentQuestion (L211-255, 45 行)
 *   - generateOptions (L267-277, 11 行)
 *
 * 业务规则:
 *   1. 自适应题(inputMode 字段)查 ASSIST_LEVELS 决定 layout/input
 *   2. 普通题降级到 decideDisplayMode 做 per-question 救援
 *   3. 选项题 generateOptions 生成 4 个干扰项
 *
 * 架构标准: ARCHITECTURE.md § 1.3 决策树 (响应式状态 + 编排 -> composable)
 */

import { ref } from 'vue'
import {
  decideDisplayMode,
  createInitialStats,
  updateDisplayStats,
} from '@/utils/algorithm/displayStrategy'
import { ASSIST_LEVELS } from '@/constants/practice'

/**
 * @param {object} sessionRef - 响应式 session 引用 (Practice.vue 的 session storeToRefs)
 * @param {object} currentQuestionRef - 响应式 currentQuestion 引用
 * @returns {{
 *   displayStats: import('vue').Ref<object>,
 *   applyDisplayModeForCurrentQuestion: () => void,
 *   generateOptions: (correct: number) => void,
 *   resetDisplayStats: () => void,
 *   updateStats: (isCorrect: boolean) => void,
 * }}
 */
export function useDisplayStrategy(sessionRef, currentQuestionRef) {
  // ── 响应式状态 ──
  const displayStats = ref(createInitialStats())

  /**
   * 每题重置 displayStats 为初始状态
   * 由 Practice.vue 的 initPractice 调用 (替代直接调 createInitialStats())
   */
  function resetDisplayStats() {
    displayStats.value = createInitialStats()
  }

  /**
   * 根据当前题目的 inputMode 字段应用 displayMode
   * - 自适应题: 查 ASSIST_LEVELS 决定 layout/input
   * - 普通题: 降级到 decideDisplayMode 做 per-question 救援
   */
  function applyDisplayModeForCurrentQuestion() {
    const q = currentQuestionRef.value
    if (!q) return

    // 自适应题: inputMode 已由 diversifyBatch 写入; 查 ASSIST_LEVELS 表得到 layout/input
    const modeConfig = q.inputMode && ASSIST_LEVELS.find(m => m.key === q.inputMode)

    if (modeConfig) {
      sessionRef.value.displayMode = { layout: modeConfig.layout, input: modeConfig.input }
      if (modeConfig.input === 'options' && q.options?.length) {
        // 选择题: 拷贝引擎预置的 options 数组
        sessionRef.value.currentOptions = [...q.options]
      } else {
        // keypad 题: 清空旧选项数组 (防止上一题残留)
        sessionRef.value.currentOptions = []
      }
      return
    }

    // 非自适应题 (普通 Generate.vue 练习题): 保留 decideDisplayMode 作为 fallback
    const mode = decideDisplayMode(q.equation, displayStats.value)
    sessionRef.value.displayMode = mode
    if (mode.input === 'options') {
      generateOptions(q.solution)
    } else {
      sessionRef.value.currentOptions = []
    }
  }

  /**
   * 生成 4 个选项 (1 正确 + 3 干扰)
   * - 干扰项基于正确值 ±1~5 随机偏移
   * - 排除已选项, 排除 ≤0
   * - 打乱顺序返回
   */
  function generateOptions(correct) {
    const options = [correct]
    while (options.length < 4) {
      const offset = Math.floor(Math.random() * 5) + 1
      const wrong = correct + (Math.random() > 0.5 ? offset : -offset)
      if (wrong > 0 && !options.includes(wrong)) {
        options.push(wrong)
      }
    }
    sessionRef.value.currentOptions = options.sort(() => Math.random() - 0.5)
  }

  /**
   * 更新 displayStats（封装 updateDisplayStats 调用）
   * 由 V 层在 handleSubmit 中调用，传入 isCorrect
   * 内部完成"读旧 stats → 调 updateDisplayStats 算新 stats → 写回"
   * @param {boolean} isCorrect
   * @returns {void}
   */
  const updateStats = (isCorrect) => {
    displayStats.value = updateDisplayStats(displayStats.value, isCorrect)
  }

  return {
    displayStats,
    applyDisplayModeForCurrentQuestion,
    generateOptions,
    resetDisplayStats,
    updateStats,
  }
}
