<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <!-- P2: 用户能力画像仅在汇总弹窗中显示完整版（PracticeSummaryDialog），
           答题时不再常驻以避免分散注意力 -->

      <el-card class="practice-card" shadow="never" v-if="currentQuestion !== null">
        <div class="practice-card__header">
          <div class="header-left">
            <div class="stage-badge" :class="{ 'stage-badge--assessment': isAssessment }">{{ currentStage }}</div>
            <!-- 多组自定义练习：复用阶段徽标样式，只多一个组序号 -->
            <div v-if="groupBadgeText" class="stage-badge stage-badge--group">{{ groupBadgeText }}</div>
          </div>
          <div class="header-right">
            <div class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</div>
            <SyncIndicator @open="statsStore.openDrawer()" />
            <button
              type="button"
              class="sfx-toggle"
              :title="sfxOn ? '关闭音效' : '开启音效'"
              :aria-label="sfxOn ? '关闭音效' : '开启音效'"
              @click="toggleSfx"
            >
              <el-icon :size="18"><component :is="sfxOn ? Bell : Mute" /></el-icon>
            </button>
          </div>
        </div>

        <ProgressSteps
          :total="progressTotal"
          :current="progressCurrent"
          :answers="progressAnswers"
          :correct-count="groupCorrectCount"
        />

        <div class="question-area">
          <component
            ref="layoutRef"
            :is="currentLayout"
            :show-answer="session.feedbackType !== null"
            :answer="currentQuestion.solution"
            :user-answer="session.currentAnswer"
            :enable-direct-input="session.displayMode.input === 'keypad' && session.feedbackType === null"
            :digit-mode="session.displayMode.layout === 'vertical' && session.displayMode.input === 'keypad'"
            :focus-slot="digitFocusIdx"
            :class="{
              'correct-flash': session.feedbackType === 'correct',
              'wrong-flash': session.feedbackType === 'wrong',
              'review-question': isReviewQuestion
            }"
            @update:user-answer="handleInput"
            @submit-answer="handleSubmit"
            @focus="digitFocusIdx = $event"
          />
        </div>

        <!-- 答错后常驻的错因条：toast 一闪而过，孩子看不到；这里留到下一题 -->
        <div v-if="session.feedbackType === 'wrong'" class="wrong-reason">
          <span class="wrong-reason__label">{{ wrongReasonText || '再算一遍试试' }}</span>
          <span class="wrong-reason__ans">正确答案 <b>{{ currentQuestion.solution }}</b></span>
        </div>

        <div class="input-area">
          <div class="keyboard-hint">
            <span v-if="isKeypad()">0-9 输入 · ⌫ 退格 · Enter 提交</span>
            <span v-else>← → 选择 · Enter 提交</span>
          </div>
          <component
            :is="currentInput"
            v-bind="inputProps"
            @input="handleInput"
            @select="handleSelect"
            @backspace="() => handleBackspace(true)"
            @submit="handleSubmit"
            @next="handleNext"
          />
        </div>
      </el-card>

      <!-- 开始练习界面：有画像进入时先展示学习情况 / 本次设置 / 练习重点 -->
      <el-card v-else-if="readyToStart" class="practice-card practice-card--start" shadow="never">
        <div class="start-panel">
          <div class="start-head">
            <div class="start-title">准备开始</div>
            <div class="start-sub">今天也来练一练吧</div>
          </div>

          <section class="start-section">
            <div class="start-section__title">目前学习情况</div>
            <div class="start-metrics">
              <div class="metric">
                <div class="metric__value">Lv.{{ startInfo.levelIdx }}</div>
                <div class="metric__label">
                  {{ startInfo.levelLabel }}
                  <span v-if="startInfo.grade" class="metric__grade">{{ startInfo.grade }}</span>
                </div>
              </div>
              <div class="metric">
                <div class="metric__value">
                  {{ startInfo.lastAccuracy === null ? '—' : startInfo.lastAccuracy }}<span
                    v-if="startInfo.lastAccuracy !== null" class="metric__unit">%</span>
                </div>
                <div class="metric__label">上次正确率</div>
              </div>
              <div class="metric">
                <div class="metric__value">{{ startInfo.streak || '—' }}<span
                  v-if="startInfo.streak" class="metric__unit">天</span></div>
                <div class="metric__label">连续练习</div>
              </div>
            </div>
          </section>

          <!-- 练习重点：孩子该关注什么，放在状态下面 -->
          <section v-if="startInfo.focus.length" class="start-section">
            <div class="start-section__title">练习重点</div>
            <div class="start-chips">
              <span v-for="f in startInfo.focus" :key="f" class="chip chip--focus">{{ f }}</span>
            </div>
          </section>

          <!-- 本次练习设置：默认折叠，只占一行标题 + 一行摘要 -->
          <section class="start-section start-section--settings">
            <div class="settings-head" @click="settingsOpen = !settingsOpen">
              <svg class="settings-caret" :class="{ 'settings-caret--open': settingsOpen }"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span class="settings-label">本次练习设置</span>
              <span class="scope-badge">只影响本次练习</span>
            </div>

            <!-- 折叠态摘要 -->
            <div v-if="!settingsOpen" class="settings-summary">
              <span class="chip chip--summary">Lv.{{ startInfo.levelIdx }} {{ startInfo.levelLabel }}</span>
              <span class="chip chip--summary">{{ startInfo.targetMin }}~{{ startInfo.targetMax }} 题</span>
              <span class="chip chip--summary">每组 4~10 题</span>
              <span class="chip chip--summary">{{ startInfo.challengeEnabled ? '含挑战题' : '只练本档' }}</span>
              <span class="chip chip--summary">{{ startInfo.autoAdvance ? '自动升档' : '手动升档' }}</span>
            </div>

            <!-- 展开态：5 行紧凑设置 -->
            <div v-else class="settings-rows">
              <div class="setting-row setting-row--level">
                <span class="setting-row__label">档位</span>
                <span class="setting-row__value">Lv.{{ startInfo.levelIdx }}</span>
                <span class="level-actions">
                  <el-button size="small" class="level-btn" :disabled="levelDownDisabled"
                    :title="levelDownTitle" @click="shiftLevel(-1)">降一档</el-button>
                  <el-button size="small" type="success" class="level-btn" :disabled="levelUpDisabled"
                    :title="levelUpTitle" @click="shiftLevel(1)">升一档</el-button>
                  <el-button size="small" class="level-more-btn" :title="moreOpen ? '收起更多档位控制' : '更多档位控制'"
                    @click="moreOpen = !moreOpen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </el-button>
                </span>
              </div>

              <!-- 更多档位控制（低频：起点档位 / 恢复自动） -->
              <div v-if="moreOpen" class="settings-more">
                <div class="settings-more__title">更多档位控制</div>
                <div class="settings-more__row">
                  <span class="settings-more__label">起点档位</span>
                  <el-select v-model="levelDraft" clearable size="small" class="settings-more__select"
                    placeholder="自动（按练习记录计算）" popper-class="level-pick__popper">
                    <el-option-group v-for="group in groupedLevels" :key="group.grade" :label="group.grade">
                      <el-option v-for="lv in group.levels" :key="lv.idx"
                        :label="`Lv.${lv.idx + 1} ${lv.label}`" :value="lv.idx" />
                    </el-option-group>
                  </el-select>
                </div>
                <div class="settings-more__hint">指定后下次开始练习生效，不影响当前这一轮</div>
                <div class="settings-more__actions">
                  <el-button size="small" :disabled="!levelOverrideActive" @click="resetLevelOverride">恢复自动</el-button>
                  <el-button size="small" type="success" :disabled="levelDraft == null" @click="applyLevelOverride">应用</el-button>
                </div>
              </div>

              <div class="setting-row setting-row--pair">
                <div class="setting-pair">
                  <span class="setting-row__label">挑战题</span>
                  <el-popover trigger="click" placement="bottom-start" :width="220"
                    content="打开后，这一轮会混入下一档的题（约 15%）">
                    <template #reference><span class="hint-btn">?</span></template>
                  </el-popover>
                  <el-switch :model-value="startInfo.challengeEnabled"
                    @update:model-value="setChallengeEnabled" />
                </div>
                <div class="setting-pair">
                  <span class="setting-row__label">自动升档</span>
                  <el-popover trigger="click" placement="bottom-start" :width="240"
                    content="打开后，练够量且正确率达标就自动进下一档；此时降/升档不可用">
                    <template #reference><span class="hint-btn">?</span></template>
                  </el-popover>
                  <el-switch :model-value="startInfo.autoAdvance"
                    @update:model-value="setAutoAdvance" />
                </div>
              </div>

              <div class="setting-row">
                <span class="setting-row__label">题量</span>
                <el-popover trigger="click" placement="bottom-start" :width="220"
                  content="这一轮做几题：最少 ~ 最多。答得好会提前结束">
                  <template #reference><span class="hint-btn">?</span></template>
                </el-popover>
                <span class="setting-row__spacer"></span>
                <el-input v-model.number="targetDraft.min" type="number" inputmode="numeric"
                  class="target-input" @change="saveAdaptiveAmount" />
                <span class="setting-row__unit">~</span>
                <el-input v-model.number="targetDraft.max" type="number" inputmode="numeric"
                  class="target-input" @change="saveAdaptiveAmount" />
                <span class="setting-row__unit">题</span>
              </div>
              <div v-if="targetError" class="settings-error">{{ targetError }}</div>

              <div class="setting-row setting-row--readonly">
                <span class="setting-row__label">每组</span>
                <el-popover trigger="click" placement="bottom-start" :width="240"
                  content="每组出几题，由表现自动调整，不可手动改">
                  <template #reference><span class="hint-btn">?</span></template>
                </el-popover>
                <span class="setting-row__spacer"></span>
                <span class="setting-row__value setting-row__value--muted">4~10 题</span>
              </div>

              <!-- 档位配比：24 档太长，做成第二层折叠 + 限高内部滚动，收起设置区时整块不显示 -->
              <div class="setting-row setting-row--ratio">
                <span class="setting-row__label">档位配比</span>
                <span v-if="ratioCustomCount" class="ratio-tag">{{ ratioCustomCount }} 档已自定义</span>
                <el-popover trigger="click" placement="bottom-start" :width="260"
                  content="不配置 = 按原有权重出题；0 = 该档不出；大于 1 = 提高占比。只影响各档出现比例，不改难度判定">
                  <template #reference><span class="hint-btn">?</span></template>
                </el-popover>
                <span class="setting-row__spacer"></span>
                <el-button link type="primary" size="small" @click="ratioOpen = !ratioOpen">
                  {{ ratioOpen ? '收起' : '展开' }}
                </el-button>
              </div>

              <div v-if="ratioOpen" class="ratio-panel">
                <div class="ratio-panel__head">
                  <span class="ratio-panel__title">各档出现比例</span>
                  <span class="setting-row__spacer"></span>
                  <span class="ratio-panel__hint">0 = 不出 · &gt;1 = 提高占比</span>
                </div>
                <div class="ratio-panel__body">
                  <div v-for="group in groupedLevels" :key="group.grade" class="ratio-group">
                    <div class="ratio-group__title">{{ group.grade }}</div>
                    <div v-for="lv in group.levels" :key="lv.idx" class="ratio-line">
                      <span class="ratio-line__name">
                        <span class="ratio-line__idx">{{ lv.idx + 1 }}</span>{{ lv.label }}
                      </span>
                      <el-input :model-value="String(ratioOf(lv.idx))" size="small" class="ratio-line__input"
                        @change="(v) => setRatio(lv.idx, v)" />
                    </div>
                  </div>
                </div>
                <div class="ratio-panel__foot">
                  <span class="ratio-panel__hint">只影响各档出现比例，不改难度判定</span>
                  <el-button v-if="ratioCustomCount" link type="danger" size="small" @click="resetRatio">
                    恢复默认
                  </el-button>
                </div>
              </div>
            </div>
          </section>

          <div class="start-cta">
            <el-button type="primary" size="large" class="start-btn" @click="handleStartPractice">
              开始练习
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- 加载中：诊断题目生成中 -->
      <el-card class="practice-card practice-card--loading" shadow="never" v-else>
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在生成能力评估题目…</p>
        </div>
      </el-card>
    </el-main>
  </el-container>

  <!-- ── Floating stats button ── -->
  <el-tooltip content="练习统计" placement="left">
    <el-button
      class="stats-fab"
      :icon="TrendCharts"
      size="large"
      circle
      @click="dialogs.toggleStatsDrawer()"
    />
  </el-tooltip>

  <!-- ── 练习汇总弹窗（替代内联 HTML + ElMessageBox） ── -->
  <PracticeSummaryDialog
    v-model:visible="dialogs.summaryVisible.value"
    v-bind="dialogs.summaryProps.value"
    @select="dialogs.onSummarySelect"
  />

  <!-- ── 自我评价弹窗（替代 window.__evalSelect 桥） ── -->
  <SelfEvaluationDialog
    v-model:visible="dialogs.evalVisible.value"
    v-bind="dialogs.evalProps.value"
    @select="dialogs.onEvalSelect"
  />
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { TrendCharts, Bell, Mute } from '@element-plus/icons-vue'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import PracticeSummaryDialog from '@/components/dialog/PracticeSummaryDialog.vue'
import SelfEvaluationDialog from '@/components/dialog/SelfEvaluationDialog.vue'
import SyncIndicator from '@/components/stats/SyncIndicator.vue'
import { useAnswerBuilder } from '@/composables/useAnswerBuilder'
import { useSubmitHandler } from '@/composables/useSubmitHandler'
import { useAdaptiveSession } from '@/composables/useAdaptiveSession'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { useManualSession } from '@/composables/useManualSession'
import { isLastOfGroup, groupIndexOf, hasMultipleGroups, rangeOfGroup } from '@/utils/groupPlan'
import { explainError } from '@/utils/algorithm/explainError'
import { WrongAnswer } from '@/services'
import { useSnapshotSync } from '@/composables/useSnapshotSync'
import { decideListPracticesTransition } from '@/utils/listPracticesGuard'
import { useDisplayStrategy } from '@/composables/useDisplayStrategy'  // 🆕 PR-4.2 抽离 displayStats + applyDisplayModeForCurrentQuestion + generateOptions
import { FEEDBACK_DELAYS, ASSESSMENT_ABORT_WRONG_STREAK, getCommentByRate, ASSIST_LEVELS, MAX_ATTEMPT_PER_QUESTION } from '@/constants/practice'

