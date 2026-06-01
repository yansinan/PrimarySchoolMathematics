<template>
  <el-drawer
    v-model="statsStore.drawerVisible"
    size="min(520px, 92vw)"
    direction="rtl"
    @opened="handleOpen"
  >
    <template #header>
      <span class="stats-drawer__title">
        <el-icon :size="22" style="margin-right: 8px;"><TrendCharts /></el-icon>
        练习统计
      </span>
    </template>

    <div v-loading="statsStore.loading" class="stats-drawer__body">
      <!-- ── No data ── -->
      <el-empty v-if="!statsStore.loading && (!statsStore.aggregatedStats || !statsStore.aggregatedStats.totalSessions)" description="还没有练习记录，快去练几道题吧！" />

      <template v-if="statsStore.aggregatedStats && statsStore.aggregatedStats.totalSessions > 0">
        <!-- ── Overview cards ── -->
        <el-row :gutter="12" class="stats-cards">
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ statsStore.aggregatedStats.totalSessions }}</div>
              <div class="stat-card__label">练习次数</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ statsStore.aggregatedStats.totalQuestions }}</div>
              <div class="stat-card__label">总题数</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value" :class="accuracyClass">{{ statsStore.overallAccuracyPercent }}%</div>
              <div class="stat-card__label">总正确率</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ statsStore.aggregatedStats.dailyStreak }}</div>
              <div class="stat-card__label">连续练习(天)</div>
            </div>
          </el-col>
        </el-row>

        <!-- ── Accuracy trend chart ── -->
        <div class="chart-section">
          <h3 class="section-title">正确率趋势</h3>
          <div class="chart-container">
            <canvas ref="trendChartRef"></canvas>
          </div>
        </div>

        <!-- ── Operator breakdown chart ── -->
        <div class="chart-section">
          <h3 class="section-title">运算符正确率</h3>
          <div class="chart-container">
            <canvas ref="operatorChartRef"></canvas>
          </div>
        </div>

        <!-- ── Number weakness analysis ── -->
        <div v-if="weakNumbers.length" class="weak-section">
          <h3 class="section-title">数字弱项分析</h3>
          <div class="weak-list">
            <div
              v-for="item in weakNumbers"
              :key="`${item.number}_${item.operator}`"
              class="weak-item"
            >
              <div class="weak-item__header">
                <span class="weak-item__number">{{ item.number }}</span>
                <span class="weak-item__op">{{ operatorLabel(item.operator) }}</span>
                <el-tag
                  :type="item.accuracy >= 0.5 ? 'warning' : 'danger'"
                  size="small"
                  effect="dark"
                  class="weak-item__tag"
                >
                  {{ Math.round(item.accuracy * 100) }}% ({{ item.correct }}/{{ item.count }})
                </el-tag>
              </div>
              <div class="weak-item__desc" v-if="item.wrongEquations.length">
                <span class="weak-item__desc-label">错误题目：</span>
                <span class="weak-item__equations">
                  <template v-for="(we, wi) in item.wrongEquations" :key="wi">
                    <code class="wrong-eq">{{ we.equation }}{{ we.userAnswer }}</code>
                    <span v-if="wi < item.wrongEquations.length - 1">、</span>
                  </template>
                </span>
              </div>
            </div>
          </div>
          <div class="weak-tip">💡 建议加强这些数字的{{ weakNumberSuggestion }}练习</div>
        </div>

        <!-- ── Recent sessions list ── -->
        <div class="session-list-section">
          <h3 class="section-title">最近的练习</h3>
          <div class="session-list">
            <div
              v-for="session in statsStore.sessions.slice(0, 10)"
              :key="session.id"
              class="session-item"
              @click="openSessionDetail(session.id)"
            >
              <div class="session-item__left">
                <div class="session-item__date">{{ formatDate(session.createdAt) }}</div>
                <div class="session-item__meta">{{ session.totalQuestions }} 题 · {{ formatDuration(session.totalDuration) }}</div>
              </div>
              <div class="session-item__right">
                <el-tag
                  :type="session.accuracy >= 0.8 ? 'success' : session.accuracy >= 0.6 ? 'warning' : 'danger'"
                  size="small"
                  effect="plain"
                >
                  {{ Math.round(session.accuracy * 100) }}%
                </el-tag>
                <el-icon class="session-item__arrow"><ArrowRight /></el-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Export / Import ── -->
        <el-divider />
        <el-row :gutter="12">
          <el-col :span="12">
            <el-button class="w-full" @click="handleExport" :loading="exporting">
              <el-icon><Download /></el-icon> 导出数据
            </el-button>
          </el-col>
          <el-col :span="12">
            <el-upload
              :show-file-list="false"
              :before-upload="handleImport"
              accept=".json"
            >
              <el-button class="w-full">
                <el-icon><Upload /></el-icon> 导入数据
              </el-button>
            </el-upload>
          </el-col>
        </el-row>
      </template>
    </div>

    <!-- ── Session detail drawer (nested) ── -->
    <SessionDetail />
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  TrendCharts, ArrowRight, Download, Upload
} from '@element-plus/icons-vue'
import { Chart, registerables } from 'chart.js'
import { useStatsStore } from '@/stores/stats'
import { formatDuration } from '@/utils/timeFormat'
import SessionDetail from './SessionDetail.vue'

