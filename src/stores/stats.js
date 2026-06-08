import { defineStore } from 'pinia'
// 统一 operator 映射（ARCHITECTURE.md §3.5 消除重复）
// OPERATOR_SYMBOLS 对应图表显示（＋ － × ÷）
import { OPERATOR_SYMBOLS } from '@/services'

/**
 * Stats Store — stats 状态字段 + UI toggle + 派生 getter
 *
 * D 组 D2 整改后 (2026-06-08) 职责只剩:
 * - 6 个 state 字段 (sessions/selectedSession/aggregatedStats/allAnswers/drawerVisible/loading)
 * - 5 个 getter (accuracyTrend/operatorBreakdown/weakAreas/overallAccuracyPercent/loading)
 * - 3 个 drawer UI toggle (toggleDrawer/openDrawer/closeDrawer)
 *
 * 8 个数据 action 全部抽到 composables/useStatsQuery.js (5 read + 3 write/IO):
 * - loadSessions / loadSessionDetail / loadAggregatedStats / loadAllAnswers / refreshAll
 * - deleteSessionById / exportData / importData
 *
 * D2 之前 (历史):
 * - 8 个 DB IO 全部在 store, 250+ 行
 * - V→S 直调 + 业务行为混在状态层
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    sessions: [],
    selectedSession: null,
    aggregatedStats: null,
    // P2 阶段 14: 全量历史答案缓存
    // - 由 StatsDrawer 打开时触发 useStatsQuery.loadAllAnswers() 填充
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
    // ── 仅 UI 状态 (留 store) ──
    toggleDrawer() {
      this.drawerVisible = !this.drawerVisible
    },

    openDrawer() {
      this.drawerVisible = true
    },

    closeDrawer() {
      this.drawerVisible = false
    },
  }
})