import { playSfx, isSfxEnabled, setSfxEnabled, reloadSfxEnabled, tierForRate } from '@/utils/sound/sfx'
import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { storeToRefs } from 'pinia'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { saveLevelOverride, clearLevelOverride } from '@/utils/store/levelOverride'
import { saveChallengeEnabled } from '@/utils/store/challengeSetting'
import { saveAutoAdvance } from '@/utils/store/autoAdvance'
import { validateTargetRange } from '@/utils/form/formDefaults'
import { patchFormState } from '@/utils/store/formPersistence'
import {
  loadLevelCoefficients,
  saveLevelCoefficients,
  clearLevelCoefficients,
  COEF_MIN,
  COEF_MAX,
  COEF_DEFAULT,
} from '@/utils/store/levelCoefficients'

/** 档位总数（0 基下标上界 = 长度 - 1） */
const DIFFICULTY_LEVELS_LEN = DIFFICULTY_LEVELS.length

// ── 汇总弹窗 HTML 已抽到 utils/practiceSummary.js ──

const practiceStore = usePracticeStore()
const statsStore = useStatsStore()
const router = useRouter()
const {
  listPractices,
  totalQuestions,
  session,
  currentIndex,
  currentQuestion,
  isLastQuestion,
  correctCount,
  isAssessment,
  isPractice,
  isIdle,
  phase,
  assessmentCompleted,
  readyToStart
} = storeToRefs(practiceStore)

// ── 题目展示策略 composable (PR-4.2 抽离) ──
// 封装 displayStats ref + applyDisplayModeForCurrentQuestion + generateOptions + resetDisplayStats + updateStats
const {
  displayStats,
  applyDisplayModeForCurrentQuestion,
  generateOptions,
  resetDisplayStats,
  updateStats,
} = useDisplayStrategy(session, currentQuestion)

// ── 弹窗 composable（替代 ElMessageBox 和 window.__evalSelect 桥） ──
const dialogs = usePracticeDialogs()

// ── 持久化 composable（封装 3 处 PracticeSession.save 调用） ──
const saver = usePracticeSaver()

// ── 多设备同步（C 层）：恢复身份 + 已绑定则开启自动同步 ──
const snapshotSync = useSnapshotSync()

// ── 答题数据构造 composable（ARCH 合规：V 不直接 import U） ──
const { buildAnswerMeta, buildScore } = useAnswerBuilder()

// ── 答题提交处理 composable（ARCH 合规：V 层零业务规则） ──
const { processAnswer } = useSubmitHandler({ practiceStore, saver })

// ── 自适应会话 composable ──
// 响应式状态：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset / nextLocked
// 方法：startNewAdaptiveSession / completeAssessment (PR-4.3) / completeGroup (PR-4.4)
// ⚠️ 顺序很关键：useAdaptiveSession 内部要复用这里创建的 dialogs/saver 实例，
// 所以 dialogs/saver 必须先声明，再注入。如果反过来，会在 useAdaptiveSession 内部
// 重新调用 usePracticeDialogs() 创建独立 ref，弹窗状态与 V 层模板不互通 → 弹窗不显示。
// （TDZ bug：v2.3 a6d96b5 改注入时漏调顺序）
const {
  adaptiveEngine,
  adaptiveGroupIndex,
  groupAnswerOffset,
  groupCorrectCount,
  nextLocked,
  stageName,                  // P2.2: 替代 V 层 currentStage computed
  startNewAdaptiveSession,
  startNewDiagnosticSession,  // P2.3: 替代 V 层 generateDiagnosticQuestions + startAssessment 直调
  completeAssessment,
  completeGroup,
  afterAnswer,                // P5: 答完一题动态微调
} = useAdaptiveSession({ dialogs, saver })

/** 自适应引擎状态（注：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset
 *  / groupCorrectCount / nextLocked 等已抽到 useAdaptiveSession） */

// currentStage 已抽到 useAdaptiveSession.stageName (P2.2)，模板继续用 currentStage 引用保持兼容
const currentStage = stageName

const layoutComponents = {
  horizontal: HorizontalLayout,
  vertical: VerticalLayout
}

const inputComponents = {
  keypad: NumberKeypad,
  options: OptionButtons
}

const currentLayout = computed(() => layoutComponents[session.value.displayMode.layout])
const currentInput = computed(() => inputComponents[session.value.displayMode.input])

// P2-2: 按 phase 选 answers/diagnosticAnswers（ProgressSteps 展示用）
// practice 阶段只展示当前组（按 groupAnswerOffset 切片）
const currentAnswers = computed(() =>
  isAssessment.value ? session.value.diagnosticAnswers : session.value.answers.slice(groupAnswerOffset.value)
)

