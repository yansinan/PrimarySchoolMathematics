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
    <div v-loading="loading" class="summary-content">
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

      <!-- P2 阶段 11：强项 v2 鼓励文案（组题完成弹窗） -->
      <div v-if="strengthEncouragement" class="summary-encourage">
        {{ strengthEncouragement }}
      </div>

      <div class="summary-footer">继续加油，每天进步一点点 ✨</div>
    </div>

    <!-- 全部数据通过 Props 传给 AbilityCard（避免 template 对嵌套 ref 的解包问题） -->
    <AbilityCard
      :stats-total="totalAnswers"
      :stats-correct="correctAnswers"
      :stats-strong="strongLevels"
      :stats-weak="weakLevels"
      :stats-level="totalAnswers > 0 ? levelCurrentDisplay : 0"
      :stats-level-total="statsLevelTotal"
      :stats-level-label="currentLevelLabel"
      :stats-mastery-by-number="masteryByNumber"
      :stats-weakness-v2="analysis.weaknessV2.value"
      :stats-strength-v2="analysis.strengthV2.value"
      :stats-wrong-priority="wrongPriorityList"
      :stats-weakness-by-number="weaknessByNumber"
      :stats-strength-by-number="strengthByNumber"
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
import { ref, watch } from 'vue'
import AbilityCard from '@/components/profile/AbilityCard.vue'
import { usePracticeStore } from '@/stores/practice'
import { useAbilityAnalysis } from '@/composables/useAbilityAnalysis'
import { useAbilityProfile } from '@/composables/useAbilityProfile'

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

// ── 从 store 读取能力画像数据 ──
const practiceStore = usePracticeStore()
const analysis = useAbilityAnalysis()
const profile = useAbilityProfile({ analysis, practiceStore })
const {
  strongLevels,
  weakLevels,
  levelCurrentDisplay,
  currentLevelLabel,
  masteryByNumber,
  weaknessByNumber,
  strengthByNumber,
  wrongPriorityList,
  statsLevelTotal,
} = profile

// ── P2 阶段 10：用户能力分析 composable（11 函数响应式数据层） ──
// 弹窗打开时才触发查询，避免常驻计算 + 页面污染
const loading = ref(false)
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      loading.value = true
      try {
        const answersSource = practiceStore.adaptiveAnswers && practiceStore.adaptiveAnswers.length
          ? practiceStore.adaptiveAnswers
          : practiceStore.session.answers
        await analysis.refresh()
        await analysis.refreshMasteryFromAnswers(answersSource || [])
      } finally {
        loading.value = false
      }
    }
  }
)

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

/* P2 阶段 11：强项 v2 鼓励文案 */
.summary-encourage {
  font-size: 15px;
  font-weight: 600;
  color: #27ae60;
  background: linear-gradient(135deg, #f0fdf4, #e6f9ed);
  border: 1px solid rgba(39, 174, 96, 0.2);
  border-radius: 12px;
  padding: 8px 16px;
  margin: 12px 0 4px;
  animation: encourage-pop 0.4s ease-out;
}

@keyframes encourage-pop {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
