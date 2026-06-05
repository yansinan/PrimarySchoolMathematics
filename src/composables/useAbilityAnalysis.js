// filepath: src/composables/useAbilityAnalysis.js
/**
 * 用户能力分析 composable
 *
 * 包装 services/analysis.js 的服务层为响应式数据 + 触发方法。
 *
 * 阶段 6（v2.0）：暴露 API，不接入调用链（阶段 7 启用）。
 *
 * 触发时机（设计）：
 *   答完一题             → refreshWeakness()      （轻量）
 *   答完一组 / 完成整轮  → refresh()              （全量）
 *   进首页 / StatsDrawer → refresh()              （全量）
 *   打开 PracticeSummaryDialog → refresh()        （全量）
 *
 * 设计文档：designDocs/PLAN-v2-ability-analysis.md § 4
 */

import { ref } from 'vue'
import * as analysis from '@/services'

// ─── 设计常量 ────────────────────────────────────────────────
/** 时间窗口：所有"近期"聚合查询的默认天数（与 services/analysis.js 默认值对齐） */
const DEFAULT_DAYS = 30
/** 错题优先级返回条数 */
const DEFAULT_WRONG_LIMIT = 20

export function useAbilityAnalysis() {
  // ── 响应式状态 ──
  /**
   * 弱项 v2：动态弱项（accuracy 升序）
   * 类型: Array<{ questionId, equation, total, correct, accuracy, avgResponseTime, lastSeenAt }>
   */
  const weaknessV2 = ref([])

  /**
   * 强项 v2：动态强项（综合 accuracy + 响应速度，score 降序）
   * 类型: Array<{ questionId, equation, total, correct, accuracy, avgResponseTime, lastSeenAt, score }>
   */
  const strengthV2 = ref([])

  /**
   * 数字掌握度：{ 0: 0.85, 1: 0.6, ..., 9: 0.7 }
   * - key: 数字 0-9
   * - value: accuracy（0-1）
   */
  const masteryByNumber = ref({})

  /**
   * P2 阶段 11：数字掌握度完整详情（用于派生弱项/强项）
   * - 形状：{ 0: { accuracy, total, correct, questionsCount, days }, ... }
   * - 保留与 masteryByNumber 同时刷新（同一函数调一次）
   */
  const masteryByNumberFull = ref({})

  /**
   * 错题优先级（综合错误频率 / 未改正 / 最近出错，priority 降序）
   * 类型: Array<{ questionId, equation, operator, difficulty, wrongCount, totalAttempts, lastWrongAt, lastCorrectAt, isResolved, priority }>
   */
  const wrongAnswersPriority = ref([])

  // ── P2 阶段 11：单数字维度派生（弱项 v2 / 强项 v2） ──
  /**
   * 弱项 v2（单数字）：accuracy < 0.7 且 total > 0
   * 形状: Array<{ number, accuracy, total, correct, questionsCount }>
   */
  const weaknessByNumber = ref([])

  /**
   * 强项 v2（单数字）：accuracy >= 0.8 且 total >= 3
   * 形状: Array<{ number, accuracy, total, correct, questionsCount }>
   */
  const strengthByNumber = ref([])

  /**
   * 中间档 v2（单数字）：0.5 <= score < 1 且 total >= 3
   * 形状: Array<{ number, score, total, correct, questionsCount }>
   */
  const midByNumber = ref([])

  /**
   * 学习曲线缓存：{ [questionId]: curve[] }
   * - curve 元素: { timestamp, startedAt, endedAt, isCorrect, responseTime, isTimeout, userAnswer, attemptIndex }
   */
  const learningCurves = ref({})

  /** 是否正在加载（任一方法执行中） */
  const loading = ref(false)

  /** 最近一次成功刷新的时间戳（ms） */
  const lastRefreshedAt = ref(null)

  /** 最近一次错误的 Error 对象（设计文档未列，调试时有用） */
  const lastError = ref(null)

  // ── 方法 ──

  /**
   * 全量刷新：weaknessV2 + strengthV2 + wrongAnswersPriority
   * - 用 Promise.all 并发请求，节省延迟
   * - 触发时机：答完一组 / 完成整轮 / 进首页 / 打开汇总弹窗
   *
   * @returns {Promise<void>}
   */
  async function refresh() {
    loading.value = true
    lastError.value = null
    try {
      const [w, s, p] = await Promise.all([
        analysis.getDynamicWeakness(),
        analysis.getDynamicStrength(),
        analysis.prioritizeWrongAnswers({ limit: DEFAULT_WRONG_LIMIT }),
      ])
      weaknessV2.value = w
      strengthV2.value = s
      wrongAnswersPriority.value = p
      lastRefreshedAt.value = Date.now()
    } catch (err) {
      lastError.value = err
      console.error('[useAbilityAnalysis] refresh failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 轻量刷新：仅 weaknessV2
   * - 设计用于"答完一题"后调用（避免每次都重算全部）
   * - 不更新 lastRefreshedAt（轻量调用，频率高）
   *
   * @returns {Promise<void>}
   */
  async function refreshWeakness() {
    loading.value = true
    lastError.value = null
    try {
      const w = await analysis.getDynamicWeakness()
      weaknessV2.value = w
    } catch (err) {
      lastError.value = err
      console.error('[useAbilityAnalysis] refreshWeakness failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载 numbers 0-9 的掌握度（轻量，命中 *operands multiEntry 索引）
   * - 设计用于"答完一组"或"完成整轮"后调用
   * - 写入 masteryByNumber: { 0: 0.85, 1: 0.6, ..., 9: 0.7 }
   *
   * @returns {Promise<void>}
   */
  async function refreshMastery() {
    loading.value = true
    lastError.value = null
    try {
      const numbers = Array.from({ length: 10 }, (_, i) => i)
      const details = await Promise.all(
        numbers.map(async (n) => {
          const r = await analysis.getMasteryByNumber(n, { days: DEFAULT_DAYS })
          return [n, r]
        })
      )
      // 简版：只 accuracy（保持 v2.2.0 兼容）
      masteryByNumber.value = Object.fromEntries(
        details.map(([n, r]) => [n, r.accuracy])
      )
      // 完整版：含 total / correct / questionsCount（阶段 11 派生弱项/强项用）
      masteryByNumberFull.value = Object.fromEntries(details)
      // 派生弱项/强项（单数字维度）
      _deriveWeaknessAndStrength()
    } catch (err) {
      lastError.value = err
      console.error('[useAbilityAnalysis] refreshMastery failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * P2 阶段 12：从 caller 传入的 answers 算 masteryByNumber（不查 db.answers）
   * - 用于"本轮" / "本组" 等上下文相关数据源
   * - 三个调用方不同范围：
   *   - StatsDrawer：全量历史（传 db.answers.toArray()，暂由原 refreshMastery 处理）
   *   - PracticeSummaryDialog：传 adaptiveAnswers（本轮）
   *   - SelfEvaluationDialog：传 session.answers（本组）
   *
   * @param {Array} answers - caller 传入的 answer 数组
   * @returns {Promise<void>}
   */
  async function refreshMasteryFromAnswers(answers) {
    loading.value = true
    lastError.value = null
    try {
      const details = await analysis.getMasteryByNumberFromAnswersBatch(answers || [])
      masteryByNumber.value = Object.fromEntries(
        details.map((r) => [r.number, r.accuracy])
      )
      masteryByNumberFull.value = Object.fromEntries(
        details.map((r) => [r.number, r])
      )
      _deriveWeaknessAndStrength()
    } catch (err) {
      lastError.value = err
      console.error('[useAbilityAnalysis] refreshMasteryFromAnswers failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * @internal
   * 从 masteryByNumberFull 派生 weaknessByNumber / strengthByNumber
   * - 弱项: accuracy < 0.7 且 total > 0
   * - 强项: accuracy >= 0.8 且 total >= 3
   * - 弱项按 accuracy 升序，强项按 accuracy 降序
   */
  function _deriveWeaknessAndStrength() {
    const entries = Object.entries(masteryByNumberFull.value)
    weaknessByNumber.value = entries
      .filter(([, r]) => r.total > 0 && r.score < 0.5)
      .map(([n, r]) => ({ number: Number(n), ...r }))
      .sort((a, b) => a.score - b.score)
    midByNumber.value = entries
      .filter(([, r]) => r.total >= 3 && r.score >= 0.5 && r.score < 1)
      .map(([n, r]) => ({ number: Number(n), ...r }))
      .sort((a, b) => b.score - a.score)
    strengthByNumber.value = entries
      .filter(([, r]) => r.total >= 3 && r.score >= 1)
      .map(([n, r]) => ({ number: Number(n), ...r }))
      .sort((a, b) => b.score - a.score)
  }

  /**
   * 错题优先级刷新（仅 prioritizeWrongAnswers）
   * - 单独刷新错题优先级列表（与 refresh 解耦，便于轻量调用）
   *
   * @returns {Promise<void>}
   */
  async function refreshWrongAnswers() {
    loading.value = true
    lastError.value = null
    try {
      const p = await analysis.prioritizeWrongAnswers({ limit: DEFAULT_WRONG_LIMIT })
      wrongAnswersPriority.value = p
    } catch (err) {
      lastError.value = err
      console.error('[useAbilityAnalysis] refreshWrongAnswers failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 取某题的学习曲线（带缓存）
   * - 缓存命中直接返回，缓存未命中调 getLearningCurve 后存
   * - 缓存写入使用不可变更新（保持 Vue 响应式追踪）
   *
   * @param {number|null} questionId - 题目 id；为 null/undefined 返回 []
   * @returns {Promise<Array<object>>} 学习曲线（按 startedAt 升序）
   */
  async function getCurve(questionId) {
    if (questionId == null) return []
    if (!learningCurves.value[questionId]) {
      const curve = await analysis.getLearningCurve(questionId, { days: DEFAULT_DAYS })
      learningCurves.value = {
        ...learningCurves.value,
        [questionId]: curve,
      }
    }
    return learningCurves.value[questionId]
  }

  /**
   * 清空所有缓存与状态（用于重置）
   * - 不影响 services 层；仅清 composable 内的响应式状态
   * - loading 不重置（避免在请求中途重置造成状态混乱）
   */
  function reset() {
    weaknessV2.value = []
    strengthV2.value = []
    midByNumber.value = []
    masteryByNumber.value = {}
    wrongAnswersPriority.value = []
    learningCurves.value = {}
    lastRefreshedAt.value = null
    lastError.value = null
  }

  return {
    // ── state ──
    weaknessV2,
    strengthV2,
    masteryByNumber,
    masteryByNumberFull,
    weaknessByNumber,
    strengthByNumber,
    midByNumber,
    wrongAnswersPriority,
    learningCurves,
    loading,
    lastRefreshedAt,
    lastError,
    // ── methods ──
    refresh,
    refreshWeakness,
    refreshMastery,
    refreshMasteryFromAnswers,
    refreshWrongAnswers,
    getCurve,
    reset,
  }
}
