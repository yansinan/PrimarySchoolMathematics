<!--
  自我评价弹窗组件
  替代 Practice.vue 中的内联 HTML + ElMessageBox + window.__evalSelect 全局桥
  使用 v-model:visible 控制显示，emit 'select' 传递 1-5 分
-->
<template>
  <el-dialog
    :key="groupIndex"
    :model-value="visible"
    title="💬 给这组题点个评"
    width="400px"
    :show-close="true"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    class="eval-dialog"
    @update:model-value="handleUpdate"
  >
    <div class="eval-content">
      <div class="eval-meta">
        第{{ groupIndex }}组 · {{ correctCount }}/{{ totalCount }} 正确 · {{ timeText }}
      </div>
      <div class="eval-prompt">{{ comment }} · 感觉怎么样？选一个表情吧</div>

      <div class="eval-faces">
        <div
          v-for="face in faces"
          :key="face.score"
          class="eval-face"
          :class="{ 'eval-face--selected': selectedScore === face.score }"
          @click="selectScore(face.score)"
        >
          {{ face.emoji }}
        </div>
      </div>

      <div class="eval-hint">
        <template v-if="selectedScore">
          已选「{{ scoreLabels[selectedScore] }}」
        </template>
        <template v-else>
          点击表情打分 · 单击即继续
        </template>
      </div>

      <!-- P2 阶段 14：本组 v2 弱项/强项（孩子友好的简洁文案） -->
      <div v-if="weaknessByNumberFlat.length || strengthByNumberFlat.length" class="eval-v2-cards">
        <StrengthV2Card
          v-if="strengthByNumberFlat.length"
          :data="strengthByNumberFlat"
          :limit="3"
          :title="'🌟 这组拿手'"
          :empty-text="''"
          compact
        />
        <WeaknessV2Card
          v-if="weaknessByNumberFlat.length"
          :data="weaknessByNumberFlat"
          :limit="3"
          :title="'📒 多练练'"
          :empty-text="''"
          compact
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
/**
 * Props:
 *  - visible: boolean
 *  - groupIndex: number
 *  - correctCount: number
 *  - totalCount: number
 *  - timeText: string (格式化后的时间，如 '01:23')
 *  - comment: string (本组评语，如 '又快又准！👍')
 *  - groupAnswers: Array (本组 answers，阶段 11 用于 v2 弱项/强项分析)
 *
 * Emits:
 *  - update:visible
 *  - select (score: 1|2|3|4|5)
 */
import { ref, watch } from 'vue'
import { useAbilityProfile } from '@/composables/useAbilityProfile'
import WeaknessV2Card from '@/components/profile/WeaknessV2Card.vue'
import StrengthV2Card from '@/components/profile/StrengthV2Card.vue'
import { EVAL_FACES, EVAL_SCORE_LABELS, DEFAULT_EVAL_SCORE, SELECT_CONFIRM_DELAY_MS } from '@/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  groupIndex: { type: Number, default: 1 },
  correctCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  timeText: { type: String, default: '00:00' },
  comment: { type: String, default: '' },
  // P2 阶段 11：本组 answers（用于 v2 弱项/强项分析）
  groupAnswers: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'select'])

const selectedScore = ref(DEFAULT_EVAL_SCORE)  // 默认 = 刚刚好

// ── P2 阶段 11：v2 数字弱项/强项（与 StatsDrawer / AbilityCard UI 统一组件） ──
// 数据范围：本组 answers（每组完成时调 refresh）
// arch-v2.3-2 整改: V 层不直连 analysis, 走 composable 委托
const profile = useAbilityProfile()
const { weaknessByNumberFlat, strengthByNumberFlat, refreshMasteryFromAnswers } = profile
watch(() => props.visible, (v) => {
  if (v) {
    selectedScore.value = DEFAULT_EVAL_SCORE
    // 弹窗打开时从本组 answers 算 mastery (经 composable 委托)
    refreshMasteryFromAnswers(props.groupAnswers)
  }
})

// 5 个表情（Unicode 表情字符，直接渲染）— 来自 constants/evaluation.js
const faces = EVAL_FACES

// 评分标签 — 来自 constants/evaluation.js
const scoreLabels = EVAL_SCORE_LABELS

function selectScore(score) {
  selectedScore.value = score
  // 唯一 emit select 入口: handleUpdate 不再 emit
  // 延迟常量来自 constants/evaluation.js (原 400ms → 800ms 让用户看清选择)
  setTimeout(() => {
    emit('select', score)
  }, SELECT_CONFIRM_DELAY_MS)
}

function handleUpdate(val) {
  if (!val) emit('select', selectedScore.value)
  emit('update:visible', val)
}
</script>

<style scoped>
.eval-content {
  text-align: center;
}

.eval-meta {
  font-size: 13px;
  color: #909399;
  margin-bottom: 2px;
}

.eval-prompt {
  font-size: 14px;
  font-weight: 600;
  color: #1e3c5c;
  margin: 10px 0 14px;
}

.eval-faces {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.eval-face {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  cursor: pointer;
  border-radius: 16px;
  border: 2px solid transparent;
  background: #f7fbff;
  box-shadow: 0 2px 8px rgba(23, 110, 191, 0.06);
  transition: all 0.2s ease;
}

.eval-face:hover {
  background: #e9f4ff;
  border-color: #409eff;
  transform: scale(1.1);
}

.eval-face--selected {
  background: #d9ecff !important;
  border-color: #409eff !important;
}

.eval-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}

/* P2 阶段 11：本组 v2 弱项/强项卡 */
.eval-v2-cards {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #edf2f7;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
</style>
