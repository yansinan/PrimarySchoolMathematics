/**
 * 统计数据查询 composable (C 层)
 *
 * 抽离 stores/stats.js 中 6 个数据加载 action (Phase 1: 5 个 read + Phase 2: 1 个 delete):
 * - loadSessions       - 加载最近 N 个 session 列表
 * - loadSessionDetail  - 加载单个 session 详情
 * - loadAggregatedStats- 加载聚合统计
 * - loadAllAnswers     - 加载全量历史答案
 * - refreshAll         - 并行加载 sessions + aggregatedStats
 * - deleteSessionById  - 删除单个 session + 自动 refresh (Phase 2)
 *
 * 文件 IO 2 个 (exportData/importData) 留 Phase 2.
 *
 * 状态修改通过 statsStore (Pinia 单例共享):
 *   store.sessions = ...  // 状态字段更新
 *
 * 留 store 的:
 * - 3 个 drawer toggle (toggleDrawer/openDrawer/closeDrawer) - UI 状态
 * - 5 个 state 字段 (sessions/selectedSession/aggregatedStats/allAnswers/loading)
 * - 5 个 getter (accuracyTrend/operatorBreakdown/weakAreas/overallAccuracyPercent 等)
 *
 * 架构合规 (ARCHITECTURE.md § 1.2):
 * - V → C: 通过 @/composables 桶
 * - C → S → D: 此 composable 直接调 database (M 层可引 D 层)
 */
import { useStatsStore } from '@/stores/stats'
import {
  getSessions,
  getSessionDetail,
  getAggregatedStats,
  getAllAnswers,
} from '@/utils/store/database'

export function useStatsQuery() {
  const store = useStatsStore()

  /**
   * 加载最近 N 个 session 列表
   * @param {string} studentId
   * @param {number} limit
   */
  async function loadSessions(studentId = 'default', limit = 50) {
    store.loading = true
    try {
      store.sessions = await getSessions(studentId, limit)
    } catch (err) {
      console.error('[useStatsQuery] Failed to load sessions:', err)
    } finally {
      store.loading = false
    }
  }

  /**
   * 加载单个 session 详情
   * @param {number} sessionId
   */
  async function loadSessionDetail(sessionId) {
    store.loading = true
    try {
      store.selectedSession = await getSessionDetail(sessionId)
    } catch (err) {
      console.error('[useStatsQuery] Failed to load session detail:', err)
    } finally {
      store.loading = false
    }
  }

  /**
   * 加载聚合统计
   * @param {string} studentId
   */
  async function loadAggregatedStats(studentId = 'default') {
    store.loading = true
    try {
      store.aggregatedStats = await getAggregatedStats(studentId)
    } catch (err) {
      console.error('[useStatsQuery] Failed to load aggregated stats:', err)
    } finally {
      store.loading = false
    }
  }

  /**
   * 加载全量历史答案 (供 useAbilityProfile 算强弱项)
   * @param {string} studentId
   */
  async function loadAllAnswers(studentId = 'default') {
    store.loading = true
    try {
      store.allAnswers = await getAllAnswers(studentId)
    } catch (err) {
      console.error('[useStatsQuery] Failed to load all answers:', err)
      // 失败保持上次缓存, 不清空 (与原 store 行为一致)
    } finally {
      store.loading = false
    }
  }

  /**
   * 并行加载 sessions + aggregatedStats
   * @param {string} studentId
   */
  async function refreshAll(studentId = 'default') {
    await Promise.all([
      loadSessions(studentId),
      loadAggregatedStats(studentId),
    ])
  }

  return {
    loadSessions,
    loadSessionDetail,
    loadAggregatedStats,
    loadAllAnswers,
    refreshAll,
  }
}
