<template>
  <el-drawer
    v-model="detailVisible"
    size="min(500px, 92vw)"
    direction="rtl"
    @closed="handleClosed"
  >
    <template #header>
      <span class="detail-title">
        <el-icon :size="20" style="margin-right: 6px;"><Document /></el-icon>
        答题详情
      </span>
    </template>

    <template v-if="statsStore.selectedSession">
      <div class="detail-header">
        <el-row :gutter="12">
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">日期</div>
              <div class="detail-stat__value">{{ formatDate(session.createdAt) }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">正确率</div>
              <div class="detail-stat__value" :class="accuracyColor(roundStats.accuracy)">
                {{ Math.round(roundStats.accuracy * 100) }}%
              </div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">用时</div>
              <div class="detail-stat__value">{{ formatDuration(roundStats.totalDuration) }}</div>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="12" style="margin-top: 8px;">
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">总题数</div>
              <div class="detail-stat__value">{{ roundStats.totalQuestions }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">正确</div>
              <div class="detail-stat__value" style="color:#58cc71;">{{ roundStats.correctCount }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">错误</div>
              <div class="detail-stat__value" style="color:#f56c6c;">{{ roundStats.totalQuestions - roundStats.correctCount }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <el-divider />

      <!-- ── 分组展示 ── -->
      <div v-if="groups.length" class="groups-list">
        <div
          v-for="(g, gi) in groups"
          :key="gi"
          class="group-block"
        >
          <div class="group-header">
            <span class="group-header__title">{{ g.label }}</span>
            <span class="group-header__meta">{{ g.answers.length }} 题</span>
            <el-tag
              v-if="g.accuracy != null"
              :type="g.accuracy >= 0.8 ? 'success' : g.accuracy >= 0.5 ? 'warning' : 'danger'"
              size="small"
            >{{ Math.round(g.accuracy * 100) }}%</el-tag>
          </div>

          <div class="answers-list">
            <div
              v-for="(answer, ai) in g.answers"
              :key="answer.id || `${gi}-${ai}`"
              class="answer-item"
              :class="{ 'answer-item--correct': answer.isCorrect, 'answer-item--wrong': !answer.isCorrect }"
            >
              <div class="answer-item__index">{{ ai + 1 }}</div>
              <div class="answer-item__equation">{{ displayEquation(answer) }}</div>
              <div class="answer-item__answer" :class="{ 'answer-item__answer--wrong': !answer.isCorrect }">
                <template v-if="answer.isCorrect">
                  <el-icon color="#58cc71"><Check /></el-icon>
                  {{ answer.userAnswer }}
                </template>
                <template v-else>
                  <el-icon color="#f56c6c"><Close /></el-icon>
                  <span class="answer-item__user-value">{{ answer.userAnswer }}</span>
                  <span class="answer-item__correct-value">(正确答案: {{ answer.solution }})</span>
                </template>
              </div>
              <div class="answer-item__time">{{ formatResponseTime(answer.responseTime) }}</div>
              <el-tag
                v-if="getTypeLabel(answer)"
                size="small"
                class="answer-item__type"
              >{{ getTypeLabel(answer) }}</el-tag>
            </div>
          </div>
        </div>
      </div>

      <el-empty v-else description="暂无答题数据" />
    </template>

    <div v-else class="loading-placeholder">
      <el-skeleton :rows="10" animated />
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, watchEffect } from 'vue'
import { Document, Check, Close } from '@element-plus/icons-vue'
import { useStatsStore } from '@/stores/stats'
import { formatDuration } from '@/utils/time/timeFormat'
import { PracticeSession } from '@/services/PracticeSession'
import { Question } from '@/utils/algorithm/question'
import { Answer } from '@/utils/algorithm/answer'

const statsStore = useStatsStore()

const detailVisible = computed({
  get: () => !!statsStore.selectedSession,
  set: (val) => {
    if (!val) statsStore.selectedSession = null
  }
})

const session = computed(() => statsStore.selectedSession?.session || {})
const siblings = computed(() => statsStore.selectedSession?.siblings || [])
const roundStats = ref({ totalQuestions: 0, correctCount: 0, accuracy: 0, totalDuration: 0 })

/** 分组: sibling（checkpoint）各一组，最后余下的 main session answers 作为最后一组 */
const groups = computed(() => {
  const result = []
  for (const sib of siblings.value) {
    const grp = buildGroup(sib.session, sib.answers)
    result.push(grp)
  }
  // main session 的 answers 作为最终组
  const mainAnswers = statsStore.selectedSession?.answers || []
  if (mainAnswers.length) {
    result.push(buildGroup(session.value, mainAnswers, true))
  }
  return result
})

function buildGroup(sess, answers, isFinal = false) {
  const correct = answers.filter(a => a.isCorrect).length
  return {
    label: isFinal ? '最终组' : `第${sess.id}组`,
    answers,
    accuracy: answers.length ? correct / answers.length : 0,
  }
}

/** 计算整轮统计（所有 answers 合并） */
watchEffect(async () => {
  if (statsStore.selectedSession) {
    const allAnswers = []
    for (const sib of siblings.value) {
      allAnswers.push(...sib.answers)
    }
    allAnswers.push(...(statsStore.selectedSession.answers || []))

    if (allAnswers.length) {
      const instances = allAnswers.map(r => r instanceof Answer ? r : Answer.fromJSON(r))
      const sess = new PracticeSession({})
      roundStats.value = await sess.computeStats(instances)
    } else {
      roundStats.value = { totalQuestions: 0, correctCount: 0, accuracy: 0, totalDuration: 0 }
    }
  } else {
    roundStats.value = { totalQuestions: 0, correctCount: 0, accuracy: 0, totalDuration: 0 }
  }
})

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatResponseTime(ms) {
  return formatDuration(ms)
}

function accuracyColor(accuracy) {
  if (accuracy >= 0.8) return 'color-success'
  if (accuracy >= 0.6) return 'color-warning'
  return 'color-danger'
}

function displayEquation(answer) {
  if (!answer) return ''
  return (answer.equation || '')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
}

function getTypeLabel(answer) {
  return Question.getTypeLabel(answer)
}

function handleClosed() {
  statsStore.selectedSession = null
}
</script>

<style scoped>
.detail-title {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 18px;
}

.detail-header {
  background: #f5f9ff;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #e8f0fa;
}

.detail-stat {
  text-align: center;
}

.detail-stat__label {
  font-size: 12px;
  color: #8fa3b8;
  margin-bottom: 4px;
}

.detail-stat__value {
  font-size: 18px;
  font-weight: 700;
  color: #1e3c5c;
}

.detail-stat__value.color-success { color: #58cc71; }
.detail-stat__value.color-warning { color: #e6a23c; }
.detail-stat__value.color-danger  { color: #f56c6c; }

/* ── Group blocks ── */
.groups-list {
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}

.group-block {
  margin-bottom: 16px;
  border: 1px solid #eef3f9;
  border-radius: 10px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #f5f9ff;
  border-bottom: 1px solid #eef3f9;
}

.group-header__title {
  font-weight: 600;
  font-size: 14px;
  color: #1e3c5c;
}

.group-header__meta {
  font-size: 12px;
  color: #8fa3b8;
  margin-right: auto;
}

/* ── Answer items ── */
.answers-list {
  padding: 4px 0;
}

.answer-item {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  gap: 10px;
  font-size: 14px;
  transition: background 0.15s;
}

.answer-item--correct {
  background: #f0faf0;
}

.answer-item--wrong {
  background: #fdf0f0;
}

.answer-item__index {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0fa;
  color: #4a6a85;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.answer-item__equation {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 500;
  color: #1e3c5c;
}

.answer-item__answer {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: #1e3c5c;
  flex-shrink: 0;
}

.answer-item__answer--wrong {
  color: #f56c6c;
}

.answer-item__user-value {
  text-decoration: line-through;
  color: #f56c6c;
}

.answer-item__correct-value {
  color: #58cc71;
  font-weight: 500;
  font-size: 12px;
}

.answer-item__time {
  font-size: 11px;
  color: #8fa3b8;
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
}

.answer-item__type {
  margin-left: 2px;
  flex-shrink: 0;
}

.loading-placeholder {
  padding: 20px 0;
}
</style>
