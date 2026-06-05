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
      <span class="ability-card__compact-level">{{ statsLevelLabel || '—' }}</span>
      <span class="ability-card__compact-divider">·</span>
      <span class="ability-card__compact-acc" :class="accuracyClass">
        {{ hasData ? `${Math.round(displayAccuracy * 100)}%` : '—' }}
      </span>
    </div>

    <div v-if="!compact" class="ability-card__row">
      <div class="ability-card__level">
        <span class="ability-card__label">当前等级</span>
        <span class="ability-card__value">{{ statsLevelLabel || '—' }}</span>
      </div>
      <div class="ability-card__accuracy">
        <span class="ability-card__label">整体准确率</span>
        <span class="ability-card__value" :class="accuracyClass">
          {{ hasData ? `${Math.round(displayAccuracy * 100)}% (${statsCorrect}/${statsTotal})` : '—' }}
        </span>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--detail">
      <div class="ability-card__progress">
        <div class="ability-card__progress-label">
          <span>等级进度</span>
          <span class="ability-card__progress-text">{{ statsLevel }} / {{ statsLevelTotal }}</span>
        </div>
        <div class="ability-card__progress-bar">
          <div class="ability-card__progress-fill" :style="{ width: progressPercent + '%' }" />
        </div>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--tags">
      <div v-if="statsStrong.length" class="ability-card__tags ability-card__tags--strong">
        <span class="ability-card__tags-label">✓ 强项：</span>
        <span v-for="lv in statsStrong" :key="lv" class="ability-card__tag">{{ lv }}</span>
      </div>
      <div v-if="statsWeak.length" class="ability-card__tags ability-card__tags--weak">
        <span class="ability-card__tags-label">⚠ 薄弱：</span>
        <span v-for="lv in statsWeak" :key="lv" class="ability-card__tag">{{ lv }}</span>
      </div>
      <div v-if="!statsStrong.length && !statsWeak.length" class="ability-card__tags ability-card__tags--empty">
        <span class="ability-card__tags-label">完成诊断后这里会显示你的强项/薄弱</span>
      </div>
    </div>

    <!-- ── P2 阶段 10：v2 数据块（数字掌握度 + 错题优先级） ── -->
    <!-- 数字 0-9 掌握度：紧凑 10 个条形，0=未学过的留灰 -->
    <div v-if="!compact && hasMasteryData" class="ability-card__row ability-card__row--mastery">
      <div class="ability-card__mastery-label">数字掌握度（近 30 天）</div>
      <div class="ability-card__mastery-grid">
        <div
          v-for="n in 10"
          :key="n - 1"
          class="ability-card__mastery-cell"
          :class="masteryCellClass(n - 1)"
          :title="`${n - 1}: ${masteryPercent(n - 1)}%`"
        >
          <span class="ability-card__mastery-num">{{ n - 1 }}</span>
          <div class="ability-card__mastery-bar">
            <div
              class="ability-card__mastery-fill"
              :style="{ width: masteryPercent(n - 1) + '%' }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ── P2 阶段 14：弱项 v2 top 3（孩子友好的简洁文案） ── -->
    <div v-if="!compact && statsWeaknessByNumber.length" class="ability-card__row ability-card__row--v2-weak">
      <WeaknessV2Card
        :data="statsWeaknessByNumber"
        :limit="3"
        :title="`📒 多练习`"
        :empty-text="''"
      />
    </div>

    <!-- ── P2 阶段 14：强项 v2 top 3（孩子友好的简洁文案） ── -->
    <div v-if="!compact && statsStrengthByNumber.length" class="ability-card__row ability-card__row--v2-strong">
      <StrengthV2Card
        :data="statsStrengthByNumber"
        :limit="3"
        :title="`🌟 你最拿手`"
        :empty-text="''"
      />
    </div>

    <!-- 错题优先级 top 5：按 priority 降序 + 改正状态 -->
    <div v-if="!compact && statsWrongPriority.length" class="ability-card__row ability-card__row--wrong-priority">
      <div class="ability-card__wrong-label">📌 需重点关注（前 5）</div>
      <ol class="ability-card__wrong-list">
        <li
          v-for="(item, idx) in statsWrongPriority.slice(0, 5)"
          :key="item.questionId"
          class="ability-card__wrong-item"
          :class="{ 'ability-card__wrong-item--resolved': item.isResolved }"
        >
          <span class="ability-card__wrong-rank">{{ idx + 1 }}</span>
          <span class="ability-card__wrong-equation">{{ item.equation }}</span>
          <span class="ability-card__wrong-meta">
            错 {{ item.wrongCount }} 次 · P{{ item.priority }}
            <span v-if="item.isResolved" class="ability-card__wrong-resolved">已改正</span>
            <span v-else class="ability-card__wrong-unresolved">未改正</span>
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import WeaknessV2Card from './WeaknessV2Card.vue'
import StrengthV2Card from './StrengthV2Card.vue'
import { useAbilityProfile } from '@/composables/useAbilityProfile'