/**
 * 进度展示：多组自定义练习按「本组」算，与自适应一致
 * （自适应每组的 listPractices 就是本组题，总题数天然是组大小）
 */
const progressRange = computed(() => {
  if (!isMultiGroupManual.value) return null
  return rangeOfGroup(manualGroupRanges.value, practiceStore.session.currentIndex)
})

const progressTotal = computed(() => {
  const r = progressRange.value
  return r ? r.end - r.start : totalQuestions.value
})

const progressCurrent = computed(() => {
  const r = progressRange.value
  return r ? practiceStore.session.currentIndex - r.start + 1 : currentIndex.value + 1
})

/** 进度点/步骤只统计本组答案，避免第 2 组还显示第 1 组的对错 */
const progressAnswers = computed(() => {
  const r = progressRange.value
  const all = currentAnswers.value
  if (!r) return all
  return all.slice(r.start - groupAnswerOffset.value)
})

const inputProps = computed(() => {
  if (!currentQuestion.value) return { disabled: true }

  const baseProps = {
    disabled: session.value.feedbackType !== null,
    showResult: session.value.feedbackType !== null
  }

  if (session.value.displayMode.input === 'keypad') {
    return {
      ...baseProps,
      currentValue: session.value.currentAnswer
    }
  }

  return {
    ...baseProps,
    options: session.value.currentOptions,
    focusIndex: optionFocusIdx.value,
    correctAnswer: currentQuestion.value.solution,
    selectedOption: session.value.selectedOption
  }
})

/**
 * 每题重置：重置输入/反馈状态 + 计时器 + displayMode
 * 注意：不清空 session.answers（只在组边界才清空，见 resetGroupAnswers）
 * 这样 handleNext 每题调此处时，当前组答案不丢失，
 * completeGroup 中 allAnswers = [...session.answers] 能拿到完整组数据。
 */
const initPractice = () => {
  if (!currentQuestion.value) return

  // 重置输入/反馈状态（feedbackType→null、currentAnswer→''、selectedOption→null）
  practiceStore.resetQuestionInputState()
  // 注意：不要在这里重置 session.sessionStartTime。
  // 它表示「整轮开始时间」，由 startNewAdaptiveSession 设置一次，汇总弹窗用它算总用时；
  // 每题重置会让「用时」退化成最后一题的答题时长。
  // 单题计时走 practiceStore.startQuestionTimer()（session.startTime）。

  // 重置 displayStats (PR-4.2 抽到 composable)
  resetDisplayStats()

  // 从 currentQuestion.inputMode 查 ASSIST_LEVELS 表决定 layout/input
  applyDisplayModeForCurrentQuestion()

  // Start the first question timer
  practiceStore.startQuestionTimer()
}

/**
 * 组边界重置：清空当前组 session.answers（之前组答题不应留在本组）
 * 整轮所有组的累计存到 adaptiveAnswers（弹窗用）
 * 只在新组开始时调用，不在每题切换时调。
 */
const resetGroupAnswers = () => {
  practiceStore.session.answers = []
}

/** 竖式逐位输入：委托给 DigitInput */
const digitFocusIdx = ref(-1)
const layoutRef = ref(null)
/** 防退格后 @input 重复处理 */
let bsLock = false

/** 是否启用 DigitInput 逐位输入（keypad 模式统一处理，不区分横/竖式） */
const isKeypad = () => session.value.displayMode.input === 'keypad'

const handleInput = (value) => {
  if (!isKeypad()) {
    session.value.currentAnswer = value
    return
  }
  if (bsLock) { bsLock = false; return }   // 退格触发的 input，跳过
  const digit = String(value || '').replace(/_/g, '').slice(-1)
  if (digit && layoutRef.value?.acceptDigit) {
    session.value.currentAnswer = layoutRef.value.acceptDigit(digit)
  }
  // P5: keypad 模式输完正确答案后自动提交，无需再点"确认"
  if (currentQuestion.value) {
    const numVal = Number(session.value.currentAnswer)
    if (!isNaN(numVal) && numVal === currentQuestion.value.solution) {
      handleSubmit()  // 不传参，让 useSubmitHandler 从 session.currentAnswer 读
    }
  }
}

/**
 * 退格。
 * @param {boolean} [fromKeypad=false] 是否来自屏幕键盘的「退格」按钮。
 *   那个按钮会连着 emit('backspace') 和 emit('input', 截断后的值) 两次事件，
 *   需要用 bsLock 吞掉紧随其后的 input；而物理键盘（Backspace 键）只走这一个入口，
 *   没有后续 input —— 如果也置锁，锁就会残留到下一次真实按键，
 *   表现为「退格后要按两次才输入」。
 */
const handleBackspace = (fromKeypad = false) => {
  if (!isKeypad()) {
    session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
    return
  }
  bsLock = fromKeypad
  if (layoutRef.value?.acceptBackspace) {
    session.value.currentAnswer = layoutRef.value.acceptBackspace()
  }
}

const handleSelect = (option) => {
  session.value.selectedOption = option
  handleSubmit(option)
}

const handleSubmit = (answer) => {
  const result = processAnswer({
    answer,
    currentQuestion: currentQuestion.value,
    groupAnswerOffset: groupAnswerOffset.value,
    currentIndex: currentIndex.value,
    session: session.value,
    endQuestionTimer: practiceStore.endQuestionTimer.bind(practiceStore),
  })

  if (result.feedbackType === 'invalid') {
    ElMessage.warning('请输入答案')
    return
  }

  if (result.isCorrect) {
    // 连对越多，音效越高（不给文字也能听出「连击」）
    playSfx('correct', { streak: session.value.streak })
    session.value.feedbackType = 'correct'
    wrongReason.value = null
    updateStats(true)
    ElMessage.success({
      message: '✓ 正确！',
      duration: FEEDBACK_DELAYS.correct,
      offset: 100,
      customClass: 'feedback-message',
    })
    setTimeout(() => handleNext(), FEEDBACK_DELAYS.correct)
    return
  }

  // ── 答错 ──
  playSfx('wrong', { attempt: result.attemptCount })
  session.value.feedbackType = 'wrong'
  // 错因：用错误模型推出「这一步是怎么错的」，比只报正确答案更有教学价值
  const reason = explainError({
    equation: currentQuestion.value.equation,
    solution: currentQuestion.value.solution,
    userAnswer: result.userAnswer ?? session.value.currentAnswer,
    operator: currentQuestion.value.operator,
  })
  // toast 一闪而过 → 同时记进常驻条（wrongReasonText 会渲染在题目下方）
  wrongReason.value = (reason.code !== 'unknown' || reason.hint) ? reason : null
  void loadWrongHistory()      // 刚错过的题立刻进入「复习」高亮
  const reasonText = reason.label
    ? `${reason.label}${reason.hint ? '（' + reason.hint + '）' : ''} · `
    : (reason.hint ? `${reason.hint} · ` : '')
  ElMessage.error({
    message: `✗ ${reasonText}正确答案是 ${currentQuestion.value.solution}`,
    duration: FEEDBACK_DELAYS.wrong,
    offset: 100,
    customClass: 'feedback-message',
  })
  updateStats(false)

  // 评估模式下连续错 N 次 → 提前结束评估
  const shouldAbortAssessment = isAssessment.value && displayStats.value.consecutiveWrong >= ASSESSMENT_ABORT_WRONG_STREAK

  // 错题重试上限
  if (result.attemptCount >= MAX_ATTEMPT_PER_QUESTION + 1) {
    // 跳题提示音：比「答错」更温和，且错开答错音（wrong 约 160ms）
    setTimeout(() => playSfx('skip'), 200)
    ElMessage.warning({
      message: `本题已重试 ${MAX_ATTEMPT_PER_QUESTION} 次, 跳过`,
      duration: FEEDBACK_DELAYS.wrong,
      offset: 100,
      customClass: 'feedback-message',
    })
    setTimeout(() => {
      session.value.feedbackType = null
      session.value.currentAnswer = ''
      handleNext()
    }, FEEDBACK_DELAYS.wrong)
    return
  }

  if (shouldAbortAssessment) {
    setTimeout(() => {
      session.value.feedbackType = null
      session.value.currentAnswer = ''
      completeAssessment()
    }, FEEDBACK_DELAYS.assessmentAbort)
    return
  }

  if (session.value.displayMode.input === 'keypad') {
    setTimeout(() => {
      session.value.feedbackType = null
      session.value.currentAnswer = ''
    }, FEEDBACK_DELAYS.wrong)
  } else {
    setTimeout(() => {
      session.value.feedbackType = null
      session.value.currentAnswer = ''
    }, FEEDBACK_DELAYS.wrong)
  }
}

/** 选择题的键盘焦点项下标（← → 移动） */
const optionFocusIdx = ref(0)

/**
 * 答错原因（答错时算一次，常驻显示到下一题）
 * @type {import('vue').Ref<{code:string,label:string,hint:string}|null>}
 */
const wrongReason = ref(null)
const wrongReasonText = computed(() => {
  const r = wrongReason.value
  if (!r) return ''
  return [r.label, r.hint].filter(Boolean).join(' · ')
})

/**
 * 当前题是否属于「错题复习」（历史上错过）
 * 用一张按算式缓存的错题表判断，避免每题都查库。
 */
const wrongHistory = ref({})          // { equation: { wrongCount } }
const isReviewQuestion = computed(() => {
  const eq = currentQuestion.value?.equation
  return !!(eq && wrongHistory.value[eq])
})
const reviewWrongCount = computed(() => {
  const eq = currentQuestion.value?.equation
  return eq ? (wrongHistory.value[eq]?.wrongCount || 0) : 0
})

