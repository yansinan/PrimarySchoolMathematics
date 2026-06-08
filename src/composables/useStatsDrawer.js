/**
 * 统计抽屉 composable（ARCH 合规：V 层不直接读写 store / import U）
 *
 * 封装 StatsDrawer.vue 中的：
 *   - drawer 可见性（v-model 委托）
 *   - store 只读数据（aggregatedStats / sessions / accuracyTrend）
 *   - store 操作委托（openSessionDetail / refreshAll / exportData / importData）
 *   - 纯函数（formatDuration / formatDate / operatorLabel）
 *   - 派生数据（weakNumbers / weakNumberSuggestion）
 */
import { computed } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { useStatsQuery } from '@/composables'
import { formatDuration as _formatDuration } from '@/utils/time/timeFormat'
// 统一 operator 中文名称（services/operatorMap.js）
import { OPERATOR_LABELS } from '@/services'

export function useStatsDrawer() {
  const statsStore = useStatsStore()
  const {
    refreshAll, loadAllAnswers, loadSessionDetail,
    exportData: exportDataQuery, importData: importDataQuery,
  } = useStatsQuery()

  // ── Drawer 可见性（C 层委托，V 不直接写 store） ──
  const drawerVisible = computed(() => statsStore.drawerVisible)
  function toggleDrawer(v) { statsStore.drawerVisible = v }

  // ── Store 只读数据 ──
  const loading = computed(() => statsStore.loading)
  const aggregatedStats = computed(() => statsStore.aggregatedStats)
  const overallAccuracyPercent = computed(() => statsStore.overallAccuracyPercent)
  const sessions = computed(() => statsStore.sessions)
  const accuracyTrend = computed(() => statsStore.accuracyTrend)
  const operatorBreakdown = computed(() => statsStore.operatorBreakdown)
  const allAnswers = computed(() => statsStore.allAnswers)
  const isDrawerOpen = computed(() => statsStore.drawerVisible)

  // ── Store 操作委托（业务行为走 useStatsQuery，状态字段仍走 store） ──
  function openSessionDetail(sessionId) {
    return loadSessionDetail(sessionId)
  }

  async function refreshAllDrawer() {
    await Promise.all([
      refreshAll(),
      loadAllAnswers(),
    ])
  }

  async function exportData() {
    await exportDataQuery()
  }

  async function importData(file) {
    return importDataQuery(file)
  }

  /**
   * 打开抽屉 + 刷新全量数据（ARCH 合规：编排下沉到 C）
   * V 层只调一行，不需要分别调 refreshAll / loadAllAnswers
   */
  async function openDrawer() {
    await Promise.all([
      refreshAll(),
      loadAllAnswers(),
    ])
  }

  function loadAllAnswersDrawer() {
    return loadAllAnswers()
  }

  // ── 纯函数（原 V 层内联，搬至此统一出口） ──
  function formatDuration(ms) {
    return _formatDuration(ms)
  }

  function formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function operatorLabel(op) {
    // 统一源 OPERATOR_LABELS (services/operatorMap.js)
    return OPERATOR_LABELS[op] || op
  }

  // ── 派生数据 ──
  const weakNumbers = computed(() => aggregatedStats.value?.weakNumbers || [])

  const weakNumberSuggestion = computed(() => {
    const items = weakNumbers.value
    if (!items.length) return ''
    const opSet = new Set(items.map(i => i.operator))
    const ops = [...opSet].map(op => operatorLabel(op))
    return ops.join('、')
  })

  return {
    isDrawerOpen, toggleDrawer, loading, aggregatedStats, overallAccuracyPercent,
    sessions, accuracyTrend, operatorBreakdown, allAnswers,
    openSessionDetail,
    refreshAll: refreshAllDrawer,
    openDrawer,
    loadAllAnswers: loadAllAnswersDrawer,
    exportData, importData,
    formatDuration, formatDate, operatorLabel,
    weakNumbers, weakNumberSuggestion,
  }
}