const props = defineProps({
  compact:         { type: Boolean,   default: false },
  statsTotal:      { type: Number,    default: 0 },
  statsCorrect:    { type: Number,    default: 0 },
  statsStrong:     { type: Array,     default: () => [] },
  statsWeak:       { type: Array,     default: () => [] },
  statsLevel:      { type: Number,    default: 0 },
  statsLevelTotal: { type: Number,    default: 12 },
  statsLevelLabel: { type: String,    default: '' },
  // ── 以下 4 个 props 为 P2 阶段 7 扩展（向后兼容：v2.0 不渲染，仅扩展 props 列表）
  // ── 数据来源：useAbilityAnalysis composable（阶段 8 由 saver 触发，阶段 9+ 接入 UI）
  /**
   * 数字 0-9 掌握度（聚合 accuracy，值域 0-1）
   * 来源：useAbilityAnalysis.masteryByNumber
   * 形状示例：{ 0: 0.85, 1: 0.6, ..., 9: 0.7 }
   * @type {Object<number, number>}
   */
  statsMasteryByNumber: { type: Object,  default: () => ({}) },
  /**
   * 动态弱项列表（按 accuracy 升序）
   * 来源：useAbilityAnalysis.weaknessV2
   * 元素形状：{ key: string, accuracy: number, sample: number, ... }
   * @type {Array<Object>}
   */
  statsWeaknessV2:      { type: Array,   default: () => [] },
  /**
   * 动态强项列表（按 score 降序）
   * 来源：useAbilityAnalysis.strengthV2
   * 元素形状：{ key: string, score: number, sample: number, ... }
   * @type {Array<Object>}
   */
  statsStrengthV2:      { type: Array,   default: () => [] },
  /**
   * 错题优先级列表（limit=20，按优先级排序）
   * 来源：useAbilityAnalysis.wrongAnswersPriority
   * 元素形状：{ questionId, equation, priority, lastWrong, ... }
   * @type {Array<Object>}
   */
  statsWrongPriority:   { type: Array,   default: () => [] },
  // ── P2 阶段 11：弱项 v2 / 强项 v2（单数字聚合） ──
  /**
   * 弱项 v2 数字列表（accuracy < 0.7）
   * 来源：useAbilityAnalysis.weaknessByNumber
   * 形状：[{ number, accuracy, total, correct, questionsCount }, ...]
   * @type {Array<Object>}
   */
  statsWeaknessByNumber: { type: Array, default: () => [] },
  /**
   * 强项 v2 数字列表（accuracy >= 0.8 且 total >= 3）
   * 来源：useAbilityAnalysis.strengthByNumber
   * 形状：[{ number, accuracy, total, correct, questionsCount }, ...]
   * @type {Array<Object>}
   */
  statsStrengthByNumber: { type: Array, default: () => [] },
})

const profile = useAbilityProfile({
  statsTotal: computed(() => props.statsTotal),
  statsCorrect: computed(() => props.statsCorrect),
  statsLevel: computed(() => props.statsLevel),
  statsLevelTotal: computed(() => props.statsLevelTotal),
  statsLevelLabel: computed(() => props.statsLevelLabel),
  masteryByNumber: computed(() => props.statsMasteryByNumber),
  masteryByNumberFull: computed(() => props.statsMasteryByNumber),
  weaknessByNumber: computed(() => props.statsWeaknessByNumber),
  strengthByNumber: computed(() => props.statsStrengthByNumber),
  wrongPriorityList: computed(() => props.statsWrongPriority),
})

const {
  hasData,
  displayAccuracy,
  accuracyClass,
  progressPercent,
  hasMasteryData,
  masteryPercent,
  masteryCellClass,
} = profile
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

/* ── P2 阶段 10：数字 0-9 掌握度（紧凑 10 格） ── */
.ability-card__row--mastery {
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.ability-card__mastery-label {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
}

.ability-card__mastery-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}

.ability-card__mastery-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 6px;
  background: #f5f7fa;
}

.ability-card__mastery-num {
  font-size: 10px;
  font-weight: 700;
  color: #1e3c5c;
  min-width: 8px;
  text-align: center;
}

.ability-card__mastery-bar {
  flex: 1;
  height: 4px;
  background: #e8edf3;
  border-radius: 2px;
  overflow: hidden;
}

.ability-card__mastery-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

.ability-card__mastery-cell--strong .ability-card__mastery-fill {
  background: #27ae60;
}
.ability-card__mastery-cell--mid .ability-card__mastery-fill {
  background: #e6a23c;
}
.ability-card__mastery-cell--weak .ability-card__mastery-fill {
  background: #e74c3c;
}
.ability-card__mastery-cell--empty {
  opacity: 0.5;
}
.ability-card__mastery-cell--empty .ability-card__mastery-bar {
  background: transparent;
}

/* ── P2 阶段 11：弱项 v2 / 强项 v2 块（嵌入 WeaknessV2Card / StrengthV2Card） ── */
.ability-card__row--v2-weak,
.ability-card__row--v2-strong {
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

/* ── P2 阶段 10：错题优先级 top 5 ── */
.ability-card__row--wrong-priority {
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.ability-card__wrong-label {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
}

.ability-card__wrong-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ability-card__wrong-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #fdf6ec;
}

.ability-card__wrong-item--resolved {
  background: #f0f9f4;
  opacity: 0.7;
}

.ability-card__wrong-rank {
  font-weight: 700;
  color: #e6a23c;
  min-width: 14px;
}

.ability-card__wrong-equation {
  font-family: 'Menlo', 'Consolas', monospace;
  font-weight: 600;
  color: #1e3c5c;
  min-width: 60px;
}

.ability-card__wrong-meta {
  font-size: 10px;
  color: #909399;
  margin-left: auto;
}

.ability-card__wrong-resolved {
  color: #27ae60;
  font-weight: 600;
  margin-left: 4px;
}

.ability-card__wrong-unresolved {
  color: #e74c3c;
  font-weight: 600;
  margin-left: 4px;
}
</style>