/** 载入错题历史（进入练习时刷一次；错一题后再刷） */
async function loadWrongHistory() {
  try {
    const rows = await WrongAnswer.getWrongAnswers({ days: 365, limit: 400 })
    const map = {}
    for (const row of WrongAnswer.dedup(rows)) {
      const eq = row.equation
      if (!eq) continue
      map[eq] = { wrongCount: row.wrongCount || 1 }
    }
    wrongHistory.value = map
  } catch { /* 读不到就当没有错题历史 */ }
}

/** 音效开关（存在 localStorage，默认开） */
const sfxOn = ref(isSfxEnabled())

function toggleSfx() {
  setSfxEnabled(!sfxOn.value)
  sfxOn.value = isSfxEnabled()
  if (sfxOn.value) playSfx('tap')   // 开启时给一声反馈
}

// 每换一题把焦点回到第一项
watch(currentQuestion, () => { optionFocusIdx.value = 0 })

/** 进入下一题；当前是最后一题时按阶段收尾 */
const handleNext = () => {
  if (nextLocked.value) return
  nextLocked.value = true

  // 多组自定义练习：本组最后一题也要走收尾（组反馈 → 自评），而不是直接跳下一题
  const atGroupEnd = isLastOfManualGroup.value

  if (!isLastQuestion.value && !atGroupEnd) {
    practiceStore.nextQuestion()
    // 关键修复：调 initPractice（之前仅在 watch 路径调，handleNext 直接跳题时漏调）
    //  initPractice 重置 session.answers（每组只含本组）、currentIndex=0、displayStats
    initPractice()
    if (!currentQuestion.value) {
      nextLocked.value = false
      return
    }
    // P5: 动态微调（C 层中转，架构合规）
    afterAnswer()
    digitFocusIdx.value = -1  // 重置点击焦点
    nextLocked.value = false
  } else {
    // ── Session complete — handle based on phase ──
    let fn
    if (isAssessment.value) {
      fn = completeAssessment
    } else if (adaptiveEngine.value && practiceStore.listSource !== 'manual') {
      // 只有自适应题单才走「组完成 → 评估 → 生成下一组」。
      // 手动出题的题单做完就是结束，不能被自适应引擎接管。
      fn = completeGroup
    } else if (isMultiGroupManual.value) {
      // 自定义练习分了多组：每一组结束都先走「组反馈 + 自评」，
      // 最后一组自评完再出整轮总结（与自适应一致：末组也有自评）。
      // 走到这里时一定刚好是本组最后一道题。
      fn = async () => {
        const result = await completeManualGroup()
        if (result === 'continue') return result
        return handlePracticeComplete()
      }
    } else {
      fn = handlePracticeComplete
    }
    // reset nextLocked after the handler runs
    const result = fn()
    // If fn is async, give it a tick to unlock
    if (result instanceof Promise) {
      result.finally(() => { nextLocked.value = false })
    } else {
      nextLocked.value = false
    }
  }
}

/** 生成一组题目已抽到 utils/adaptiveBatch.js 的 generateAdaptiveBatch */

/** handleAssessmentComplete 已抽到 useAdaptiveSession.completeAssessment (PR-4.3) */

/** completeAdaptiveGroup 已抽到 useAdaptiveSession.completeGroup (PR-4.4) */

/** 开始新一轮自适应练习（已抽到 composables/useAdaptiveSession.js） */

/** 正常练习完成 → 保存到 DB，弹出汇总弹窗，关闭后跳首页 */
/** 自定义练习分组：组边界 → 自评 → 下一组（一张卷子 = 一组） */
const {
  manualGroupRanges,
  manualGroupIndex,
  setGroupPlan,
  resetGroupPlan,
  completeManualGroup,
} = useManualSession({ dialogs, saver })   // 必须传入同一实例，否则弹窗状态与模板不互通

/** Generate 侧写好分组计划 → 这里换算成题号区间 */
watch(
  () => practiceStore.manualGroupPlan,
  (plan) => {
    if (Array.isArray(plan) && plan.length > 1) setGroupPlan(plan)
    else resetGroupPlan()
  },
  { immediate: true, deep: true }
)

/** 是否处于「多组自定义练习」中（决定收尾走组边界还是整轮） */
const isMultiGroupManual = computed(
  () => practiceStore.listSource === 'manual' && hasMultipleGroups(manualGroupRanges.value)
)

/** 当前处在第几组（1 基）；不是多组时返回 0 */
const currentGroupNo = computed(() => {
  if (!isMultiGroupManual.value) return 0
  return groupIndexOf(manualGroupRanges.value, practiceStore.session.currentIndex) || 1
})

/** 多组时显示「第 2/3 组」 */
const groupBadgeText = computed(() => {
  if (!isMultiGroupManual.value) return ''
  return `第 ${currentGroupNo.value} 组，共 ${manualGroupRanges.value.length} 组`
})

/** 本次答题是否本组最后一题（多组自定义练习才成立） */
const isLastOfManualGroup = computed(() => {
  if (!isMultiGroupManual.value) return false
  return isLastOfGroup(manualGroupRanges.value, practiceStore.session.currentIndex)
})

const handlePracticeComplete = async () => {
  const totalAns = totalQuestions.value
  const correctAns = correctCount.value
  const rate = Math.round((correctAns / totalAns) * 100)

  // 非自适应练习完成时，传 finalProfileSnapshot（从 adaptiveEngine 或当前 profile 获取）
  // 注意：adaptiveEngine.profile 可能是 DB 原始行（没有 snapshot()），
  // 直接调用会抛 TypeError 并中断整个收尾流程（不弹汇总、不跳首页）。
  let finalProfile = null
  const engProfile = adaptiveEngine?.value?.profile
  if (typeof engProfile?.snapshot === 'function') {
    finalProfile = engProfile.snapshot()
  } else if (engProfile) {
    finalProfile = engProfile
  }
  await saver.saveSessionFinal({ finalProfileSnapshot: finalProfile })

  playSfx('complete', { tier: tierForRate(rate) })
  // 评语（抽到 constants/practice.getCommentByRate）
  const { emoji, comment, color: rateColor } = getCommentByRate(rate)
  let action = 'close'
  try {
    action = await dialogs.showPracticeSummaryDialog({
      emoji,
      comment,
      totalAnswers: totalAns,
      correctAnswers: correctAns,
      rate,
      rateColor,
      confirmText: '📊 分析',
      cancelText: '🏠 首页',
    })
  } catch { /* 弹窗异常 → action 保持 'close' */ }

  // 关闭弹窗后清空题目，watch 会根据 phase/abilityProfile 自动恢复或跳走
  // （注意：不清空会导致 lastQuestion 重复显示"已完成"状态，所以清空）
  practiceStore.setListPractices([])
  router.push('/home')
  if (action === 'confirm') {
    setTimeout(() => statsStore.openDrawer(), 300)
  }
}

watch(listPractices, (newPracticeList) => {
  // P2-3 抽函数: 决策逻辑委托给纯函数 decideListPracticesTransition（可测）
  const decision = decideListPracticesTransition({
    newList: newPracticeList,
    savedAnswers: session.value.answers,
    isAdaptiveTransition: !!adaptiveEngine.value && adaptiveGroupIndex.value > 1,
    hasAdaptiveEngine: !!adaptiveEngine.value,
    hasProfile: assessmentCompleted.value,
    phase: phase.value,
  })

  if (decision.type === 'GROUP_START') {
    const { savedAnswers, offset, shouldRestoreAnswers } = decision.action
    // 每组开始时清空上一组答案（之前组答题已通过 adaptiveAnswers 累积）
    resetGroupAnswers()
    // 关键：groupAnswerOffset 必须指向本组开始位置
    // - 组间切换（adaptive 第 2+ 组）：保留之前组的所有答案，offset = saved 长度
    // - 第一组（从诊断/普通练习切到自适应）：offset = 当前 answers 长度（含诊断 5 道）
    groupAnswerOffset.value = offset
    practiceStore.resetCurrentIndex()
    digitFocusIdx.value = -1  // 新题重置焦点
    initPractice()
    if (shouldRestoreAnswers) {
      session.value.answers = savedAnswers
    }
    return
  }

  // 防御性修复：listPractices 变空时（用户完成全部练习关闭弹窗后）
  // 卡 loading 的两个常见场景：
  //  1) 自适应完成（completeGroup）→ 弹窗关闭 → setListPractices([])
  //     abilityProfile 存在 → 启动新一轮自适应
  //  2) 普通练习完成（handlePracticeComplete）→ 弹窗关闭 → setListPractices([])
  //     abilityProfile=null，但 phase=practice（Generate.vue 调用 setAbilityProfile(null)）
  //     没有 profile 也不能用 startNewAdaptiveSession → 重新进入 idle + 触发诊断
  // 这样无论用户从哪种模式完成练习，都不会卡在 loading 状态
  if (decision.type === 'COMPLETION') {
    // 手动题单做完就结束：不自动开始自适应（handlePracticeComplete 已跳首页）
    if (practiceStore.listSource === 'manual') {
      practiceStore.setListSource('adaptive')
      practiceStore.setReadyToStart(false)
      return
    }
    if (decision.action.kind === 'START_ADAPTIVE') {
      // 完成后也回到准备界面，而不是立刻出一组新题
      practiceStore.setReadyToStart(true)
      loadStartInfo()
    } else if (decision.action.kind === 'RESTART_DIAGNOSTIC') {
      practiceStore.setPhase('idle')
      startNewDiagnosticSession()
    }
  }
})

// P6: currentQuestion 变化时（正常跳题 OR adjustNextQuestion 异步替换题目）
// 同步 displayMode，防止 currentOptions 与题目不匹配
watch(currentQuestion, (q) => {
  if (q) applyDisplayModeForCurrentQuestion()
})

