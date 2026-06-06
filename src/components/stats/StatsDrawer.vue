<template>
  <el-drawer
    :model-value="isDrawerOpen"
    size="min(520px, 92vw)"
    direction="rtl"
    @update:model-value="v => toggleDrawer(v)"
    @opened="handleOpen"
  >
    <template #header>
      <span class="stats-drawer__title">
        <el-icon :size="22" style="margin-right: 8px;"><TrendCharts /></el-icon>
        练习统计
      </span>
    </template>

    <div v-loading="loading" class="stats-drawer__body">
      <!-- ── No data ── -->
      <el-empty v-if="!loading && (!aggregatedStats || !aggregatedStats.totalSessions)" description="还没有练习记录，快去练几道题吧！" />

      <template v-if="aggregatedStats && aggregatedStats.totalSessions > 0">
        <!-- ── 游戏等级（P5: 游戏化设计） ── -->
        <div class="level-section">
          <div class="level-info">
            <span class="level-icon">{{ gameLevel.icon }}</span>
            <span class="level-title">{{ gameLevel.title }}</span>
            <!-- 运算符专精辅助标签 -->
            <span v-for="op in operatorSkills" :key="op" class="level-aux-tag">{{ op }}</span>
            <span class="level-xp">经验 {{ aggregatedStats.totalQuestions }}/{{ gameLevel.nextXP }}</span>
          </div>
          <div class="level-bar-wrap">
            <div class="level-bar" :style="{ width: gameLevel.progress + '%', background: gameLevel.color }"></div>
          </div>
        </div>

        <!-- ── 技能标签（从 strongLevels/weakLevels 等级强弱项派生） ── -->
        <div v-if="strengthSkills.length || weaknessSkills.length" class="skill-bar">
          <el-tag
            v-for="s in strengthSkills"
            :key="'s-' + s"
            class="skill-tag skill-tag--strong"
            size="small"
            effect="dark"
          >
            {{ s }}
          </el-tag>
          <el-tag
            v-for="s in weaknessSkills"
            :key="'w-' + s"
            class="skill-tag skill-tag--weak"
            size="small"
            effect="plain"
          >
            {{ s }}
          </el-tag>
        </div>

        <!-- ── Overview cards ── -->
        <el-row :gutter="12" class="stats-cards">
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ aggregatedStats.totalSessions }}</div>
              <div class="stat-card__label">练习次数</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ aggregatedStats.totalQuestions }}</div>
              <div class="stat-card__label">总题数</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value" :class="accuracyClass">{{ overallAccuracyPercent }}%</div>
              <div class="stat-card__label">总正确率</div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="stat-card">
              <div class="stat-card__value">{{ aggregatedStats.dailyStreak }}</div>
              <div class="stat-card__label">连续练习(天)</div>
            </div>
          </el-col>
        </el-row>

        <!-- ── Accuracy trend chart（仅在有数据时显示） ── -->
        <div v-show="accuracyTrend.length > 1" class="chart-section">
          <h3 class="section-title">正确率趋势</h3>
          <div class="chart-container">
            <canvas ref="trendChartRef"></canvas>
          </div>
        </div>

        <!-- ── Operator breakdown chart（仅在有数据时显示） ── -->
        <div v-show="operatorBreakdown.length" class="chart-section">
          <h3 class="section-title">运算符正确率</h3>
          <div class="chart-container">
            <canvas ref="operatorChartRef"></canvas>
          </div>
        </div>

        <!-- ── P2 阶段 14：数字强弱项（左右布局，强项左弱项右） ── -->
        <div v-if="weaknessByNumber.length || strengthByNumber.length || midByNumber.length" class="weak-section">
          <el-row :gutter="12">
            <el-col :span="12">
              <StrengthV2Card
                v-if="strengthByNumber.length"
                :data="strengthByNumber"
                :title="`🌟 你最拿手`"
                :empty-text="''"
                class="weak-section__v2-card"
              />
            </el-col>
            <el-col :span="12">
              <WeaknessV2Card
                v-if="weaknessByNumber.length"
                :data="weaknessByNumber"
                :title="`📒 多练习`"
                :empty-text="''"
                class="weak-section__v2-card"
              />
            </el-col>
          </el-row>
          <MidV2Card
            v-if="midByNumber.length"
            :data="midByNumber"
            :title="`🟢 还行`"
            :empty-text="''"
            class="weak-section__v2-card"
          />
        </div>

        <!-- ── Recent sessions list ── -->
        <div class="session-list-section">
          <h3 class="section-title">最近的练习</h3>
          <div class="session-list">
            <div
              v-for="session in sessions.slice(0, 10)"
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
import WeaknessV2Card from '@/components/profile/WeaknessV2Card.vue'
import StrengthV2Card from '@/components/profile/StrengthV2Card.vue'
import MidV2Card from '@/components/profile/MidV2Card.vue'
import { useAbilityProfile } from '@/composables/useAbilityProfile'
import { useStatsDrawer } from '@/composables/useStatsDrawer'
// chartBuilder 抽离 Chart.js 实例管理（S 层）
import { buildTrendChart, buildOperatorChart, destroyChart } from '@/services/chartBuilder'
import SessionDetail from './SessionDetail.vue'

