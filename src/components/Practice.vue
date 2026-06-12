<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <!-- P2: 用户能力画像仅在汇总弹窗中显示完整版（PracticeSummaryDialog），
           答题时不再常驻以避免分散注意力 -->

      <el-card class="practice-card" shadow="never" v-if="currentQuestion !== null">
        <div class="practice-card__header">
          <div class="stage-badge" :class="{ 'stage-badge--assessment': isAssessment }">{{ currentStage }}</div>
          <div class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</div>
        </div>

        <ProgressSteps
          :total="totalQuestions"
          :current="currentIndex + 1"
          :answers="currentAnswers"
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
              'wrong-flash': session.feedbackType === 'wrong'
            }"
            @update:user-answer="handleInput"
            @submit-answer="handleSubmit"
            @focus="digitFocusIdx = $event"
          />
        </div>

        <div class="input-area">
          <component
            :is="currentInput"
            v-bind="inputProps"
            @input="handleInput"
            @select="handleSelect"
            @backspace="handleBackspace"
            @submit="handleSubmit"
            @next="handleNext"
          />
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { TrendCharts } from '@element-plus/icons-vue'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import PracticeSummaryDialog from '@/components/dialog/PracticeSummaryDialog.vue'
import SelfEvaluationDialog from '@/components/dialog/SelfEvaluationDialog.vue'
import { useAnswerBuilder } from '@/composables/useAnswerBuilder'
import { useSubmitHandler } from '@/composables/useSubmitHandler'
import { useAdaptiveSession } from '@/composables/useAdaptiveSession'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { decideListPracticesTransition } from '@/utils/listPracticesGuard'
import { useDisplayStrategy } from '@/composables/useDisplayStrategy'  // 🆕 PR-4.2 抽离 displayStats + applyDisplayModeForCurrentQuestion + generateOptions
import { FEEDBACK_DELAYS, ASSESSMENT_ABORT_WRONG_STREAK, getCommentByRate, ASSIST_LEVELS, MAX_ATTEMPT_PER_QUESTION } from '@/constants/practice'

import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { storeToRefs } from 'pinia'

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
  assessmentCompleted
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
  practiceStore.session.sessionStartTime = Date.now()

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

const handleBackspace = () => {
  if (!isKeypad()) {
    session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
    return
  }
  bsLock = true
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
    session.value.feedbackType = 'correct'
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
  session.value.feedbackType = 'wrong'
  ElMessage.error({
    message: `✗ 正确答案是 ${currentQuestion.value.solution}`,
    duration: FEEDBACK_DELAYS.wrong,
    offset: 100,
    customClass: 'feedback-message',
  })
  updateStats(false)

  // 评估模式下连续错 N 次 → 提前结束评估
  const shouldAbortAssessment = isAssessment.value && displayStats.value.consecutiveWrong >= ASSESSMENT_ABORT_WRONG_STREAK

  // 错题重试上限
  if (result.attemptCount >= MAX_ATTEMPT_PER_QUESTION + 1) {
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

const handleNext = () => {
  if (nextLocked.value) return
  nextLocked.value = true

  if (!isLastQuestion.value) {
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
    } else if (adaptiveEngine.value) {
      fn = completeGroup
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
const handlePracticeComplete = async () => {
  const totalAns = totalQuestions.value
  const correctAns = correctCount.value
  const rate = Math.round((correctAns / totalAns) * 100)

  // 非自适应练习完成时，传 finalProfileSnapshot（从 adaptiveEngine 或当前 profile 获取）
  let finalProfile = null
  if (adaptiveEngine?.value?.profile) {
    finalProfile = adaptiveEngine.value.profile.snapshot()
  }
  await saver.saveSessionFinal({ finalProfileSnapshot: finalProfile })

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
    if (decision.action.kind === 'START_ADAPTIVE') {
      startNewAdaptiveSession()
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
onMounted(async () => {
  if (listPractices.value.length > 0) return  // 已有题目，不干预
  // 从 DB 实时计算是否有诊断画像
  const { Profile } = await import('@/services/abilityProfile')
  const profile = await Profile.load()
  const hasAssessment = profile.difficultyIdx > 0 || profile.strongLevelIndices.length > 0

  if (hasAssessment) {
    practiceStore.setPhase('practice')
    practiceStore.resetPracticeSession()
    await startNewAdaptiveSession()
  } else {
    practiceStore.setPhase('idle')
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

.practice-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
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
  justify-content: center;
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
</style>