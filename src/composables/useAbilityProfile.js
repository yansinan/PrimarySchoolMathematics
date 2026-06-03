/**
 * 用户能力画像 composable
 *
 * 把 practiceStore.abilityProfile + 自适应阶段答题数据
 * 整合成一个"能力画像"对象，提供给 AbilityCard 等 UI 组件。
 *
 * 关键概念：
 *  - DIAG_LEVELS: 5 级诊断等级（每级 1 题）
 *  - DIFFICULTY_LEVELS: 12 级自适应等级（按级 6+ 道题）
 *  - levelScores（来自诊断）: { L1: { correct, total, accuracy }, ... }
 *  - session.answers（含诊断 + 自适应）: [{ isCorrect, level?, ... }]
 *
 * 提供：
 *  - abilitySummary: 合并诊断 + 自适应数据的强项/薄弱项
 *  - overallAccuracy: 整轮准确率
 *  - currentLevelLabel: 当前自适应等级标签
 *  - levelProgress: 等级进度 (e.g. 8/12)
 */

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { DIAG_LEVELS } from '@/utils/diagnostic'
import { DIFFICULTY_LEVELS, getDifficultyLabel } from '@/utils/adaptiveEngine'

export const STRONG_THRESHOLD = 0.8   // >= 80% 视为强项
export const WEAK_THRESHOLD = 0.5     // < 50% 视为薄弱

/**
 * 单等级评估
 * @param {string} levelId - 'L1' ~ 'L5'
 * @param {Array} answers - 完整 session.answers
 * @returns {{ correct, total, accuracy, hasData }}
 */
function evaluateLevel(levelId, answers) {
  const levelAnswers = answers.filter(a => a.level === levelId)
  if (!levelAnswers.length) {
    return { correct: 0, total: 0, accuracy: 0, hasData: false }
  }
  const correct = levelAnswers.filter(a => a.isCorrect).length
  const total = levelAnswers.length
  return { correct, total, accuracy: correct / total, hasData: true }
}

export function useAbilityProfile() {
  const practiceStore = usePracticeStore()
  const { abilityProfile, session, currentDifficultyIdx, currentGroupIndex } = storeToRefs(practiceStore)

  // 模拟 adaptiveEngine：基于 store 中的 currentDifficultyIdx
  // 真实 engine 在 useAdaptiveSession 内部（Practice.vue 中），这里只读 store 副本
  const adaptiveEngine = computed(() => {
    if (currentDifficultyIdx.value < 0) return null
    return { difficultyIdx: currentDifficultyIdx.value }
  })

  /** 整轮准确率（含诊断 + 自适应所有答题） */
  const overallAccuracy = computed(() => {
    const all = session.value.answers
    if (!all.length) return 0
    return all.filter(a => a.isCorrect).length / all.length
  })

  /** 整轮答题统计 */
  const overallStats = computed(() => {
    const all = session.value.answers
    const correct = all.filter(a => a.isCorrect).length
    return {
      total: all.length,
      correct,
      accuracy: all.length ? correct / all.length : 0,
    }
  })

  /** 强项（按诊断等级或自适应阶段表现） */
  const strongLevels = computed(() => {
    // 诊断等级评估
    const diagStrong = DIAG_LEVELS.filter(level => {
      const stats = evaluateLevel(level.id, session.value.answers)
      return stats.hasData && stats.accuracy >= STRONG_THRESHOLD
    })
    return diagStrong
  })

  /** 薄弱项 */
  const weakLevels = computed(() => {
    const diagWeak = DIAG_LEVELS.filter(level => {
      const stats = evaluateLevel(level.id, session.value.answers)
      return stats.hasData && stats.accuracy < WEAK_THRESHOLD
    })
    return diagWeak
  })

  /** 当前自适应等级标签（基于 adaptiveEngine.difficultyIdx） */
  const currentLevelLabel = computed(() => {
    if (!adaptiveEngine.value) {
      // 未开始自适应
      if (abilityProfile.value?.allCorrect) return '已掌握 ✓'
      if (abilityProfile.value?.weakLevels?.length) {
        const l = abilityProfile.value.weakLevels[0]
        const def = DIAG_LEVELS.find(d => d.id === l)
        return def ? `${def.label}（待加强）` : '待评估'
      }
      return '待评估'
    }
    return getDifficultyLabel(adaptiveEngine.value)
  })

  /** 等级进度：已答组数 / 总目标 */
  const levelProgress = computed(() => {
    const engine = adaptiveEngine.value
    if (!engine) return { current: 0, total: 12, label: '诊断完成' }
    const current = engine.difficultyIdx + 1
    const total = DIFFICULTY_LEVELS.length
    return {
      current,
      total,
      label: DIFFICULTY_LEVELS[current - 1]?.label || '起步',
    }
  })

  /** 诊断阶段正确率（只算 L1~L5 标签的题） */
  const diagAccuracy = computed(() => {
    const diagAnswers = session.value.answers.filter(a => a.level && a.level.startsWith('L'))
    if (!diagAnswers.length) return null
    return {
      total: diagAnswers.length,
      correct: diagAnswers.filter(a => a.isCorrect).length,
    }
  })

  return {
    abilityProfile,
    overallAccuracy,
    overallStats,
    strongLevels,
    weakLevels,
    currentLevelLabel,
    levelProgress,
    diagAccuracy,
  }
}