// ── 统计抽屉数据 + 操作（ARCH 合规：V 不经 C 层不直连 store） ──
// 关键: 顶层解构 → Vue 3 模板自动解包 ref（不用 .value）
// 坑: 若写成 const stats = useStatsDrawer(), 模板中 stats.xxx 是 Ref 对象不是值
const {
  isDrawerOpen, toggleDrawer, loading, aggregatedStats,
  overallAccuracyPercent, sessions, accuracyTrend,
  operatorBreakdown, allAnswers,
  openSessionDetail, refreshAll, loadAllAnswers, openDrawer,
  exportData, importData, formatDate, formatDuration
} = useStatsDrawer()

// P2 阶段 14: useAbilityProfile 传 options.answers = 全量历史
// 显示孩子长期掌握度
// P5 v2.3.0 修复：allAnswers 已是 ComputedRef，不要再套一层 computed（否则 unref 只能解一层）
const profile = useAbilityProfile({ answers: allAnswers })
// 修复 Bug 1: 解构加 midByNumber, 让模板可访问中间档数据
const { weaknessByNumber, strengthByNumber, midByNumber, strongLevels, weakLevels } = profile

const trendChartRef = ref(null)
const operatorChartRef = ref(null)
const exporting = ref(false)

const accuracyClass = computed(() => {
  const pct = overallAccuracyPercent
  if (pct >= 80) return 'color-success'
  if (pct >= 60) return 'color-warning'
  return 'color-danger'
})

// ── 游戏等级（P5: 游戏化设计） ──
const GAME_LEVELS = [
  { minXP: 0, title: '初学者', icon: '🌱', color: '#909399' },
  { minXP: 20, title: '练习生', icon: '✏️', color: '#58cc71' },
  { minXP: 50, title: '数学学徒', icon: '🔢', color: '#409eff' },
  { minXP: 100, title: '计算小能手', icon: '⚡', color: '#e6a23c' },
  { minXP: 200, title: '数学小达人', icon: '🌟', color: '#27ae60' },
  { minXP: 500, title: '算术之星', icon: '⭐', color: '#f56c6c' },
  { minXP: 1000, title: '数学大师', icon: '👑', color: '#9b59b6' },
]
const gameLevel = computed(() => {
  const xp = aggregatedStats.value?.totalQuestions || 0
  let level = GAME_LEVELS[0]
  let next = GAME_LEVELS[1]
  for (let i = GAME_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= GAME_LEVELS[i].minXP) {
      level = GAME_LEVELS[i]
      next = GAME_LEVELS[Math.min(i + 1, GAME_LEVELS.length - 1)]
      break
    }
  }
  const nextXP = next.minXP
  const currentXP = level.minXP
  const progress = nextXP > currentXP ? ((xp - currentXP) / (nextXP - currentXP)) * 100 : 100
  return { ...level, nextXP, progress }
})

// ── 技能标签（从 strongLevels/weakLevels 等级强弱项派生） ──
/** 强项技能标签 e.g. '混合进退位①' */
const strengthSkills = computed(() => {
  const labels = strongLevels?.value || []
  return labels
})