// ─────────────────────────────────────────────────────────────
// 调试接口（window.__psm_debug）
// ─────────────────────────────────────────────────────────────
//
// ## 用途
// 给自动化 agent / e2e 测试 / 调试脚本一个稳定的入口，
// 直接调函数过题 / 触发组完成 / 查状态，
// 避免依赖 DOM 模拟点击（脆弱、易碎、对 UI 改动敏感）。
//
// ## 在浏览器中调用
// 打开 DevTools Console 或 Playwright `page.evaluate(() => ...)` 即可。
// 最常用的 4 个调用：
//   // 1) 答当前题（默认答对 = 用 solution 答）
//   window.__psm_debug.answer()
//   // 2) 故意答错当前题（用 solution+1 答）
//   window.__psm_debug.answer(false)
//   // 3) 连续答 5 题（全对），串行等待每题反馈动画结束
//   await window.__psm_debug.answerN(5)
//   // 4) 连续答 5 对 + 5 错（交替），用于生成混合数据
//   for (let i = 0; i < 5; i++) {
//     await window.__psm_debug.answer(true)
//     await window.__psm_debug.answer(false)
//   }
// （之前的 completeGroup / completeAssessment 已删除：直接调会污染
//  能力画像 / 自适应引擎历史，agent 测试应走"先 answerN 再等弹窗"流程）
//
// ## API 完整列表
//
// ### answer(isCorrect = true) → 同步
// 答当前题。同步修改 `session.currentAnswer` 后调用本组件内的 `handleSubmit(ans)`。
// @param {boolean} [isCorrect=true] - true 用 solution 答（对）；false 用 solution+1（故意错）
// @returns {{ ok: boolean, equation?: string, answer?: number, isCorrect?: boolean, reason?: string }}
//   - 成功: `{ ok: true, equation, answer, isCorrect }`
//   - 失败: `{ ok: false, reason: 'no current question' }`（无 currentQuestion 时）
// @side-effects
//   - 写入 `session.answers`（按 `questionIndex` 去重，重试时替换旧记录）
//   - 触发 `ElMessage` 提示（成功 ✓ / 失败 ✗）
//   - 答对：`FEEDBACK_DELAYS.correct` (800ms) 后自动 `handleNext`
//   - 答错：`FEEDBACK_DELAYS.wrong` (1500ms) 后清空输入；
//           若 `attemptCount >= MAX_ATTEMPT_PER_QUESTION + 1` (4) 则强制跳下一题
// @boundary `currentQuestion` 为 null 时（无题 / 答完 / 评估被中断）立即返回失败
//
// ### answerN(n, isCorrect = true) → 异步
// 连续答 N 题。内部循环 `answer()` + `setTimeout` 等待反馈动画。
// @param {number} n - 要答几题
// @param {boolean} [isCorrect=true] - 是否全对
// @returns {Promise<{ ok: boolean, done: number }>}
//   - `done` 是实际答完的题数（若 `currentQuestion` 提前变 null 会提前结束）
// @side-effects 同 `answer()`，但串行 N 次
// @timing 每次答题后等 `FEEDBACK_DELAYS.correct + 200ms`（1000ms），确保下一题已切换
// @boundary
//   - 不要并行调用多个 `answerN`（共享全局 `currentQuestion` 会冲突）
//   - 不要在 `answerN` 未完成时调用 `state()`，可能拿到中间态
//
// ### state() → 同步，纯查询
// 查询当前状态，无副作用。
// @returns {{
//   phase: 'idle'|'assessment'|'practice',   // 当前阶段
//   isAssessment: boolean,                    // 是否评估阶段（等价于 phase === 'assessment'）
//   groupIdx: number,                         // 当前自适应组序号（0 = 第 1 组；评估阶段固定 0）
//   answersCount: number,                     // session.answers 长度（按 questionIndex 去重）
//   correctCount: number,                     // session.answers 分数求和（不是"答对题数"，是 score 累计）
//   totalQuestions: number,                   // listPractices 总题数
//   hasProfile: boolean                       // 是否有能力画像（评估完成才有，诊断阶段为 false）
// }}
// @usage 配合上面所有 API 做断言（"答完 5 题后 phase 应该 === 'assessment' 结束"）
//
// ## 典型测试场景
//
// 场景 1: 走完整个评估（5 道诊断题全对 → 自动进自适应第 1 组）
//   await window.__psm_debug.answerN(5, true)
//   // 评估完成 → 弹 AssessmentSummaryDialog → 关弹窗 → 自动进自适应第 1 组
//
// 场景 2: 测答错 3 次强制跳（MAX_ATTEMPT_PER_QUESTION=3，attemptCount=4 强制跳）
//   await window.__psm_debug.answer(false)  // 第 1 次答错：留题，提示 ✗
//   await window.__psm_debug.answer(false)  // 第 2 次答错：留题，提示"已重试 1 次"
//   await window.__psm_debug.answer(false)  // 第 3 次答错：留题，提示"已重试 2 次"
//   await window.__psm_debug.answer(false)  // 第 4 次答错：attemptCount=4 → 强制跳下一题
//
// 场景 3: 测评估阶段连续错 2 次提前结束（ASSESSMENT_ABORT_WRONG_STREAK=2）
//   await window.__psm_debug.answer(false)
//   await window.__psm_debug.answer(false)  // 内部触发 completeAssessment（弹评估结束弹窗，agent 不需调 API）
//
// 场景 4: 测 StatsDrawer 3 section（先用 answerN 答题生成数据）
//   await window.__psm_debug.answerN(20, true)
//   // 然后通过 Vue Devtools / 直接 import statsStore 调 openDrawer()
//   // StatsDrawer 内部从 store 读数据，__psm_debug 暂不暴露 statsStore
//
// ## 注意事项
// - 接口仅在浏览器环境挂载（`typeof window !== 'undefined'`）
//   → SSR / Node 测试环境下访问会 ReferenceError
// - **不影响 production 行为**：仅暴露 state 查询 + 受控的答题函数，不暴露 store mutation
// - `answer()` 是同步调，但答题后的 setTimeout/动画是异步的
//   → `answer()` 返回 ≠ 下一题就绪，要等 800ms~1500ms
// - `answerN` 内部用 setTimeout 串行等待 `FEEDBACK_DELAYS.correct + 200ms` (1000ms)
//   → 不要并行调用多个 `answerN`（共享 `currentQuestion` 会乱）
// - 答错时 `isCorrect=false` 会走 `attemptCount` 累加重试逻辑
//   → 连答 4 次错才会强制跳题（见 `handleSubmit` 的 `attemptCount >= MAX_ATTEMPT_PER_QUESTION + 1`）
// - 测错路径前先 `await window.__psm_debug.state()` 看 `phase`、`groupIdx` 等
//
// ## 相关常量（来自 src/constants/practice.js）
// - FEEDBACK_DELAYS.correct = 800ms         (答对后自动跳下一题的等待)
// - FEEDBACK_DELAYS.wrong = 1500ms          (答错后清空输入的等待)
// - FEEDBACK_DELAYS.assessmentAbort = 1500ms (评估提前结束的等待)
// - MAX_ATTEMPT_PER_QUESTION = 3            (单题最多重试 3 次，attemptCount=4 强制跳)
// - ASSESSMENT_ABORT_WRONG_STREAK = 2       (评估阶段连续错 2 次提前结束)
// - MIN_GROUPS_PER_DIMENSION = 6            (同维度至少练 6 组才考虑变动)
// - CONSECUTIVE_GOOD_TO_ADVANCE = 3         (连续答好多组才升阶)
// - ACCURACY_THRESHOLDS = { good: 0.80, bad: 0.50 }
// - SPEED_THRESHOLDS = [5000/7000/10000/14000/Infinity] ms (单题平均用时分档)
//
// ## 相关 composable / store
// - handleSubmit            → 本组件内（L294），包装 session.answers 写入 + ElMessage + setTimeout
// - useAdaptiveSession      → 提供 completeGroup / completeAssessment / startNewAdaptiveSession
// - usePracticeDialogs      → 提供 showSelfEvaluationDialog / showAssessmentSummaryDialog / showPracticeSummaryDialog
// - usePracticeSaver        → 提供 saveAssessmentFinal / savePerQuestion / savePracticeFinal
// - useDisplayStrategy      → 提供 applyDisplayModeForCurrentQuestion / generateOptions
// - stores/practice.js      → 内部状态（phase / abilityProfile / session / listPractices / adaptiveAnswers）
// - stores/stats.js         → StatsDrawer 数据源（暂未通过 __psm_debug 暴露）
// ─────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.__psm_debug = {
    /**
     * 答当前题。isCorrect=true 答 solution，false 答 solution+1（故意答错）
     * @param {boolean} [isCorrect=true] - true 答对，false 故意答错
     * @returns {{ok: boolean, equation?: string, answer?: number, isCorrect?: boolean, reason?: string}}
     */
    answer: (isCorrect = true) => {
      const q = currentQuestion.value
      if (!q) return { ok: false, reason: 'no current question' }
      const sol = q.solution
      const ans = isCorrect ? sol : sol + 1
      // 同步 session.currentAnswer，让 V 层模板（keypad / options）能看到答案
      session.value.currentAnswer = String(ans)
      handleSubmit(ans)
      return { ok: true, equation: q.equation, answer: ans, isCorrect }
    },

    /**
     * 连续答 N 题。默认全对。会自动等待 FEEDBACK_DELAYS.correct + 200ms 缓冲
     * @param {number} n - 要答几题
     * @param {boolean} [isCorrect=true] - 是否全对
     * @returns {Promise<{ok: boolean, done: number}>}
     */
    answerN: async (n, isCorrect = true) => {
      let done = 0
      while (done < n && currentQuestion.value) {
        window.__psm_debug.answer(isCorrect)
        done++
        // 等待反馈动画（正确 0.8s + 缓冲 200ms，确保下一题已经切换）
        await new Promise(r => setTimeout(r, FEEDBACK_DELAYS.correct + 200))
      }
      return { ok: true, done }
    },

    /**
     * 查询当前状态（agent 自动化测试友好）
     * @returns {{
     *   phase: string,
     *   isAssessment: boolean,
     *   groupIdx: number,
     *   answersCount: number,
     *   correctCount: number,
     *   totalQuestions: number,
     *   hasProfile: boolean,
     *   // P2-4: engine 扁平字段（避免 agent 写 ?.value?.profile?. 链式）
     *   engineReady: boolean,
     *   engineDifficultyIdx: number|null,
     *   engineStrongCount: number,
     *   engineWeakCount: number
     * }}
     */
    state: () => ({
      phase: phase.value,
      isAssessment: isAssessment.value,
      groupIdx: adaptiveGroupIndex.value,
      answersCount: session.value.answers.length,
      correctCount: correctCount.value,
      totalQuestions: totalQuestions.value,
      hasProfile: assessmentCompleted.value,
      // P2-4: 自适应引擎就绪 + 关键画像数据扁平化
      engineReady: !!adaptiveEngine.value,
      engineDifficultyIdx: adaptiveEngine.value?.profile?.difficultyIdx ?? null,
      engineStrongCount: adaptiveEngine.value?.strongLevelIndices?.length ?? 0,
      engineWeakCount: adaptiveEngine.value?.weakLevelIndices?.length ?? 0,
    }),

    /**
     * 访问自适应引擎（ref），可用 .value 读最新值
     * - 引擎 profile 强/弱项/难度
     * - 引擎方法（如 getGroupSize()、evaluateGroup()）
     * 例: __psm_debug.engine.value?.profile
     * @returns {Ref<Engine|null>}
     */
    engine: adaptiveEngine,
  }
}

