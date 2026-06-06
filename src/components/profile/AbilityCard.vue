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
      <span class="ability-card__compact-level">{{ currentLevelLabel || '—' }}</span>
      <span class="ability-card__compact-divider">·</span>
      <span class="ability-card__compact-acc" :class="accuracyClass">
        {{ hasData ? `${Math.round(displayAccuracy * 100)}%` : '—' }}
      </span>
    </div>

    <div v-if="!compact" class="ability-card__row">
      <div class="ability-card__level">
        <span class="ability-card__label">当前等级</span>
        <span class="ability-card__value">{{ currentLevelLabel || '—' }}</span>
      </div>
      <div class="ability-card__accuracy">
        <span class="ability-card__label">整体准确率</span>
        <span class="ability-card__value" :class="accuracyClass">
          {{ hasData ? `${Math.round(displayAccuracy * 100)}% (${scoreSum}/${totalAnswers})` : '—' }}
        </span>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--detail">
      <div class="ability-card__progress">
        <div class="ability-card__progress-label">
          <span>等级进度</span>
          <span class="ability-card__progress-text">{{ levelCurrentDisplay }} / {{ statsLevelTotal }}</span>
        </div>
        <div class="ability-card__progress-bar">
          <div class="ability-card__progress-fill" :style="{ width: progressPercent + '%' }" />
        </div>
      </div>
    </div>

    <div v-if="!compact" class="ability-card__row ability-card__row--tags">
      <div v-if="strongLevels.length" class="ability-card__tags ability-card__tags--strong">
        <span class="ability-card__tags-label">✓ 强项：</span>
        <span v-for="lv in strongLevels" :key="lv" class="ability-card__tag">{{ lv }}</span>
      </div>
      <div v-if="weakLevels.length" class="ability-card__tags ability-card__tags--weak">
        <span class="ability-card__tags-label">⚠ 薄弱：</span>
        <span v-for="lv in weakLevels" :key="lv" class="ability-card__tag">{{ lv }}</span>
      </div>
      <div v-if="!strongLevels.length && !weakLevels.length" class="ability-card__tags ability-card__tags--empty">
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
    <div v-if="!compact && weaknessByNumber.length" class="ability-card__row ability-card__row--v2-weak">
      <WeaknessV2Card
        :data="weaknessByNumber"
        :limit="3"
        :title="`📒 多练习`"
        :empty-text="''"
      />
    </div>

    <!-- ── P2 阶段 14：强项 v2 top 3（孩子友好的简洁文案） ── -->
    <div v-if="!compact && strengthByNumber.length" class="ability-card__row ability-card__row--v2-strong">
      <StrengthV2Card
        :data="strengthByNumber"
        :limit="3"
        :title="`🌟 你最拿手`"
        :empty-text="''"
      />
    </div>

    <!-- 错题优先级 top 5：按 priority 降序 + 改正状态 -->
    <div v-if="!compact && wrongPriorityList.length" class="ability-card__row ability-card__row--wrong-priority">
      <div class="ability-card__wrong-label">📌 需重点关注（前 5）</div>
      <ol class="ability-card__wrong-list">
        <li
          v-for="(item, idx) in wrongPriorityList.slice(0, priorityLimit)"
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
/**
 * AbilityCard.vue
 * 用户能力画像展示卡片
 *
 * 数据源：内部 useAbilityProfile() composable
 *   - 不再接收 12 个 legacy props（arch-v2.3-5.4 清理）
 *   - 模板里的所有 ref 全部从 profile 解构
 *   - 上层（PracticeSummaryDialog 等）只控制 visible，不再喂数据
 *
 * 架构层级：V (本组件) → C (useAbilityProfile) → S (store) / D (database)
 * 约束：V 不直接 import S / D，跨层通过 composable
 */
import WeaknessV2Card from './WeaknessV2Card.vue'
import StrengthV2Card from './StrengthV2Card.vue'
import { useAbilityProfile } from '@/composables/useAbilityProfile'

// 无参调用：composable 内部从 store + analysis 取默认数据源
const profile = useAbilityProfile()

// 完整解构：覆盖模板用到的所有 ref（ref 在模板中自动解包，无需 .value）
const {
  // 顶层数据
  totalAnswers,        // 答题总数（来自 statsTotal）
  scoreSum,            // 正确分合计（来自 statsCorrect）
  hasData,             // 是否有答题数据
  displayAccuracy,     // 0-1 准确率
  accuracyClass,       // 准确率等级 class
  // 等级相关
  levelCurrentDisplay, // 当前等级数字（1-based）
  currentLevelLabel,   // 当前等级文案
  progressPercent,     // 等级进度条百分比
  statsLevelTotal,     // 等级总数（DIFFICULTY_LEVELS.length）
  // 强项 / 弱项（按 level 维度）
  strongLevels,        // 强项等级 label 列表
  weakLevels,          // 薄弱等级 label 列表
  // 数字掌握度（按 number 维度）
  hasMasteryData,
  masteryPercent,
  masteryCellClass,
  // v2 弱项 / 强项 / 错题
  weaknessByNumber,    // 弱项 v2 数字列表
  strengthByNumber,    // 强项 v2 数字列表
  wrongPriorityList,   // 错题优先级列表
  priorityLimit,       // 错题优先级截取上限（fallback 5）
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
