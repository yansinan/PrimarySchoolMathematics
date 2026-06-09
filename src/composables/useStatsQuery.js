/**
 * 统计数据查询 composable (C 层)
 *
 * 抽离 stores/stats.js 中 6 个数据加载 + 3 个 write/IO action:
 * Phase 1 (5 个 read):
 * - loadSessions       - 加载最近 N 个 session 列表
 * - loadSessionDetail  - 加载单个 session 详情
 * - loadAggregatedStats- 加载聚合统计
 * - loadAllAnswers     - 加载全量历史答案
 * - refreshAll         - 并行加载 sessions + aggregatedStats
 *
 * Phase 2 (3 个 write/IO):
 * - deleteSessionById  - 删除单个 session + 自动 refresh
 * - exportData         - 导出全部数据为 JSON 文件下载
 * - importData         - 从 JSON 文件导入数据
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
  deleteSession as dbDeleteSession,
} from '@/utils/store/database'
import { exportAllData, importAllData } from '@/services/database'
import { Answer } from '@/utils/algorithm/answer'

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
      store.allAnswers = await Answer.getAllByStudent(studentId)
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

  // ── Phase 2: write / IO ──

  /**
   * 删除单个 session + 自动 refresh stats
   * (原 stats store.deleteSession)
   * @param {number} sessionId
   */
  async function deleteSessionById(sessionId) {
    store.loading = true
    try {
      await dbDeleteSession(sessionId)
      await refreshAll()
    } catch (err) {
      console.error('[useStatsQuery] Failed to delete session:', err)
    } finally {
      store.loading = false
    }
  }

  /**
   * 导出全部数据为 JSON 文件下载
   * (原 stats store.exportData)
   * @param {string} studentId
   * @returns {Promise<boolean>} 成功 true
   */
  async function exportData(studentId = 'default') {
    try {
      const data = await exportAllData(studentId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `练习记录_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return true
    } catch (err) {
      console.error('[useStatsQuery] Failed to export data:', err)
      return false
    }
  }

  /**
   * 从 JSON 文件导入数据
   * (原 stats store.importData)
   * @param {File} file
   * @returns {Promise<{imported: number, skipped: number}|null>}
   */
  async function importData(file) {
    store.loading = true
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await importAllData(data)
      await refreshAll()
      return result
    } catch (err) {
      console.error('[useStatsQuery] Failed to import data:', err)
      throw err
    } finally {
      store.loading = false
    }
  }

  return {
    loadSessions,
    loadSessionDetail,
    loadAggregatedStats,
    loadAllAnswers,
    refreshAll,
    deleteSessionById,
    exportData,
    importData,
  }
}