/** 页面载入自动触发能力诊断或恢复自适应 */
// ─────────────────────────────────────────────────────────────
// 开始练习界面（有画像进入时不立刻出题，先给学生看这轮练什么）
// ─────────────────────────────────────────────────────────────
const startInfo = ref({
  levelIdx: 0,           // 1 基，用于展示 Lv.N
  levelRaw: 0,           // 0 基，用于升降档计算
  levelLabel: '', grade: '',
  lastAccuracy: null, lastAnswered: 0, streak: 0,
  targetMin: 10, targetMax: 30, challengeEnabled: false, autoAdvance: false, focus: []
})

/** 设置区展开状态（默认折叠，不持久化） */
const settingsOpen = ref(false)
/** 「更多档位控制」面板 */
const moreOpen = ref(false)
/** 练习量草稿（改完即时保存） */
const targetDraft = ref({ min: 10, max: 30 })
const targetError = ref('')
/** 起点档位下拉草稿（点了「应用」才写） */
const levelDraft = ref(null)
const levelOverrideActive = ref(false)

/** 档位配比：第二层折叠 + 系数表（只落非默认值） */
const ratioOpen = ref(false)
const ratioMap = ref({})
const ratioCustomCount = computed(() => Object.keys(ratioMap.value).length)

/** 取某档系数（未配置显示默认 1.0） */
function ratioOf(idx) {
  const v = ratioMap.value[idx]
  return typeof v === 'number' ? v.toFixed(1) : '1.0'
}

/** 改某档系数：非法 → 回退默认；等于默认 → 从表里删掉（保持表精简） */
function setRatio(idx, raw) {
  const num = Number(raw)
  const next = { ...ratioMap.value }
  if (!Number.isFinite(num)) {
    delete next[idx]
  } else {
    const clamped = Math.min(COEF_MAX, Math.max(COEF_MIN, num))
    if (clamped === COEF_DEFAULT) delete next[idx]
    else next[idx] = Math.round(clamped * 10) / 10
  }
  ratioMap.value = next
  saveLevelCoefficients(next)
  practiceStore.bumpLevelOverride()
  playSfx('tap')
}

/** 恢复全部默认 */
function resetRatio() {
  clearLevelCoefficients()
  ratioMap.value = {}
  practiceStore.bumpLevelOverride()
  ElMessage.info('档位配比已恢复默认')
}

/** 档位升降的边界与禁用态 */
const maxLevelIdx = DIFFICULTY_LEVELS_LEN - 1
const levelDownDisabled = computed(() => startInfo.value.autoAdvance || startInfo.value.levelRaw <= 0)
const levelUpDisabled = computed(() => startInfo.value.autoAdvance || startInfo.value.levelRaw >= maxLevelIdx)
const levelDownTitle = computed(() => {
  if (startInfo.value.autoAdvance) return '自动升档已开启，档位会按表现自动变化'
  if (startInfo.value.levelRaw <= 0) return '已是最低档'
  return `降到 Lv.${startInfo.value.levelIdx - 1} ${DIFFICULTY_LEVELS[startInfo.value.levelRaw - 1]?.label || ''}`
})
const levelUpTitle = computed(() => {
  if (startInfo.value.autoAdvance) return '自动升档已开启，档位会按表现自动变化'
  if (startInfo.value.levelRaw >= maxLevelIdx) return '已是最后一档'
  return `升到 Lv.${startInfo.value.levelIdx + 1} ${DIFFICULTY_LEVELS[startInfo.value.levelRaw + 1]?.label || ''}`
})

/** 档位下拉的分组（按年级） */
const groupedLevels = computed(() => {
  const groups = []
  for (let idx = 0; idx < DIFFICULTY_LEVELS_LEN; idx++) {
    const lv = DIFFICULTY_LEVELS[idx]
    const grade = lv.grade || '未分组'
    let g = groups.find(x => x.grade === grade)
    if (!g) { g = { grade, levels: [] }; groups.push(g) }
    g.levels.push({ idx, label: lv.label })
  }
  return groups
})

/**
 * 降/升一档：写「起点档位」覆盖 + 刷新
 * @param {number} delta -1 降 / +1 升
 */
function shiftLevel(delta) {
  const from = startInfo.value.levelRaw
  const target = Math.min(maxLevelIdx, Math.max(0, from + delta))
  if (target === from) return
  const saved = saveLevelOverride(target)
  if (!saved) return
  levelOverrideActive.value = true
  levelDraft.value = target
  practiceStore.bumpLevelOverride()
  refreshStartInfo()
  playSfx(delta > 0 ? 'levelup' : 'tap')
}

/** 挑战题开关 */
function setChallengeEnabled(value) {
  saveChallengeEnabled(!!value)
  refreshStartInfo()
}

/** 自动升档开关 */
function setAutoAdvance(value) {
  saveAutoAdvance(!!value)
  refreshStartInfo()
}

/** 练习量：校验通过才写（store 实时 + 表单合并写，刷新后保留） */
function saveAdaptiveAmount() {
  const { min, max } = targetDraft.value
  const result = validateTargetRange(min, max)
  if (!result.valid) {
    targetError.value = result.message
    return
  }
  targetError.value = ''
  practiceStore.setAdaptiveTarget(min, max)
  patchFormState({ targetMin: min, targetMax: max })
  refreshStartInfo()
}

/** 应用手动指定的起点档位 */
function applyLevelOverride() {
  if (levelDraft.value == null) return
  const saved = saveLevelOverride(levelDraft.value)
  if (!saved) return
  levelOverrideActive.value = true
  practiceStore.bumpLevelOverride()
  refreshStartInfo()
  ElMessage.success(`起点档位已设为 Lv.${saved.levelIdx + 1} ${DIFFICULTY_LEVELS[saved.levelIdx].label}，下次开始练习生效`)
}

/** 恢复自动（清除起点档位覆盖） */
function resetLevelOverride() {
  clearLevelOverride()
  levelOverrideActive.value = false
  levelDraft.value = null
  practiceStore.bumpLevelOverride()
  refreshStartInfo()
  ElMessage.info('已恢复自动升档（按练习记录计算）')
}

/** 刷新准备界面（不重置输入态，只重算数据） */
function refreshStartInfo() {
  if (readyToStart.value && !currentQuestion.value) loadStartInfo()
}