/** 弱项技能标签 e.g. '进退位入门' */
const weaknessSkills = computed(() => {
  const labels = weakLevels?.value || []
  return labels
})

// ── 运算符辅助标签（称号旁的辅助信息） ──
const operatorSkills = computed(() => {
  const ops = aggregatedStats.value?.operatorStats
  if (!ops) return []
  return Object.entries(ops)
    .filter(([, d]) => d.accuracy >= 0.9)
    .sort(([, a], [, b]) => b.accuracy - a.accuracy)
    .map(([op]) => `${op === '+' ? '加法' : op === '-' ? '减法' : op}专精`)
})
// V 层只传 canvas + 数据进 S 层 chartBuilder，Chart.js 生命周期不在此

/** 建完图也跟踪实例（用于销毁） */
let trendChartInstance = null
let operatorChartInstance = null

function rebuildCharts() {
  destroyChart(trendChartInstance)
  destroyChart(operatorChartInstance)
  const tc = trendChartRef.value
  const oc = operatorChartRef.value
  // accuracyTrend/operatorBreakdown 是 ComputedRef，传值需 .value
  const trendData = accuracyTrend.value || []
  const opData = operatorBreakdown.value || []
  // 确保 canvas 在 DOM 中且有尺寸
  if (tc && tc.parentElement && tc.parentElement.clientWidth > 0) {
    trendChartInstance = buildTrendChart(tc, trendData)
    if (trendChartInstance) trendChartInstance.resize()
  }
  if (oc && oc.parentElement && oc.parentElement.clientWidth > 0) {
    operatorChartInstance = buildOperatorChart(oc, opData)
    if (operatorChartInstance) operatorChartInstance.resize()
  }
}

async function handleOpen() {
  // 编排下沉到 composable.openDrawer（C 层，V 层不直接调 store）
  try {
    await openDrawer()
    await profile.refreshMasteryFromAnswers(allAnswers?.value || [])
    await nextTick()
    rebuildCharts()
  } catch (err) {
    console.error('[StatsDrawer] handleOpen failed:', err)
  }
}

async function handleExport() {
  exporting.value = true
  try {
    await exportData()
    ElMessage.success('数据已导出')
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function handleImport(file) {
  try {
    const result = await importData(file)
    ElMessage.success(`导入完成：新增 ${result.imported} 条记录，跳过 ${result.skipped} 条重复`)
    await nextTick()
    rebuildCharts()
  } catch (err) {
    ElMessage.error('导入失败，请检查文件格式')
    console.error(err)
  }
  return false
}

watch(() => isDrawerOpen, async (visible) => {
  if (!visible) {
    destroyChart(trendChartInstance); trendChartInstance = null
    destroyChart(operatorChartInstance); operatorChartInstance = null
  }
})

onBeforeUnmount(() => {
  destroyChart(trendChartInstance)
  destroyChart(operatorChartInstance)
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
  width: 100%;
}
.chart-container canvas {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
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

/* ── 游戏等级 ── */
.level-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 16px;
  color: #fff;
}
.level-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.level-icon { font-size: 24px; }
.level-title { font-size: 16px; font-weight: 700; flex: 1; }
.level-aux-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); white-space: nowrap; }
.level-xp { font-size: 12px; opacity: 0.85; }
.level-bar-wrap {
  height: 10px; background: rgba(255,255,255,0.25); border-radius: 5px; overflow: hidden;
}
.level-bar {
  height: 100%; border-radius: 5px; transition: width 0.5s ease;
}

/* ── 技能标签条（banner 下方独立一行） ── */
.skill-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid #e8eef5;
}
.skill-tag {
  font-size: 12px !important;
  font-weight: 600;
  border: none !important;
}
.skill-tag--strong {
  background: linear-gradient(135deg, #ffd700 0%, #ffb347 100%) !important;
  color: #fff !important;
  box-shadow: 0 2px 4px rgba(255, 200, 0, 0.3);
}
.skill-tag--weak {
  background: #e8e8e8 !important;
  color: #999 !important;
  border: 1px dashed #b0b0b0 !important;
}
</style>
