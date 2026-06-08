<template>
  <el-drawer
    v-model="detailVisible"
    size="min(460px, 92vw)"
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
              <div class="detail-stat__value" :class="accuracyColor(session.accuracy)">
                {{ Math.round(session.accuracy * 100) }}%
              </div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">用时</div>
              <div class="detail-stat__value">{{ formatDuration(session.totalDuration) }}</div>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="12" style="margin-top: 8px;">
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">总题数</div>
              <div class="detail-stat__value">{{ session.totalQuestions }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">正确</div>
              <div class="detail-stat__value" style="color:#58cc71;">{{ session.correctCount }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="detail-stat">
              <div class="detail-stat__label">错误</div>
              <div class="detail-stat__value" style="color:#f56c6c;">{{ session.totalQuestions - session.correctCount }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <el-divider />

      <div class="answers-list" v-if="answers.length">
        <div
          v-for="(answer, index) in answers"
          :key="answer.id || index"
          class="answer-item"
          :class="{ 'answer-item--correct': answer.isCorrect, 'answer-item--wrong': !answer.isCorrect }"
        >
          <div class="answer-item__index">{{ index + 1 }}</div>
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
import { computed, watch } from 'vue'
import { Document, Check, Close } from '@element-plus/icons-vue'
import { useStatsStore } from '@/stores/stats'
import { formatDuration } from '@/utils/time/timeFormat'

const statsStore = useStatsStore()

const detailVisible = computed({
  get: () => !!statsStore.selectedSession,
  set: (val) => {
    if (!val) statsStore.selectedSession = null
  }
})

const session = computed(() => statsStore.selectedSession?.session || {})
const answers = computed(() => statsStore.selectedSession?.answers || [])

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
  // Show operator symbol in display form
  return (answer.equation || '')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
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

.answers-list {
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}

.answer-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 4px;
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
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0fa;
  color: #4a6a85;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.answer-item__equation {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 15px;
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
  font-size: 13px;
}

.answer-item__time {
  font-size: 12px;
  color: #8fa3b8;
  flex-shrink: 0;
  min-width: 48px;
  text-align: right;
}

.loading-placeholder {
  padding: 20px 0;
}
</style>
