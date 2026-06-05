import { computed, unref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { useAbilityAnalysis } from '@/composables/useAbilityAnalysis'
import { DIAG_LEVELS } from '@/utils/diagnostic'
import { DIFFICULTY_LEVELS } from '@/utils/adaptiveEngine'
import { getAnswerScore, sumAnswerScores } from '@/utils/score'

function resolveSource(source, fallback) {
  return computed(() => {
    const value = unref(source)
    if (value != null) return value
    return typeof fallback === 'function' ? fallback() : fallback
  })
}

function evaluateLevelByScore(levelId, answers) {
  const list = (answers || []).filter((answer) => answer.level === levelId)
  if (!list.length) return { total: 0, score: 0, hasData: false }
  return {
    total: list.length,
    score: sumAnswerScores(list) / list.length,
    hasData: true,
  }
}

export function useAbilityProfile(options = {}) {
  const practiceStore = options.practiceStore || usePracticeStore()
  const storeRefs = storeToRefs(practiceStore)
  const analysis = options.analysis || useAbilityAnalysis()

  const answers = resolveSource(options.answers, () => {
    const adaptiveAnswers = storeRefs.adaptiveAnswers.value || []
    return adaptiveAnswers.length ? adaptiveAnswers : (storeRefs.session.value?.answers || [])
  })

  const diagAnswers = resolveSource(options.diagAnswers, () => storeRefs.abilityProfile.value?.diagAnswers || [])
  const currentDifficultyIdx = resolveSource(options.currentDifficultyIdx, () => practiceStore.currentDifficultyIdx)

  const statsTotal = resolveSource(options.statsTotal, () => (answers.value || []).length)
  const statsCorrect = resolveSource(options.statsCorrect, () => sumAnswerScores(answers.value || []))
  const statsLevel = resolveSource(options.statsLevel, () => Math.max(1, currentDifficultyIdx.value + 1))
  const statsLevelTotal = resolveSource(options.statsLevelTotal, () => DIFFICULTY_LEVELS.length)
  const statsLevelLabel = resolveSource(options.statsLevelLabel, () => {
    const idx = Math.max(0, currentDifficultyIdx.value)
    return DIFFICULTY_LEVELS[idx]?.label || '—'
  })

  const masteryByNumber = resolveSource(options.masteryByNumber, () => analysis.masteryByNumber.value)
  const masteryByNumberFull = resolveSource(options.masteryByNumberFull, () => analysis.masteryByNumberFull.value)
  const weaknessByNumber = resolveSource(options.weaknessByNumber, () => analysis.weaknessByNumber.value)
  const strengthByNumber = resolveSource(options.strengthByNumber, () => analysis.strengthByNumber.value)
  const midByNumber = resolveSource(options.midByNumber, () => analysis.midByNumber.value)
  const wrongPriorityList = resolveSource(options.wrongPriorityList, () => analysis.wrongAnswersPriority.value)
  const priorityLimit = options.priorityLimit ?? 5

  const totalAnswers = computed(() => statsTotal.value)
  const scoreSum = computed(() => statsCorrect.value)
  const avgScore = computed(() => (totalAnswers.value > 0 ? scoreSum.value / totalAnswers.value : 0))
  const rate = computed(() => Math.round(avgScore.value * 100))
  const rateColor = computed(() => {
    if (avgScore.value >= 0.8) return '#27ae60'
    if (avgScore.value >= 0.5) return '#e6a23c'
    return '#f56c6c'
  })

  const hasData = computed(() => totalAnswers.value > 0)
  const displayAccuracy = computed(() => avgScore.value)
  const accuracyClass = computed(() => {
    if (displayAccuracy.value >= 0.8) return 'ability-card__value--strong'
    if (displayAccuracy.value < 0.5) return 'ability-card__value--weak'
    return 'ability-card__value--mid'
  })

  const levelCurrentDisplay = computed(() => Math.max(1, currentDifficultyIdx.value + 1))
  const currentLevelLabel = computed(() => statsLevelLabel.value)
  const progressPercent = computed(() => {
    if (statsLevelTotal.value <= 0) return 0
    return Math.min(100, Math.max(0, (statsLevel.value / statsLevelTotal.value) * 100))
  })

  const strongLevels = computed(() => {
    return DIAG_LEVELS.filter((level) => {
      const stat = evaluateLevelByScore(level.id, diagAnswers.value)
      return stat.hasData && stat.total >= 3 && stat.score >= 1
    }).map((level) => level.label)
  })

  const weakLevels = computed(() => {
    return DIAG_LEVELS.filter((level) => {
      const stat = evaluateLevelByScore(level.id, diagAnswers.value)
      return stat.hasData && stat.total >= 1 && stat.score < 0.5
    }).map((level) => level.label)
  })

  const hasMasteryData = computed(() => {
    const value = masteryByNumberFull.value || {}
    return Object.values(value).some((item) => {
      if (typeof item === 'number') return item > 0
      return (item?.total || 0) > 0 || (item?.score || 0) > 0 || (item?.accuracy || 0) > 0
    })
  })

  function masteryPercent(number) {
    const value = masteryByNumber.value || {}
    const score = value[number]
    if (score == null) return 0
    return Math.round(score * 100)
  }

  function masteryCellClass(number) {
    const percent = masteryPercent(number)
    if (percent === 0) return 'ability-card__mastery-cell--empty'
    if (percent < 50) return 'ability-card__mastery-cell--weak'
    if (percent < 80) return 'ability-card__mastery-cell--mid'
    return 'ability-card__mastery-cell--strong'
  }

  const strengthEncouragement = computed(() => {
    const list = strengthByNumber.value || []
    if (!list.length) return ''
    const top3 = list.slice(0, 3).map((item) => item.number)
    if (!top3.length) return ''
    if (top3.length === 1) return `${top3[0]} 的运算是你最拿手的！`
    if (top3.length === 2) return `${top3[0]}、${top3[1]} 的运算是你最拿手的！`
    return `${top3[0]}、${top3[1]}、${top3[2]} 的运算是你最拿手的！`
  })

  const fullCorrectCount = computed(() => {
    return (answers.value || []).filter((answer) => getAnswerScore(answer) === 1).length
  })

  // 顶层包 weaknessV2 / strengthV2, V 模板不用写 .value
  const weaknessV2Flat = computed(() => analysis.weaknessV2.value)
  const strengthV2Flat = computed(() => analysis.strengthV2.value)

  // 顶层包 weaknessByNumber / strengthByNumber, V 模板不用写 .value
  // SelfEvaluationDialog 模板用: <div v-if="weaknessByNumberFlat.length || ...">
  // 防止模板误写 .value 导致运行期崩 (P0-1 修复)
  const weaknessByNumberFlat = computed(() => {
    const v = weaknessByNumber.value
    return Array.isArray(v) ? v : []
  })
  const strengthByNumberFlat = computed(() => {
    const v = strengthByNumber.value
    return Array.isArray(v) ? v : []
  })

  // V 层委托: 用指定 answers 刷新 mastery (V 层不直连 analysis)
  // SelfEvaluationDialog 弹窗打开时调 1 行
  async function refreshMasteryFromAnswers(answers) {
    await analysis.refreshMasteryFromAnswers(answers || [])
  }

  /**
   * 弹窗打开时的"刷新汇总数据"方法
   * 封装: 答案源选择 → refresh() → refreshMasteryFromAnswers()
   * 业务规则下沉到 C 层, V 层只调 1 行
   */
  async function refreshForSummary() {
    const answersSource = (storeRefs.adaptiveAnswers.value && storeRefs.adaptiveAnswers.value.length)
      ? storeRefs.adaptiveAnswers.value
      : (storeRefs.session.value?.answers || [])
    await analysis.refresh()
    await analysis.refreshMasteryFromAnswers(answersSource || [])
  }

  return {
    analysis,
    answers,
    diagAnswers,
    currentDifficultyIdx,
    statsTotal,
    statsCorrect,
    statsLevel,
    statsLevelTotal,
    statsLevelLabel,
    masteryByNumber,
    masteryByNumberFull,
    weaknessByNumber,
    strengthByNumber,
    midByNumber,
    wrongPriorityList,
    priorityLimit,
    totalAnswers,
    scoreSum,
    avgScore,
    rate,
    rateColor,
    hasData,
    displayAccuracy,
    accuracyClass,
    levelCurrentDisplay,
    currentLevelLabel,
    progressPercent,
    strongLevels,
    weakLevels,
    hasMasteryData,
    masteryPercent,
    masteryCellClass,
    strengthEncouragement,
    fullCorrectCount,
    // 新增: V 模板不用 .value
    weaknessV2Flat,
    strengthV2Flat,
    // 新增 (arch-v2.3-2): V 模板不用 .value (单数字维度)
    weaknessByNumberFlat,
    strengthByNumberFlat,
    // 新增: 弹窗打开时一键刷新
    refreshForSummary,
    // 新增 (arch-v2.3-2): 用指定 answers 刷新 mastery (SelfEvaluationDialog 委托)
    refreshMasteryFromAnswers,
  }
}