Chart.register(...registerables)

const statsStore = useStatsStore()

const trendChartRef = ref(null)
const operatorChartRef = ref(null)
let trendChartInstance = null
let operatorChartInstance = null
const exporting = ref(false)

const accuracyClass = computed(() => {
  const pct = statsStore.overallAccuracyPercent
  if (pct >= 80) return 'color-success'
  if (pct >= 60) return 'color-warning'
  return 'color-danger'
})

const weakNumbers = computed(() => {
  return statsStore.aggregatedStats?.weakNumbers || []
})

const weakNumberSuggestion = computed(() => {
  const items = weakNumbers.value
  if (!items.length) return ''
  const opSet = new Set(items.map(i => i.operator))
  const ops = [...opSet].map(op => operatorLabel(op))
  return ops.join('、')
})

function operatorLabel(op) {
  const map = { '+': '加法', '-': '减法', '*': '乘法', '/': '除法' }
  return map[op] || op
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function openSessionDetail(sessionId) {
  statsStore.loadSessionDetail(sessionId)
}

// ── Charts ──

function buildTrendChart() {
  if (!trendChartRef.value) return
  const data = statsStore.accuracyTrend
  if (!data.length) return

  if (trendChartInstance) trendChartInstance.destroy()

  trendChartInstance = new Chart(trendChartRef.value, {
    type: 'line',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: '正确率',
        data: data.map(d => d.accuracy * 100),
        borderColor: '#58cc71',
        backgroundColor: 'rgba(88, 204, 113, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${Math.round(ctx.parsed.y)}%`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (v) => `${v}%` }
        },
        x: {
          ticks: { maxTicksLimit: 10 }
        }
      }
    }
  })
}

