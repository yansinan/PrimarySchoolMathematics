<!--
  练习汇总弹窗组件
  替代 Practice.vue 中的内联 HTML + ElMessageBox.confirm
  使用 v-model:visible 控制显示，emit 'select' 传递用户选择 ('confirm' | 'cancel' | 'close')
-->
<template>
  <el-dialog
    :model-value="visible"
    title="🎉 本轮练习汇总"
    width="420px"
    :show-close="true"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    custom-class="eval-dialog"
    @update:model-value="handleUpdate"
  >
    <div class="summary-content">
      <div class="summary-emoji">{{ emoji }}</div>
      <div class="summary-title">练习完成</div>
      <div class="summary-comment">{{ comment }}</div>

      <div class="summary-stats">
        <div class="stat-card stat-card--blue">
          <div class="stat-value">{{ totalAnswers }}</div>
          <div class="stat-label">共答</div>
        </div>
        <div class="stat-card stat-card--green">
          <div class="stat-value">{{ correctAnswers }}</div>
          <div class="stat-label">正确</div>
        </div>
        <div class="stat-card stat-card--yellow">
          <div class="stat-value" :style="{ color: rateColor }">{{ rate }}%</div>
          <div class="stat-label">正确率</div>
        </div>
        <div v-if="totalTime" class="stat-card stat-card--purple">
          <div class="stat-value">{{ totalTime }}</div>
          <div class="stat-label">用时</div>
        </div>
      </div>

      <div class="summary-footer">继续加油，每天进步一点点 ✨</div>
    </div>

    <!-- 用 dialog props 传给 AbilityCard（不依赖 composable 内部追踪 adaptiveAnswers） -->
    <AbilityCard
      :stats-total="totalAnswers"
      :stats-correct="correctAnswers"
      :stats-level-label="profile.currentLevelLabel"
    />

    <template #footer>
      <el-button @click="handleSelect('cancel')">{{ cancelText }}</el-button>
      <el-button type="primary" @click="handleSelect('confirm')">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * Props:
 *  - visible: boolean
 *  - emoji: string
 *  - comment: string
 *  - totalAnswers: number
 *  - correctAnswers: number
 *  - rate: number (0-100)
 *  - rateColor: string (hex)
 *  - totalTime: string (可选，如 "01:23")
 *  - confirmText: string (默认 '📊 分析' 或 '开始新一轮')
 *  - cancelText: string (默认 '🏠 首页' 或 '📊 分析')
 *
 * Emits:
 *  - update:visible (boolean)
 *  - select (action: 'confirm' | 'cancel' | 'close')
 */
import { computed } from 'vue'
import AbilityCard from '@/components/profile/AbilityCard.vue'
import { useAbilityProfile } from '@/composables/useAbilityProfile'
const profile = useAbilityProfile()

const props = defineProps({
  visible: { type: Boolean, default: false },
  emoji: { type: String, default: '🏆' },
  comment: { type: String, default: '' },
  totalAnswers: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  rateColor: { type: String, default: '#27ae60' },
  totalTime: { type: String, default: '' },
  confirmText: { type: String, default: '📊 分析' },
  cancelText: { type: String, default: '🏠 首页' },
})

const emit = defineEmits(['update:visible', 'select'])

function handleSelect(action) {
  emit('select', action)
  emit('update:visible', false)
}

function handleUpdate(val) {
  if (!val) emit('select', 'close')
  emit('update:visible', val)
}
</script>

<style scoped>
.summary-content {
  text-align: center;
  padding: 4px 0;
}

.summary-emoji {
  font-size: 52px;
  margin-bottom: 8px;
  line-height: 1.2;
}

.summary-title {
  font-size: 22px;
  font-weight: 700;
  color: #1e3c5c;
  margin-bottom: 4px;
}

.summary-comment {
  font-size: 14px;
  color: #909399;
  margin-bottom: 18px;
}

.summary-stats {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  border-radius: 14px;
  padding: 10px 18px;
  min-width: 68px;
  box-shadow: 0 2px 8px rgba(23, 110, 191, 0.06);
}

.stat-card--blue {
  background: linear-gradient(135deg, #f0f9ff, #e8f4fd);
}
.stat-card--green {
  background: linear-gradient(135deg, #f0fdf4, #e6f9ed);
}
.stat-card--yellow {
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
}
.stat-card--purple {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e3c5c;
}

.stat-label {
  font-size: 11px;
  color: #7f8c8d;
  margin-top: 2px;
}

.summary-footer {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #edf2f7;
  font-size: 12px;
  color: #c0c4cc;
}
</style>
