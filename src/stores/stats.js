import { defineStore } from 'pinia'
import {
  deleteSession,
  exportAllData,
  importAllData,
  // Phase 1 deleteSession 内联 refreshAll 用
  getSessions,
  getAggregatedStats,
} from '@/utils/store/database'
// 统一 operator 映射（ARCHITECTURE.md §3.5 消除重复）
// OPERATOR_SYMBOLS 对应图表显示（＋ － × ÷）
import { OPERATOR_SYMBOLS } from '@/services'

/**
 * Stats Store — manages historical practice data, aggregated statistics,
 * and the stats drawer UI state.
 *
 * Agent A contract (see plan: 接口契约 B).
 *
 * D 组 D2 整改 (2026-06-08): 5 个数据加载 action (loadSessions/SessionDetail/
 *   AggregatedStats/AllAnswers/refreshAll) 抽到 composables/useStatsQuery.js.
 *   业务行为 (C 层) 与状态字段 (M 层) 分离.
 *
 * 仍在本 store 的:
 * - 6 个 state 字段
 * - 5 个 getter
 * - 3 个 drawer UI toggle (toggleDrawer/openDrawer/closeDrawer)
 * - 1 个删除 action (deleteSession) — Phase 2 抽到 useStatsQuery
 * - 2 个文件 IO (exportData/importData) — Phase 2 抽到 useStatsQuery
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    sessions: [],
    selectedSession: null,
    aggregatedStats: null,
    // P2 阶段 14: 全量历史答案缓存
    // - 由 StatsDrawer 打开时触发 loadAllAnswers() 填充
    // - 供 useAbilityProfile(options.answers) 用, 让"你掌握得怎么样"显示
    //   所有答题历史而非仅本轮 adaptiveAnswers
    allAnswers: [],
    drawerVisible: false,
    loading: false
  }),

  getters: {
    /**
     * Accuracy trend — most recent sessions first.
     * Suitable for a Chart.js Line chart (reverse for chronological display).
     * Returns: [{ label: '2026-06-01', accuracy: 0.85 }, ...]
     */
    accuracyTrend(state) {
      return state.sessions
        .slice()
        .reverse()
        .map(s => ({
          label: s.createdAt ? s.createdAt.slice(0, 10) : '',
          accuracy: s.accuracy || 0
        }))
    },

    /**
     * Operator breakdown — accuracy per operator type.
     * Suitable for a Chart.js Bar chart.
     * Returns: [{ label: '+', accuracy: 0.9, count: 50 }, ...]
     */
    operatorBreakdown() {
      const stats = this.aggregatedStats
      if (!stats || !stats.operatorStats) return []

      return Object.entries(stats.operatorStats).map(([op, data]) => ({
        // 统一源 OPERATOR_SYMBOLS (services/operatorMap.js)
        label: OPERATOR_SYMBOLS[op] || op,
        accuracy: data.accuracy || 0,
        count: data.count || 0
      }))
    },

    /**
     * Weak areas placeholder — will be used in phase 2.
     * Returns sorted list of operator accuracies (lowest first).
     */
    weakAreas() {
      const stats = this.aggregatedStats
      if (!stats || !stats.operatorStats) return []

      const breakdown = this.operatorBreakdown
      return breakdown
        .slice()
        .sort((a, b) => a.accuracy - b.accuracy)
        .map(item => ({
          area: `operator_${item.label}`,
          label: `${item.label} 运算`,
          accuracy: item.accuracy,
          count: item.count,
          gap: stats.overallAccuracy - item.accuracy
        }))
    },

    /**
     * Formatted overall accuracy percentage.
     */
    overallAccuracyPercent() {
      if (!this.aggregatedStats) return 0
      return Math.round((this.aggregatedStats.overallAccuracy || 0) * 100)
    }
  },

  actions: {
    // ── UI 状态 (留 store) ──
    toggleDrawer() {
      this.drawerVisible = !this.drawerVisible
    },

    openDrawer() {
      this.drawerVisible = true
    },

    closeDrawer() {
      this.drawerVisible = false
    },

    // ── Phase 2 待迁移 (留 store) ──
    /**
     * Delete a session and refresh.
     * Phase 2: 抽到 useStatsQuery.deleteSessionById()，届时调 useStatsQuery().refreshAll()
     * Phase 1: 内联 refreshAll 逻辑（避免 store 跨文件依赖 useStatsQuery）
     */
    async deleteSession(sessionId) {
      this.loading = true
      try {
        await deleteSession(sessionId)
        // 内联 refreshAll: loadSessions + loadAggregatedStats 并行
        const [sessions, aggregated] = await Promise.all([
          getSessions('default', 50).catch(err => {
            console.error('[StatsStore] Failed to load sessions:', err)
            return this.sessions
          }),
          getAggregatedStats('default').catch(err => {
            console.error('[StatsStore] Failed to load aggregated stats:', err)
            return this.aggregatedStats
          }),
        ])
        this.sessions = sessions
        this.aggregatedStats = aggregated
      } catch (err) {
        console.error('[StatsStore] Failed to delete session:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Export all data — triggers a file download.
     * Phase 2: 抽到 useStatsQuery.exportData()
     */
    async exportData(studentId = 'default') {
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
        console.error('[StatsStore] Failed to export data:', err)
        return false
      }
    },

    /**
     * Import data from a JSON file.
     * @param {File} file - The JSON file to import
     * @returns {Promise<{imported: number, skipped: number}|null>}
     * Phase 2: 抽到 useStatsQuery.importData()
     */
    async importData(file) {
      this.loading = true
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const result = await importAllData(data)
        await this.refreshAll()
        return result
      } catch (err) {
        console.error('[StatsStore] Failed to import data:', err)
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})
