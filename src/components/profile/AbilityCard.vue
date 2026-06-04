<!--
  AbilityCard.vue
  用户能力画像展示卡片
  显示：当前等级、整体准确率、强项、薄弱项、等级进度
  支持 compact 模式：仅显示一行简版（不干扰答题）
-->
<template>
  <div class="ability-card" :class="{ 'ability-card--compact': compact }">
    <div v-if="!compact" class="ability-card__header">
      <span class="ability-card__title">📊 我的数学能力</span>
      <span class="ability-card__subtitle">真实水平 · 持续提升</span>
    </div>
    <div v-else class="ability-card__compact-row">
      <span class="ability-card__compact-label">📊</span>
      <span class="ability-card__compact-level">{{ displayLevelLabel }}</span>
      <span class="ability-card__compact-divider">·</span>
      <span class="ability-card__compact-acc" :class="accuracyClass">
        {{ displayTotal > 0
          ? `${Math.round(displayAccuracy * 100)}%`
          : '—' }}
      </span>
    </div>

    <div v-if="!compact" class="ability-card__row">
      <div class="ability-card__level">
        <span class="ability-card__label">当前等级</span>
        <span class="ability-card__value">{{ displayLevelLabel }}</span>
      </div>
      <div class="ability-card__accuracy">
        <span class="ability-card__label">整体准确率</span>
        <span class="ability-card__value" :class="accuracyClass">
          {{ displayTotal > 0
            ? `${Math.round(displayAccuracy * 100)}% (${displayCorrect}/${displayTotal})`
            : '—' }}
        </span>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--detail">
      <div class="ability-card__progress">
        <div class="ability-card__progress-label">
          <span>等级进度</span>
          <span class="ability-card__progress-text">
            {{ profile.levelProgress.current }} / {{ profile.levelProgress.total }}
          </span>
        </div>
        <div class="ability-card__progress-bar">
          <div
            class="ability-card__progress-fill"
            :style="{ width: progressPercent + '%' }"
          />
        </div>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--tags">
      <div v-if="profile.strongLevels.length" class="ability-card__tags ability-card__tags--strong">
        <span class="ability-card__tags-label">✓ 强项：</span>
        <span v-for="lv in profile.strongLevels" :key="lv.id" class="ability-card__tag">
          {{ lv.label }}
        </span>
      </div>
      <div v-if="profile.weakLevels.length" class="ability-card__tags ability-card__tags--weak">
        <span class="ability-card__tags-label">⚠ 薄弱：</span>
        <span v-for="lv in profile.weakLevels" :key="lv.id" class="ability-card__tag">
          {{ lv.label }}
        </span>
      </div>
      <div v-if="!profile.strongLevels.length && !profile.weakLevels.length" class="ability-card__tags ability-card__tags--empty">
        <span class="ability-card__tags-label">完成诊断后这里会显示你的强项/薄弱</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAbilityProfile, STRONG_THRESHOLD, WEAK_THRESHOLD } from '@/composables/useAbilityProfile'

const props = defineProps({
  compact: { type: Boolean, default: false },
  // 可选：从父组件传入统计数据（避免 composable 内部追踪 store 的可靠性问题）
  statsTotal: { type: Number, default: 0 },
  statsCorrect: { type: Number, default: 0 },
  statsLevelLabel: { type: String, default: '' },
})

const profile = useAbilityProfile()

// 优先使用传入的 props，否则回退到 composable
const displayTotal = computed(() => props.statsTotal > 0 ? props.statsTotal : profile.overallStats.total)
const displayCorrect = computed(() => props.statsCorrect > 0 ? props.statsCorrect : profile.overallStats.correct)
const displayLevelLabel = computed(() => props.statsLevelLabel || profile.currentLevelLabel)
const displayAccuracy = computed(() => {
  if (displayTotal.value > 0) return displayCorrect.value / displayTotal.value
  return profile.overallAccuracy.value
})

const progressPercent = computed(() => {
  const { current, total } = profile.levelProgress.value || {}
  if (!total || total <= 0) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
})

const accuracyClass = computed(() => {
  const acc = displayAccuracy.value
  if (acc >= STRONG_THRESHOLD) return 'ability-card__value--strong'
  if (acc < WEAK_THRESHOLD) return 'ability-card__value--weak'
  return 'ability-card__value--mid'
})
</script>

<style scoped lang="scss">
.ability-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.92) 100%);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 18px;
  margin: 12px 16px;
  box-shadow: 0 4px 16px rgba(23, 110, 191, 0.08);
  border: 1px solid rgba(23, 110, 191, 0.12);
}

.ability-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ability-card__title {
  font-size: 15px;
  font-weight: 700;
  color: #1e3c5c;
}

.ability-card__subtitle {
  font-size: 11px;
  color: #909399;
}

/* ── Compact 模式：答题时一行简版，不占视觉空间 ── */
.ability-card--compact {
  padding: 6px 12px;
  margin: 8px 16px;
  background: rgba(255, 255, 255, 0.7);
}

.ability-card__compact-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #5b6b7c;
}

.ability-card__compact-label {
  font-size: 14px;
}

.ability-card__compact-level {
  font-weight: 600;
  color: #1e3c5c;
}

.ability-card__compact-divider {
  color: #c0c4cc;
}

.ability-card__compact-acc {
  font-weight: 600;
}

.ability-card__row {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;

  &:last-child {
    margin-bottom: 0;
  }
}

.ability-card__row--detail {
  flex-direction: column;
  gap: 4px;
}

.ability-card__row--tags {
  flex-direction: column;
  gap: 4px;
}

.ability-card__level,
.ability-card__accuracy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ability-card__label {
  font-size: 11px;
  color: #909399;
}

.ability-card__value {
  font-size: 15px;
  font-weight: 700;
  color: #1e3c5c;
}

.ability-card__value--strong {
  color: #27ae60;
}

.ability-card__value--mid {
  color: #e6a23c;
}

.ability-card__value--weak {
  color: #e74c3c;
}

.ability-card__progress {
  width: 100%;
}

.ability-card__progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.ability-card__progress-text {
  font-weight: 600;
  color: #1e3c5c;
}

.ability-card__progress-bar {
  width: 100%;
  height: 6px;
  background: #e8edf3;
  border-radius: 3px;
  overflow: hidden;
}

.ability-card__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #67c23a);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.ability-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}

.ability-card__tags-label {
  font-weight: 600;
  margin-right: 4px;
}

.ability-card__tags--strong .ability-card__tags-label {
  color: #27ae60;
}

.ability-card__tags--weak .ability-card__tags-label {
  color: #e6a23c;
}

.ability-card__tags--empty .ability-card__tags-label {
  color: #c0c4cc;
  font-weight: 400;
}

.ability-card__tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.ability-card__tags--strong .ability-card__tag {
  background: rgba(39, 174, 96, 0.1);
  color: #27ae60;
}

.ability-card__tags--weak .ability-card__tag {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}
</style>