function buildOperatorChart() {
  if (!operatorChartRef.value) return
  const data = statsStore.operatorBreakdown
  if (!data.length) return

  if (operatorChartInstance) operatorChartInstance.destroy()

  const colors = {
    '＋': '#409eff',
    '－': '#e6a23c',
    '×': '#67c23a',
    '÷': '#f56c6c'
  }

  operatorChartInstance = new Chart(operatorChartRef.value, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: '正确率',
        data: data.map(d => d.accuracy * 100),
        backgroundColor: data.map(d => colors[d.label] || '#909399'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${Math.round(ctx.parsed.y)}% (${data[ctx.dataIndex].count}题)`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (v) => `${v}%` }
        }
      }
    }
  })
}

async function handleOpen() {
  await statsStore.refreshAll()
  await nextTick()
  buildTrendChart()
  buildOperatorChart()
}

async function handleExport() {
  exporting.value = true
  try {
    await statsStore.exportData()
    ElMessage.success('数据已导出')
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function handleImport(file) {
  try {
    const result = await statsStore.importData(file)
    ElMessage.success(`导入完成：新增 ${result.imported} 条记录，跳过 ${result.skipped} 条重复`)
    await nextTick()
    buildTrendChart()
    buildOperatorChart()
  } catch (err) {
    ElMessage.error('导入失败，请检查文件格式')
    console.error(err)
  }
  return false
}

watch(() => statsStore.drawerVisible, (visible) => {
  if (!visible) {
    // Cleanup chart instances when drawer closes
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null }
    if (operatorChartInstance) { operatorChartInstance.destroy(); operatorChartInstance = null }
  }
})

onBeforeUnmount(() => {
  if (trendChartInstance) trendChartInstance.destroy()
  if (operatorChartInstance) operatorChartInstance.destroy()
})
</script>

<style scoped>
.stats-drawer__title {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 18px;
}

.stats-drawer__body {
  padding: 4px 0;
}

/* ── Stat cards ── */
.stats-cards {
  margin-bottom: 20px;
}

.stats-cards .el-col {
  margin-bottom: 10px;
}

.stat-card {
  background: #f5f9ff;
  border-radius: 12px;
  padding: 14px 10px;
  text-align: center;
  border: 1px solid #e8f0fa;
}

.stat-card__value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: #1e3c5c;
}

.stat-card__value.color-success { color: #58cc71; }
.stat-card__value.color-warning { color: #e6a23c; }
.stat-card__value.color-danger  { color: #f56c6c; }

.stat-card__label {
  font-size: 13px;
  color: #7a8fa6;
  margin-top: 4px;
}

/* ── Charts ── */
.chart-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e3c5c;
  margin: 0 0 10px 0;
}

.chart-container {
  background: #fafcff;
  border-radius: 12px;
  border: 1px solid #eef3f9;
  padding: 12px;
  height: 180px;
  position: relative;
}

/* ── Session list ── */
.session-list-section {
  margin-bottom: 16px;
}

.session-list {
  max-height: 360px;
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f0f4fa;
}

.session-item:hover {
  background: #f0f7ff;
}

.session-item__left {
  flex: 1;
  min-width: 0;
}

.session-item__date {
  font-size: 14px;
  font-weight: 500;
  color: #1e3c5c;
}

.session-item__meta {
  font-size: 12px;
  color: #8fa3b8;
  margin-top: 2px;
}

.session-item__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.session-item__arrow {
  color: #c0ccda;
  font-size: 14px;
}

.w-full {
  width: 100%;
}

/* ── Weak number analysis ── */
.weak-section {
  margin-bottom: 20px;
}

.weak-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weak-item {
  background: #fff8f0;
  border: 1px solid #fde8d0;
  border-radius: 10px;
  padding: 10px 14px;
}

.weak-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.weak-item__number {
  font-size: 20px;
  font-weight: 800;
  color: #e6a23c;
  min-width: 28px;
  text-align: center;
}

.weak-item__op {
  font-size: 13px;
  color: #7a8fa6;
  background: #f0f4fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.weak-item__tag {
  margin-left: auto;
}

.weak-item__desc {
  margin-top: 6px;
  font-size: 13px;
  color: #8fa3b8;
}

.weak-item__desc-label {
  color: #7a8fa6;
}

.weak-item__equations {
  word-break: break-all;
}

.wrong-eq {
  font-size: 13px;
  color: #f56c6c;
  background: #fef0f0;
  padding: 1px 6px;
  border-radius: 3px;
}

.weak-tip {
  margin-top: 10px;
  font-size: 13px;
  color: #e6a23c;
  background: #fffbe6;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #fae7b3;
}
</style>