async function loadStartInfo() {
  const { Profile } = await import('@/services/abilityProfile')
  const { loadChallengeEnabled } = await import('@/utils/store/challengeSetting')
  const { loadAutoAdvance } = await import('@/utils/store/autoAdvance')
  const { loadLevelOverride } = await import('@/utils/store/levelOverride')
  const { getLastSessionAccuracy } = await import('@/services/statsAggregator')
  const profile = await Profile.load()
  const idx = profile?.difficultyIdx ?? 0
  const level = DIFFICULTY_LEVELS[idx] || DIFFICULTY_LEVELS[0]

  // 上次正确率：最近一轮有答题的练习（不是历史平均）
  let lastAccuracy = null
  let lastAnswered = 0
  try {
    const last = await getLastSessionAccuracy()
    lastAccuracy = last?.accuracy ?? null
    lastAnswered = last?.total ?? 0
  } catch { /* 读不到就当无数据 */ }

  let streak = 0
  try {
    const { getAggregatedStats } = await import('@/services/statsAggregator')
    const agg = await getAggregatedStats()
    streak = agg?.dailyStreak || 0
  } catch { /* 统计失败不阻塞 */ }

  // 练习量优先级：adaptiveTarget（抽屉里当前设置，实时）> adaptiveConfig（诊断快照）
  // > configSnapshot > psm_form_state（上次保存）> 默认 10/30
  const liveTarget = practiceStore.session.adaptiveTarget
  const cfg = practiceStore.session.adaptiveConfig || practiceStore.session.configSnapshot || {}
  const { loadFormState } = await import('@/utils/store/formPersistence')
  const savedForm = loadFormState()?.formData || {}
  const targetMin = liveTarget?.targetMin ?? cfg.targetMin ?? savedForm.targetMin ?? 10
  const targetMax = liveTarget?.targetMax ?? cfg.targetMax ?? savedForm.targetMax ?? 30
  // 起点档位（手动覆盖）
  const override = loadLevelOverride()
  levelOverrideActive.value = !!override
  levelDraft.value = override ? override.levelIdx : null
  ratioMap.value = loadLevelCoefficients()

  startInfo.value = {
    levelIdx: idx + 1,
    levelRaw: idx,
    levelLabel: level?.label || '起步',
    grade: level?.grade || '',
    lastAccuracy,
    lastAnswered,
    streak,
    targetMin,
    targetMax,
    // 挑战题由家长手动开关（默认关闭 → 只出当前档及以下）
    challengeEnabled: loadChallengeEnabled(),
    // 升档方式：默认手动（停在当前档，家长点「升/降一档」才推进）
    autoAdvance: loadAutoAdvance(),
    // 练习重点只列当前档位及以下的弱项：更高档位这轮不会出题（见 Profile#getFocusLevels）
    focus: profile?.getFocusLevels ? profile.getFocusLevels() : [],
  }
  // 练习量草稿跟随最新值（避免输入框显示旧值）
  targetDraft.value = { min: targetMin, max: targetMax }
  targetError.value = ''
}

/** 点「开始练习」才真正出题 */
async function handleStartPractice() {
  playSfx('start')
  practiceStore.setReadyToStart(false)
  practiceStore.setPhase('practice')
  practiceStore.resetPracticeSession()
  await startNewAdaptiveSession()
}

// 诊断完成后 completeAssessment 会把 readyToStart 置 true，
// 此时刷新准备界面的数据（刚算出的画像/统计）
watch(readyToStart, (v) => { if (v) loadStartInfo() })

/**
 * 抽屉里改「自适应练习量」后，准备界面要跟着变。
 * 之前只 watch readyToStart，改完配置没有任何反应 ——
 * 因为练习量是诊断时快照的，界面也就一直显示旧值。
 */
watch(
  () => practiceStore.session.adaptiveTarget,
  () => { if (readyToStart.value) loadStartInfo() }
)

/**
 * 设置里改了「起点档位」（或恢复自动）→ 准备界面要立刻显示新档位。
 * 设置抽屉与练习页不在同一组件树，靠 store 的版本号中转。
 */
watch(
  () => practiceStore.levelOverrideRevision,
  async () => {
    if (readyToStart.value && !currentQuestion.value) await loadStartInfo()
  }
)

/**
 * 全键盘操作：数字 / 退格 / 回车 / 空格
 *
 * 监听放在 V 层而不是 NumberKeypad 内部 —— 答题区可能是数字键区也可能是选择题，
 * 放在这里才能统一处理「反馈态按回车进下一题」，不用每个输入组件各写一份。
 * 数字键区输完正确答案会自动提交（handleInput 内的既有逻辑），所以回车主要用作
 * 选择题提交与反馈态翻页，长答案（如三位数）也能在半途用回车手动提交。
 */
function handleKeydown(e) {
  // 带修饰键的组合交给浏览器（Ctrl+R / Cmd+Tab 等）
  if (e.ctrlKey || e.altKey || e.metaKey) return
  // 弹窗自己处理键盘（自评 / 汇总），练习页不抢键
  if (dialogs.evalVisible.value || dialogs.summaryVisible.value) return
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return

  // 准备界面：回车 = 点「开始练习」
  if (readyToStart.value && !currentQuestion.value) {
    if (e.key === 'Enter') { e.preventDefault(); playSfx('keyConfirm'); handleStartPractice() }
    return
  }
  if (!currentQuestion.value) return

  // 已作答进入反馈：回车 / 空格翻到下一题
  if (session.value.feedbackType !== null) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNext() }
    return
  }

  if (isKeypad()) {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); playSfx('tap'); handleInput(e.key); return }
    if (e.key === 'Backspace') { e.preventDefault(); playSfx('keyBack'); handleBackspace(); return }
    if (e.key === 'Enter') { e.preventDefault(); playSfx('keyConfirm'); handleSubmit(); return }
    return
  }

  // 选择题：← → 移动选中项，回车/空格提交当前项；数字键保留为快捷方式
  const opts = session.value.currentOptions || []
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!opts.length) return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    optionFocusIdx.value = (optionFocusIdx.value + dir + opts.length) % opts.length
    playSfx('tap')
    return
  }
  if (/^[1-9]$/.test(e.key)) {
    const idx = Number(e.key) - 1
    if (idx < opts.length) { e.preventDefault(); optionFocusIdx.value = idx; playSfx('tap'); handleSelect(opts[idx]) }
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    playSfx('keyConfirm')
    if (opts.length) handleSelect(opts[Math.min(optionFocusIdx.value, opts.length - 1)])
    else handleSubmit()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

/**
 * 数据库升级被其他标签页占用时的提示（databaseInit 派发 psm:db-blocked）。
 * 没有提示的话，第二个标签页会一直卡在加载态，用户完全不知道发生了什么。
 */
function handleDbBlocked() {
  ElMessage.warning({
    message: '检测到练习数据升级被其他标签页占用，请关闭其他标签页后刷新本页',
    duration: 6000,
  })
}
onMounted(() => window.addEventListener('psm:db-blocked', handleDbBlocked))
onUnmounted(() => window.removeEventListener('psm:db-blocked', handleDbBlocked))

/** 同步来的配置应用后：音效开关是模块级变量，需要重新读一次 */
function handleSettingsApplied() {
  sfxOn.value = reloadSfxEnabled()
  // 档位/挑战题/升档方式可能被另一台设备改了 → 准备界面跟着刷新
  refreshStartInfo()
}
onMounted(() => window.addEventListener('psm:settings-applied', handleSettingsApplied))
onUnmounted(() => window.removeEventListener('psm:settings-applied', handleSettingsApplied))

onMounted(async () => {
  void loadWrongHistory()
  // 恢复同步身份；已绑定则自动开始定时同步（不阻塞、失败只影响状态点）
  void snapshotSync.init()
  if (listPractices.value.length > 0) return  // 已有题目，不干预
  // 从 DB 实时计算是否有诊断画像（判定收口到 hasRealProfile，抽屉门禁共用同一判据）
  const { Profile, hasRealProfile } = await import('@/services/abilityProfile')
  const profile = await Profile.load()
  const hasAssessment = hasRealProfile(profile)
  // 同步到 store：抽屉入口以 hasRealProfile 为准（phase 会被手动出题污染，不能用）
  practiceStore.setHasRealProfile(hasAssessment)

  if (hasAssessment) {
    // 不直接出题：先进准备界面，让学生看清这轮练什么，点「开始练习」再开始
    practiceStore.setPhase('practice')
    await loadStartInfo()
    practiceStore.setReadyToStart(true)
  } else {
    practiceStore.setPhase('idle')
    practiceStore.setReadyToStart(false)
    startNewDiagnosticSession()
  }
})
</script>

<style scoped>
.practice-view {
  width: 100%;
  min-height: 100%;
}

.practice-shell {
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.practice-card {
  width: min(100%, 980px);
  --interaction-width: min(100%, 760px);
  border: 0;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 32px rgba(23, 110, 191, 0.08);
}

/* ── 开始练习界面 ── */
.practice-card--start {
  max-width: 560px;
}

.start-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 8px 4px 4px;
}

.start-head {
  text-align: center;
}

.start-title {
  font-size: 26px;
  font-weight: 700;
  color: #1e3c5c;
  line-height: 1.3;
}

.start-sub {
  margin-top: 4px;
  font-size: 14px;
  color: #9aa7b4;
}

.start-section__title {
  font-size: 13px;
  font-weight: 600;
  color: #7f8c9b;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
}

.start-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.metric {
  padding: 14px 10px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f4f9ff, #eef5fd);
  text-align: center;
}

.metric__value {
  font-size: 24px;
  font-weight: 700;
  color: #176ebf;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.metric__unit {
  font-size: 13px;
  font-weight: 600;
  margin-left: 1px;
}

.metric__grade {
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 6px;
  background: #e8f1fb;
  color: #3f7cb8;
  font-size: 11px;
}
.chip__grade {
  margin-left: 4px;
  color: #7d97b3;
  font-size: 11px;
}
.metric__label {
  margin-top: 4px;
  font-size: 12px;
  color: #8794a2;
}

.start-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #4a5a68;
  background: #f2f5f8;
}

.chip--level {
  color: #176ebf;
  background: rgba(23, 110, 191, 0.1);
}

.chip--focus {
  color: #d9822b;
  background: rgba(217, 130, 43, 0.12);
}

.start-btn {
  width: 100%;
  height: 52px;
  margin-top: 4px;
  border-radius: 16px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* 主按钮吸底：内容再长也点得到（渐变防止文字透出） */
.start-cta {
  position: sticky;
  bottom: 0;
  padding-top: 10px;
  padding-bottom: 2px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 42%);
}

/* ── 本次练习设置（默认折叠）─────────────────────────────── */
.start-section--settings {
  border-top: 1px solid #dbe7f4;
  padding-top: 14px;
  margin-top: 2px;
}

