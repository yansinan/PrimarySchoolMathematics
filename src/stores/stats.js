import { defineStore } from 'pinia'
import {
  getSessions,
  getSessionDetail,
  getAggregatedStats,
  deleteSession,
  exportAllData,
  importAllData
} from '@/utils/database'

/**
 * Stats Store — manages historical practice data, aggregated statistics,
 * and the stats drawer UI state.
 *
 * Agent A contract (see plan: 接口契约 B).
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    sessions: [],
    selectedSession: null,
    aggregatedStats: null,
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

      const map = {
        '+': '＋',
        '-': '－',
        '*': '×',
        '/': '÷'
      }

      return Object.entries(stats.operatorStats).map(([op, data]) => ({
        label: map[op] || op,
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
    toggleDrawer() {
      this.drawerVisible = !this.drawerVisible
    },

    openDrawer() {
      this.drawerVisible = true
    },

    closeDrawer() {
      this.drawerVisible = false
    },

    /**
     * Load the most recent sessions list.
     */
    async loadSessions(studentId = 'default', limit = 50) {
      this.loading = true
      try {
        this.sessions = await getSessions(studentId, limit)
      } catch (err) {
        console.error('[StatsStore] Failed to load sessions:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Load detail for a single session (session + answers).
     */
    async loadSessionDetail(sessionId) {
      this.loading = true
      try {
        this.selectedSession = await getSessionDetail(sessionId)
      } catch (err) {
        console.error('[StatsStore] Failed to load session detail:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Load (or reload) aggregated statistics.
     */
    async loadAggregatedStats(studentId = 'default') {
      this.loading = true
      try {
        this.aggregatedStats = await getAggregatedStats(studentId)
      } catch (err) {
        console.error('[StatsStore] Failed to load aggregated stats:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Refresh both session list and aggregated stats.
     */
    async refreshAll(studentId = 'default') {
      await Promise.all([
        this.loadSessions(studentId),
        this.loadAggregatedStats(studentId)
      ])
    },

    /**
     * Delete a session and refresh.
     */
    async deleteSession(sessionId) {
      this.loading = true
      try {
        await deleteSession(sessionId)
        await this.refreshAll()
      } catch (err) {
        console.error('[StatsStore] Failed to delete session:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Export all data — triggers a file download.
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