.settings-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.settings-caret {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: #9aa7b4;
  transition: transform 0.16s ease;
}

.settings-caret--open {
  transform: rotate(90deg);
}

.settings-label {
  font-size: 14px;
  font-weight: 600;
  color: #1e3c5c;
}

.scope-badge {
  font-size: 11px;
  font-weight: 500;
  color: #7f8c9b;
  background: #eef3f8;
  border-radius: 6px;
  padding: 2px 7px;
}

.settings-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip--summary {
  font-size: 12px;
  font-weight: 500;
  color: #5b6b7a;
  background: #eef3f8;
  padding: 4px 10px;
}

.settings-rows {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 0;
  border-bottom: 1px solid #eef3f8;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row__label {
  font-size: 14px;
  font-weight: 500;
  color: #1e3c5c;
  flex: 0 0 auto;
}

.setting-row__value {
  font-size: 13px;
  color: #5b6b7a;
}

.setting-row__value--muted {
  color: #9aa7b4;
}

.setting-row__unit {
  font-size: 13px;
  color: #8794a2;
}

/* 把右侧控件推到行尾 */
.setting-row__spacer {
  flex: 1 1 auto;
}

.setting-row--pair {
  gap: 18px;
}

/* 档位行：放不下时按钮组整体换到第二行右对齐 */
.setting-row--level {
  flex-wrap: wrap;
}

.setting-pair {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.level-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.level-btn {
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  border-radius: 9px;
}

.level-more-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  color: #909399;
}

.target-input {
  width: 72px;
}

.target-input :deep(input) {
  text-align: center;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}

.target-input :deep(input)::-webkit-outer-spin-button,
.target-input :deep(input)::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.hint-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 50%;
  background: #dbe7f4;
  color: #7f8c9b;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

/* ── 档位配比（第二层折叠 + 限高内部滚动）── */
.setting-row--ratio {
  border-bottom: none;
}

.ratio-tag {
  font-size: 11px;
  color: #b7791f;
  background: #fff7e6;
  border: 1px solid #ffe1a8;
  border-radius: 6px;
  padding: 1px 6px;
}

.ratio-panel {
  margin: 2px 0 8px;
  border: 1px solid #e6eef6;
  border-radius: 12px;
  background: #f8fbff;
  overflow: hidden;
}

.ratio-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: #f2f8ff;
  border-bottom: 1px solid #e6eef6;
}

.ratio-panel__title {
  font-size: 13px;
  font-weight: 600;
  color: #1e3c5c;
}

.ratio-panel__hint {
  font-size: 11px;
  color: #9aa7b4;
}

/* 24 档不撑长页面：限高 + 内部滚动 */
.ratio-panel__body {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 12px 8px;
  -webkit-overflow-scrolling: touch;
}

.ratio-panel__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid #e6eef6;
  background: #fbfdff;
}

.ratio-group__title {
  font-size: 11.5px;
  font-weight: 600;
  color: #7f8c9b;
  margin: 8px 0 2px;
}

.ratio-line {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
}

.ratio-line__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: #5b6b7a;
}

.ratio-line__idx {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 6px;
  border-radius: 6px;
  background: #eef3f8;
  color: #7f8c9b;
  font-size: 11px;
}

.ratio-line__input {
  width: 64px;
  flex: 0 0 64px;
}

.ratio-line__input :deep(input) {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.settings-error {
  font-size: 12px;
  color: #e6a23c;
  padding: 4px 0 0 2px;
}

.settings-more {
  margin: 2px 0 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f6f9fc;
  border: 1px solid #e6eef6;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.settings-more__title {
  font-size: 12px;
  font-weight: 600;
  color: #7f8c9b;
}

.settings-more__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-more__label {
  font-size: 13px;
  color: #5b6b7a;
  flex: 0 0 auto;
}

.settings-more__select {
  flex: 1 1 auto;
  min-width: 0;
}

.settings-more__hint {
  font-size: 11.5px;
  color: #9aa7b4;
}

.settings-more__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 小屏（≤360）：两个开关各占一行、题量输入再收窄，避免挤压 */
@media (max-width: 360px) {
  .setting-row {
    gap: 6px;
  }

  .setting-row--pair {
    flex-wrap: wrap;
  }

  .setting-pair {
    flex: 1 1 100%;
  }

  .target-input {
    width: 64px;
  }
}

@media (max-width: 480px) {
  .start-panel {
    gap: 18px;
  }

  .start-title {
    font-size: 22px;
  }

  .metric {
    padding: 12px 6px;
  }

  .metric__value {
    font-size: 20px;
  }
}

.practice-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 组徽标：与阶段徽标同尺寸同圆角，只换底色，避免多一套视觉语言 */
.stage-badge--group {
  color: #176ebf;
  background: #e3f1ff;
  border-color: #cfe6fb;
}

.stage-badge,
.streak-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid #dbe7f4;
}

.stage-badge {
  color: #1e3c5c;
  background: #e9f4ff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sfx-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 44px：触屏最小可点尺寸 */
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #dbe7f4;
  border-radius: 50%;
  background: #fff;
  color: #7f8c9b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.sfx-toggle:hover {
  color: #176ebf;
  border-color: #b9d6f2;
  background: #f4f9ff;
}

.sfx-toggle:active {
  transform: scale(0.94);
}

.stage-badge--assessment {
  color: #7c3aed;
  background: #f3e8ff;
  border-color: #c084fc;
}

/* ── Loading state ── */
.practice-card--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.loading-state {
  text-align: center;
  color: #909399;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  margin: 0 auto 16px;
  border: 3px solid #e8edf3;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  font-size: 15px;
  margin: 0;
}

.streak-badge {
  color: #d97706;
  background: #fff7ed;
}

.question-area {
  margin-top: 8px;
  display: flex;
  justify-content: center;
}

.input-area {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/*
 * 键盘操作提示：只在有实体键盘/精确指针的设备显示。
 * 触屏上这行没有意义，反而占地方。
 */
.keyboard-hint {
  display: none;
}

@media (hover: hover) and (pointer: fine) {
  .keyboard-hint {
    display: block;
    font-size: 12px;
    color: #a7b3c0;
    letter-spacing: 0.02em;
    user-select: none;
  }
}

.question-area :deep(.math-question-surface),
.question-area :deep(.vertical-layout.math-question-surface),
.input-area :deep(.keypad-shell) {
  width: var(--interaction-width);
  max-width: var(--interaction-width);
  margin-left: auto;
  margin-right: auto;
}

.correct-flash {
  animation: correctFlash 0.5s ease;
}

.wrong-flash {
  animation: wrongFlash 0.5s ease;
}

@keyframes correctFlash {
  0% { transform: scale(1); }
  50% { transform: scale(1.03); color: #58cc71; }
  100% { transform: scale(1); }
}

@keyframes wrongFlash {
  0% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

@media (max-width: 1024px) {
  .practice-card {
    width: 100%;
    border-radius: 20px;
  }
}

@media (max-width: 768px) {
  .practice-card {
    border-radius: 18px;
    padding: 8px 6px;
  }

  .practice-card__header {
    margin-bottom: 8px;
  }

  .input-area {
    margin-top: 12px;
  }

  .question-area {
    --interaction-width: min(100%, 620px);
  }

  .practice-card {
    --interaction-width: min(100%, 620px);
  }
}

@media (max-width: 480px) {
  .practice-card {
    border-radius: 16px;
    padding: 6px 4px;
  }

  .stage-badge,
  .streak-badge {
    padding: 5px 10px;
    font-size: 14px;
  }

  .question-area {
    --interaction-width: min(100%, 520px);
  }

  .practice-card {
    --interaction-width: min(100%, 520px);
  }
}

/* ── Floating stats button ── */
.stats-fab {
  position: fixed !important;
  bottom: 32px;
  left: 24px;
  z-index: 100;
  width: 44px !important;
  height: 44px !important;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stats-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(64, 158, 255, 0.45);
}

@media (max-width: 768px) {
  .stats-fab {
    bottom: 20px;
    left: 16px;
    width: 48px !important;
    height: 48px !important;
  }
}

/* ── Short viewport height tweaks ── */
@media (max-height: 800px) {
  .practice-card {
    border-radius: 16px;
  }
  :deep(.el-card__body) {
    padding: 12px 16px;
  }
}

@media (max-height: 600px) {
  :deep(.el-card__body) {
    padding: 8px 12px;
  }
}
</style>

<style>
.feedback-message {
  font-size: 24px !important;
  padding: 16px 32px !important;
  border-radius: 50px !important;
  font-weight: bold !important;
  text-align: center !important;
  z-index: 9999 !important;
}

/* ── 答错常驻错因条（toast 一闪而过，这条留到下一题）── */
.wrong-reason {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px auto 0;
  max-width: var(--interaction-width, 100%);
  padding: 8px 12px;
  border-radius: 10px;
  background: #fff4f4;
  border: 1px solid #ffd6d6;
}

.wrong-reason__label {
  font-size: 13px;
  color: #d94848;
  font-weight: 600;
}

.wrong-reason__ans {
  margin-left: auto;
  font-size: 12.5px;
  color: #7f8c9b;
  white-space: nowrap;
}

.wrong-reason__ans b {
  color: #1e3c5c;
  font-size: 15px;
}

/* ── 错题复习：整块题目显著区分（背景 + 描边 + 左侧色条）── */
.review-question {
  position: relative;
  background: linear-gradient(135deg, #fff8ef 0%, #fff2e2 100%) !important;
  border: 2px solid #ffb13c !important;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(255, 177, 60, 0.22);
}

.review-question::before {
  content: "重点复习";
  position: absolute;
  top: -10px;
  left: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ffb13c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>