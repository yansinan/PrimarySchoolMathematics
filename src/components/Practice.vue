<!-- views/PracticeView.vue -->
<template>
  <el-container class="practice-view">
    <el-main class="practice-shell">
      <el-card class="practice-card" shadow="never" v-if="currentQuestion !== null">
        <div class="practice-card__header">
          <div class="stage-badge" :class="{ 'stage-badge--assessment': isAssessment }">{{ currentStage }}</div>
          <div class="streak-badge" v-if="session.streak > 0">🔥 {{ session.streak }}</div>
        </div>

        <ProgressSteps
          :total="totalQuestions"
          :current="currentIndex + 1"
          :answers="session.answers.slice(groupAnswerOffset)"
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
      @click="statsStore.toggleDrawer()"
    />
  </el-tooltip>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { TrendCharts } from '@element-plus/icons-vue'

import ProgressSteps from '@/components/layout/ProgressSteps.vue'
import HorizontalLayout from '@/components/question/HorizontalLayout.vue'
import VerticalLayout from '@/components/question/VerticalLayout.vue'
import NumberKeypad from '@/components/input/NumberKeypad.vue'
import OptionButtons from '@/components/input/OptionButtons.vue'
import { getCarryType, parseEquation } from '@/utils/equationParser'
import { generateDiagnosticQuestions, analyzeAbility, generatePracticeConfig } from '@/utils/diagnostic'
import { createFormulasGenerator } from '@/utils/paperGenerator'
import { EquationSolver } from '@/utils/EquationSolver'
import { createAdaptiveEngine, getDifficultyConfig, getGroupSize, evaluateGroup, getDifficultyLabel, diversifyBatch } from '@/utils/adaptiveEngine'
import { formatDuration } from '@/utils/timeFormat'

import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { storeToRefs } from 'pinia'

// ── 辅助：生成汇总弹窗 HTML ──
function genSummaryHtml(emoji, comment, totalAns, correctAns, rate, rateColor) {
  var h = '<div style="text-align:center;padding:4px 0;">'
  h += '<div style="font-size:52px;margin-bottom:8px;line-height:1.2;">' + emoji + '</div>'
  h += '<div style="font-size:22px;font-weight:700;color:#1e3c5c;margin-bottom:4px;">练习完成</div>'
  h += '<div style="font-size:14px;color:#909399;margin-bottom:18px;">' + comment + '</div>'
  h += '<div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">'
  h += '<div style="background:linear-gradient(135deg,#f0f9ff,#e8f4fd);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:#1e3c5c;">' + totalAns + '</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">共答</div></div>'
  h += '<div style="background:linear-gradient(135deg,#f0fdf4,#e6f9ed);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:#27ae60;">' + correctAns + '</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确</div></div>'
  h += '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:' + rateColor + ';">' + rate + '%</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确率</div></div></div>'
  h += '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #edf2f7;font-size:12px;color:#c0c4cc;">继续加油，每天进步一点点 &#127775;</div></div>'
  return h
}

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
  abilityProfile
} = storeToRefs(practiceStore)

const tempDisplayStrategy = {
  stats: {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  },
  decide(equation) {
    if (this.stats.consecutiveWrong >= 3) {
      return { layout: 'horizontal', input: 'options' }
    }

    const parsedEquation = parseEquation(equation)
    if (getCarryType(parsedEquation)) {
      return { layout: 'vertical', input: 'keypad' }
    }

    return { layout: 'horizontal', input: 'keypad' }
  },
  updateStats(isCorrect) {
    if (isCorrect) {
      this.stats.consecutiveWrong = 0
      this.stats.accuracyRate = this.stats.accuracyRate * 0.9 + 0.1
    } else {
      this.stats.consecutiveWrong++
      this.stats.accuracyRate = this.stats.accuracyRate * 0.9
    }
  }
}

/** 当前组之前累积的答案数，用于 ProgressSteps 截取 */
const groupAnswerOffset = ref(0)
/** 当前组内正确题数（只算本组的答案） */
const groupCorrectCount = computed(() =>
  session.value.answers.slice(groupAnswerOffset.value).filter(a => a.isCorrect).length
)

/** 自适应引擎状态 */
const adaptiveEngine = ref(null)
const adaptiveGroupIndex = ref(0)
/** 避免 handleNext 重复调用（choice 模式下 下一题按钮 + setTimeout 同时触发）*/
let nextLocked = false

const currentStage = computed(() => {
  if (isAssessment.value) {
    return `能力评估 ${session.value.answers.length}/${totalQuestions.value}`
  }
  if (adaptiveEngine.value) {
    const label = getDifficultyLabel(adaptiveEngine.value)
    const groupIdx = adaptiveGroupIndex.value
    return `${label} · 第${groupIdx}组`
  }
  if (abilityProfile.value) {
    return '智能练习'
  }
  return '一年级'
})

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

const initPractice = () => {
  if (!currentQuestion.value) return

  practiceStore.resetPracticeSession()
  practiceStore.session.sessionStartTime = Date.now()

  tempDisplayStrategy.stats = {
    consecutiveWrong: 0,
    accuracyRate: 1.0
  }

  const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)

  // 如果题目来自自适应引擎且预置了选项，使用 choice 模式
  const isAdaptiveChoice = currentQuestion.value.options && currentQuestion.value.options.length > 0
  if (isAdaptiveChoice) {
    session.value.displayMode = { layout: 'horizontal', input: 'options' }
    session.value.currentOptions = [...currentQuestion.value.options]
  } else {
    session.value.displayMode = mode

    if (mode.input === 'options') {
      generateOptions(currentQuestion.value.solution)
    }
  }

  // Start the first question timer
  practiceStore.startQuestionTimer()
}

const generateOptions = (correct) => {
  const options = [correct]
  while (options.length < 4) {
    const offset = Math.floor(Math.random() * 5) + 1
    const wrong = correct + (Math.random() > 0.5 ? offset : -offset)
    if (wrong > 0 && !options.includes(wrong)) {
      options.push(wrong)
    }
  }
  session.value.currentOptions = options.sort(() => Math.random() - 0.5)
}

/** 竖式逐位输入：委托给 DigitInput */
const digitFocusIdx = ref(-1)
const layoutRef = ref(null)
/** 防退格后 @input 重复处理 */
let bsLock = false

const handleInput = (value) => {
  if (session.value.displayMode.layout === 'vertical' && session.value.displayMode.input === 'keypad') {
    if (bsLock) { bsLock = false; return }   // 退格触发的 input，跳过
    const digit = value.replace(/_/g, '').slice(-1)
    if (digit && layoutRef.value?.acceptDigit) {
      session.value.currentAnswer = layoutRef.value.acceptDigit(digit)
    }
    return
  }
  // 横式 + keypad：也委托给 DigitInput 管理逐位输入
  if (session.value.displayMode.layout === 'horizontal' && session.value.displayMode.input === 'keypad') {
    if (bsLock) { bsLock = false; return }
    const digit = String(value || '').replace(/_/g, '').slice(-1)
    if (digit && layoutRef.value?.acceptDigit) {
      session.value.currentAnswer = layoutRef.value.acceptDigit(digit)
    }
    return
  }
  session.value.currentAnswer = value
}

const handleBackspace = () => {
  if (session.value.displayMode.layout === 'vertical' && session.value.displayMode.input === 'keypad') {
    bsLock = true
    if (layoutRef.value?.acceptBackspace) {
      session.value.currentAnswer = layoutRef.value.acceptBackspace()
    }
    return
  }
  // 横式 + keypad：同样委托给 DigitInput
  if (session.value.displayMode.layout === 'horizontal' && session.value.displayMode.input === 'keypad') {
    bsLock = true
    if (layoutRef.value?.acceptBackspace) {
      session.value.currentAnswer = layoutRef.value.acceptBackspace()
    }
    return
  }
  session.value.currentAnswer = session.value.currentAnswer.slice(0, -1)
}

const handleSelect = (option) => {
  session.value.selectedOption = option
  handleSubmit(option)
}

const handleSubmit = (answer) => {
  const rawAnswer = String(session.value.currentAnswer || '').replace(/_/g, '')
  const userAnswer = answer !== undefined ? answer : Number(rawAnswer)

  if (isNaN(userAnswer)) {
    ElMessage.warning('请输入答案')
    return
  }

  const isCorrect = userAnswer === currentQuestion.value.solution

  // ── Timing & metadata ──
  const responseTime = practiceStore.endQuestionTimer()

  // Extract metadata from the equation
  const parsed = parseEquation(currentQuestion.value.equation)
  const operator = parsed?.operator || ''
  const isCarry = getCarryType(parsed) === 'carry'
  const isBorrow = getCarryType(parsed) === 'borrow'
  const leftVal = parseInt(parsed?.leftOperand) || 0
  const rightVal = parseInt(parsed?.rightOperand) || 0
  const operandMin = Math.min(leftVal, rightVal)
  const operandMax = Math.max(leftVal, rightVal)
  // Determine stepCount — check the current configSnapshot or use heuristics
  const stepCount = currentQuestion.value.stepCount || 1

  // ── / metadata ──

  // 按题号去重：如果已答过该题（重试），替换旧记录而非追加
  const existingIdx = session.value.answers.findIndex(a => a.questionIndex === currentIndex.value)
  const answerEntry = {
    ...currentQuestion.value,
    userAnswer,
    isCorrect,
    timestamp: Date.now(),
    responseTime,
    operator,
    isCarry,
    isBorrow,
    stepCount,
    operandMin,
    operandMax,
    questionIndex: groupAnswerOffset.value + currentIndex.value
  }
  if (existingIdx >= 0) {
    session.value.answers[existingIdx] = answerEntry
  } else {
    session.value.answers.push(answerEntry)
  }

  // ── 每道题立即写入数据库（fire-and-forget）──
  // answerEntry 已在 session 中按 questionIndex 去重，
  // 多次写入同一题会自动覆盖，统计时以最新为准
  practiceStore.saveSessionToDB()

  if (isCorrect) {
    session.value.streak++
    session.value.feedbackType = 'correct'
    tempDisplayStrategy.updateStats(true)
    ElMessage.success({
      message: '✓ 正确！',
      duration: 800,
      offset: 100,
      customClass: 'feedback-message'
    })

    setTimeout(() => {
      handleNext()
    }, 800)
  } else {
    session.value.streak = 0
    session.value.feedbackType = 'wrong'
    ElMessage.error({
      message: `✗ 正确答案是 ${currentQuestion.value.solution}`,
      duration: 1500,
      offset: 100,
      customClass: 'feedback-message'
    })

    // 评估模式下连续错 2 次 → 提前结束评估，直接进入练习
    tempDisplayStrategy.updateStats(isCorrect)
    const shouldAbortAssessment = isAssessment.value && tempDisplayStrategy.stats.consecutiveWrong >= 2

    if (shouldAbortAssessment) {
      const nextFn = () => {
        session.value.feedbackType = null
        session.value.currentAnswer = ''
        digitFocusIdx.value = -1
        handleAssessmentComplete()
      }

      if (session.value.displayMode.input === 'keypad') {
        setTimeout(nextFn, 1500)
      } else {
        setTimeout(nextFn, 1500)
      }
    } else {
      setTimeout(() => {
        if (session.value.displayMode.input === 'keypad') {
          session.value.feedbackType = null
          session.value.currentAnswer = ''
          digitFocusIdx.value = -1
        }
      }, 1500)
    }
    return // skip the extra tempDisplayStrategy.updateStats call below
  }

  // (isCorrect path also falls through — already handled above)
}

const handleNext = () => {
  if (nextLocked) return
  nextLocked = true

  if (!isLastQuestion.value) {
    practiceStore.nextQuestion()
    practiceStore.resetQuestionInputState()
    practiceStore.startQuestionTimer()
    digitFocusIdx.value = -1  // 重置点击焦点

    if (!currentQuestion.value) {
      nextLocked = false
      return
    }

    const mode = tempDisplayStrategy.decide(currentQuestion.value.equation)

    // 自适应引擎预置选项
    const isAdaptiveChoice = currentQuestion.value.options && currentQuestion.value.options.length > 0
    if (isAdaptiveChoice) {
      session.value.displayMode = { layout: 'horizontal', input: 'options' }
      session.value.currentOptions = [...currentQuestion.value.options]
    } else {
      session.value.displayMode = mode
      if (mode.input === 'options') {
        generateOptions(currentQuestion.value.solution)
      }
    }
    nextLocked = false
  } else {
    // ── Session complete — handle based on phase ──
    const fn = isAssessment.value ? handleAssessmentComplete :
               adaptiveEngine.value ? completeAdaptiveGroup : handlePracticeComplete
    // reset nextLocked after the handler runs
    const result = fn()
    // If fn is async, give it a tick to unlock
    if (result instanceof Promise) {
      result.finally(() => { nextLocked = false })
    } else {
      nextLocked = false
    }
  }
}

/** 生成一组题目（内建题型穿插） */
function generateBatch(engine, count) {
  const config = getDifficultyConfig(engine)
  const paperList = [{
    step: config.step,
    numberOfFormulas: count,
    whereIsResult: config.whereIsResult,
    formulaList: config.formulaList,
    resultMinValue: config.resultMinValue,
    resultMaxValue: config.resultMaxValue,
    customFormulaList: null
  }]
  const papers = createFormulasGenerator(config, paperList)
  const formulas = papers.reduce((p, c) => { p.push(...c.formulas); return p }, [])
  const baseQuestions = formulas.map(cur => ({
    equation: cur,
    solution: EquationSolver.solve(cur)
  })).filter(q => q.solution !== null && !isNaN(q.solution))

  // 题型多样化：混合不同的输入模式和填空位置
  return diversifyBatch(baseQuestions, engine)
}

/** 诊断完成 → 分析能力 → 启动自适应练习 */
const handleAssessmentComplete = async () => {
  const answers = session.value.answers
  const profile = analyzeAbility(answers)
  const answeredCount = answers.length

  ElMessage({
    message: `📊 评估完成！共 ${answeredCount} 题，正确 ${correctCount.value} 题`,
    duration: 3000,
    offset: 100,
    customClass: 'feedback-message'
  })

  // 创建自适应引擎，生成第 1 组
  // 从配置中读取练习量范围，未配置时使用默认值
  const snapshot = practiceStore.session.configSnapshot || {}
  const targetMin = snapshot.targetMin ?? 10
  const targetMax = snapshot.targetMax ?? 30
  const engine = createAdaptiveEngine(profile, targetMin, targetMax)
  adaptiveEngine.value = engine
  adaptiveGroupIndex.value = 1

  const size = getGroupSize(engine)
  const firstQuestions = generateBatch(engine, size)

  practiceStore.completeAssessment(profile)
  practiceStore.setListPractices(firstQuestions)
}

/** 自适应一组完成 → 评估 → 生成下一组或结束 */
const completeAdaptiveGroup = async () => {
  const allAnswers = [...session.value.answers]
  const engine = adaptiveEngine.value
  const size = getGroupSize(engine)
  const groupAnswers = allAnswers.slice(-size)
  const groupCorrect = groupAnswers.filter(a => a.isCorrect).length
  const groupTime = groupAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)

  // ── 小组反馈 ──
  const groupIdx = adaptiveGroupIndex.value
  const label = getDifficultyLabel(engine)
  const correctRate = Math.round((groupCorrect / groupAnswers.length) * 100)

  let groupComment = ''
  if (correctRate === 100 && groupTime < groupAnswers.length * 5000) {
    groupComment = '又快又准！👍'
  } else if (correctRate >= 80) {
    groupComment = '表现不错！💪'
  } else if (correctRate >= 60) {
    groupComment = '继续加油！📝'
  } else {
    groupComment = '别灰心，再来一组！'
  }

  // ── 强化小组反馈：弹出自我评价对话框 ──
  let evaluationScore = 3

  const scoreLabels = { 1: '有点难…', 2: '不太轻松', 3: '刚刚好', 4: '挺容易', 5: '太简单' }
  const emojiList = ['&#128557;', '&#128543;', '&#128522;', '&#128514;', '&#128524;']
  const facesHtml = [1,2,3,4,5].map(function(s) {
    return '<div onclick="window.__evalSelect && window.__evalSelect(' + s + ')" data-s="' + s + '"' +
      ' style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;' +
      'font-size:30px;cursor:pointer;border-radius:16px;border:2px solid transparent;' +
      'background:#f7fbff;box-shadow:0 2px 8px rgba(23,110,191,0.06);' +
      'transition:all .2s ease;"' +
      ' onmouseover="this.style.background=\'#e9f4ff\';this.style.borderColor=\'#409eff\';this.style.transform=\'scale(1.1)\'"' +
      ' onmouseout="this.style.background=\'#f7fbff\';this.style.borderColor=\'transparent\';this.style.transform=\'scale(1)\'">' +
      emojiList[s-1] + '</div>'
  }).join('')
  const evalHtml = '' +
    '<div style="text-align:center;">' +
      '<div style="font-size:13px;color:#909399;margin-bottom:2px;">第' + groupIdx + '组 · ' + groupCorrect + '/' + groupAnswers.length + ' 正确 · ' + formatDuration(groupTime) + '</div>' +
      '<div style="font-size:14px;font-weight:600;color:#1e3c5c;margin:10px 0 14px;">感觉怎么样？选一个表情吧</div>' +
      '<div style="display:flex;justify-content:center;gap:8px;">' + facesHtml + '</div>' +
      '<div style="margin-top:4px;font-size:11px;color:#c0c4cc;" id="eval-hint">点击表情打分 · 单击即继续</div>' +
    '</div>'

  // 设置全局选择函数（ElMessageBox 内 HTML 无法直接访问 Vue 作用域）
  const evalKey = '__eval_result_' + Date.now()
  window[evalKey] = null
  window.__evalSelect = (score) => {
    window[evalKey] = score
    // 高亮选中
    document.querySelectorAll('[data-s]').forEach(el => {
      el.style.borderColor = parseInt(el.getAttribute('data-s')) === score ? '#409eff' : 'transparent'
      el.style.background = parseInt(el.getAttribute('data-s')) === score ? '#d9ecff' : '#f7fbff'
    })
    document.getElementById('eval-hint').textContent = `已选「${scoreLabels[score] || ''}」`
    // 延时关闭
    setTimeout(() => {
      const closeBtn = document.querySelector('.el-message-box__close')
      if (closeBtn) closeBtn.click()
    }, 400)
  }

  try {
    await ElMessageBox({
      title: '💬 给这组题点个评',
      message: evalHtml,
      dangerouslyUseHTMLString: true,
      showConfirmButton: false,
      showCancelButton: false,
      closeOnClickModal: true,
      closeOnPressEscape: true,
      customClass: 'eval-dialog',
      beforeClose: (action, instance, done) => {
        const score = window[evalKey]
        if (score !== null && score !== undefined) {
          evaluationScore = score
        }
        window[evalKey] = null
        delete window[evalKey]
        window.__evalSelect = null
        done()
      }
    })
  } catch { /* 关闭或超时 → 默认 3 */ }

  adaptiveEngine.value.lastEvaluation = evaluationScore

  // 评估并决定下一步
  const result = evaluateGroup(engine, groupAnswers)
  adaptiveEngine.value = result.engine
  adaptiveGroupIndex.value++

  // ── 实时保存检查点 ──
  // 每组完成后立即保存到数据库，防止中途数据丢失
  session.value.answers = allAnswers
  const evalRecs = (result.engine.history || [])
    .filter(h => h.evaluation != null)
    .map(h => ({ group: h.groupIdx, score: h.evaluation }))
  practiceStore.saveSessionToDB(evalRecs.length ? JSON.stringify(evalRecs) : null)

  if (result.done) {
    // ── 全部完成 → 显示精美的结束画面 ──
    const finalAnswers = allAnswers
    const totalCorrect = finalAnswers.filter(a => a.isCorrect).length
    const totalTime = finalAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)
    const totalRate = Math.round((totalCorrect / finalAnswers.length) * 100)

    // 计算评语
    let comment = ''
    let emoji = ''
    if (totalRate >= 95) {
      emoji = '🏆'
      comment = '太棒了！你是数学小达人！'
    } else if (totalRate >= 80) {
      emoji = '🌟'
      comment = '做得很好！继续保持！'
    } else if (totalRate >= 60) {
      emoji = '💪'
      comment = '不错哦！每次练习都会进步！'
    } else {
      emoji = '🌱'
      comment = '没关系，多练几次就能掌握！'
    }

    const rateColor2 = totalRate >= 80 ? '#27ae60' : totalRate >= 60 ? '#e6a23c' : '#e74c3c'

    try {
      await ElMessageBox.confirm(
        '<div style="text-align:center;padding:4px 0;">' +
          '<div style="font-size:52px;margin-bottom:8px;line-height:1.2;">' + emoji + '</div>' +
          '<div style="font-size:22px;font-weight:700;color:#1e3c5c;margin-bottom:4px;">练习完成</div>' +
          '<div style="font-size:14px;color:#909399;margin-bottom:18px;">' + comment + '</div>' +
          '<div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">' +
            '<div style="background:linear-gradient(135deg,#f0f9ff,#e8f4fd);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">' +
              '<div style="font-size:24px;font-weight:700;color:#1e3c5c;">' + finalAnswers.length + '</div>' +
              '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">共答</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#f0fdf4,#e6f9ed);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">' +
              '<div style="font-size:24px;font-weight:700;color:#27ae60;">' + totalCorrect + '</div>' +
              '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">' +
              '<div style="font-size:24px;font-weight:700;color:' + rateColor2 + ';">' + totalRate + '%</div>' +
              '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确率</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">' +
              '<div style="font-size:24px;font-weight:700;color:#1e3c5c;">' + formatDuration(totalTime) + '</div>' +
              '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">用时</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #edf2f7;font-size:12px;color:#c0c4cc;">继续加油，每天进步一点点 &#127775;</div>' +
        '</div>',
        '🎉 本轮练习汇总',
        {
          confirmButtonText: '开始新一轮',
          cancelButtonText: '📊 分析',
          showCancelButton: true,
          confirmButtonClass: 'el-button--primary',
          cancelButtonClass: 'el-button--default',
          dangerouslyUseHTMLString: true,
          customClass: 'eval-dialog',
          callback: async (action) => {
            // ── 先保存到数据库（无论选哪个按钮） ──
            const evalRecs = ((result.engine && result.engine.history) || [])
              .filter(h => h.evaluation != null)
              .map(h => ({ group: h.groupIdx, score: h.evaluation }))
            practiceStore.session.answers = finalAnswers
            await practiceStore.saveSessionToDB(evalRecs.length ? JSON.stringify(evalRecs) : null)
            await statsStore.refreshAll()
            ElMessage.success({ message: '✅ 练习记录已保存', duration: 2000, offset: 100 })

            // ── 然后处理导航 ──
            practiceStore.setListPractices([])
            if (action === 'confirm') {
              startNewAdaptiveSession()
            } else {
              adaptiveEngine.value = null
              adaptiveGroupIndex.value = 0
              groupAnswerOffset.value = 0
              router.push('/home')
              setTimeout(() => statsStore.openDrawer(), 300)
            }
            nextLocked = false
          }
        }
      )
    } catch {
      // 用户关闭弹窗 → 保存并退出
      const evalRecs = ((result.engine && result.engine.history) || [])
        .filter(h => h.evaluation != null)
        .map(h => ({ group: h.groupIdx, score: h.evaluation }))
      practiceStore.session.answers = finalAnswers
      await practiceStore.saveSessionToDB(evalRecs.length ? JSON.stringify(evalRecs) : null)
      await statsStore.refreshAll()
    }
    return
  }

  // 生成下一组
  const nextQuestions = generateBatch(result.engine, result.nextGroupSize)
  groupAnswerOffset.value = allAnswers.length
  practiceStore.resetCurrentIndex()
  practiceStore.setListPractices(nextQuestions)
  session.value.answers = [...allAnswers]
}

/** 开始新一轮自适应练习（基于已有能力画像或重新评估） */
const startNewAdaptiveSession = () => {
  const profile = practiceStore.abilityProfile
  if (!profile) {
    // 没有画像 → 重新评估
    practiceStore.setPhase('idle')
    practiceStore.setListPractices([])
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
    }
    return
  }

  // 基于已有画像生成新一轮练习
  const snapshot = practiceStore.session.configSnapshot || {}
  const targetMin = snapshot.targetMin ?? 10
  const targetMax = snapshot.targetMax ?? 30
  const engine = createAdaptiveEngine(profile, targetMin, targetMax)
  adaptiveEngine.value = engine
  adaptiveGroupIndex.value = 1

  practiceStore.resetPracticeSession()
  practiceStore.session.sessionStartTime = Date.now()
  practiceStore.setPhase('practice')

  const size = getGroupSize(engine)
  const questions = generateBatch(engine, size)
  practiceStore.setListPractices(questions)

  ElMessage({
    message: '🔄 新一轮开始！加油！',
    duration: 2000,
    offset: 100,
    customClass: 'feedback-message'
  })
}

/** 正常练习完成 → 保存到 DB，弹出汇总弹窗，关闭后跳首页 */
const handlePracticeComplete = async () => {
  const totalAns = totalQuestions.value
  const correctAns = correctCount.value
  const rate = Math.round((correctAns / totalAns) * 100)

  // 保存到 DB
  await practiceStore.saveSessionToDB()
  await statsStore.refreshAll()

  // 汇总弹窗
  let emoji = ''
  let comment = ''
  if (rate >= 95) { emoji = '🏆'; comment = '太棒了！你是数学小达人！' }
  else if (rate >= 80) { emoji = '🌟'; comment = '做得很好！继续保持！' }
  else if (rate >= 60) { emoji = '💪'; comment = '不错哦！每次练习都会进步！' }
  else { emoji = '🌱'; comment = '没关系，多练几次就能掌握！' }

  const rateColor = rate >= 80 ? "#27ae60" : rate >= 60 ? "#e6a23c" : "#e74c3c"

  try {
    await ElMessageBox.confirm(genSummaryHtml(emoji, comment, totalAns, correctAns, rate, rateColor),
      '🎉 本轮练习汇总',
      {
        confirmButtonText: '📊 分析',
        cancelButtonText: '🏠 首页',
        showCancelButton: true,
        confirmButtonClass: 'el-button--primary',
        cancelButtonClass: 'el-button--default',
        dangerouslyUseHTMLString: true,
        customClass: 'eval-dialog',
        callback: (action) => {
          // 先清理题目再跳转
          practiceStore.setListPractices([])
          if (action === 'confirm') {
            router.push('/home')
            setTimeout(() => statsStore.openDrawer(), 300)
          } else {
            router.push('/home')
          }
        }
      }
    )
  } catch {}

  console.log('练习完成', { total: totalAns, correct: correctAns })
}

watch(currentQuestion, (newQ) => {
  console.log('当前题目:', newQ)
})

watch(listPractices, (newPracticeList) => {
  if (newPracticeList.length > 0) {
    const isAdaptiveTransition = adaptiveEngine.value && adaptiveGroupIndex.value > 1
    const saved = isAdaptiveTransition ? [...session.value.answers] : []
    practiceStore.resetCurrentIndex()
    digitFocusIdx.value = -1  // 新题重置焦点
    initPractice()
    if (isAdaptiveTransition) {
      session.value.answers = saved
    } else {
      groupAnswerOffset.value = 0
    }
  }
})

/** 首次进入自动触发能力诊断 */
onMounted(() => {
  // 情况 1: 首次进入 → 自动诊断
  if (isIdle.value && listPractices.value.length === 0) {
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
    }
    return
  }

  // 情况 2: 已有能力画像但题目已清空（刷新后）→ 恢复练习
  if (isPractice.value && abilityProfile.value && listPractices.value.length === 0) {
    startNewAdaptiveSession()
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

/* ── 自我评价对话框 ── */
.eval-dialog {
  width: min(400px, calc(100vw - 48px)) !important;
  border-radius: 20px !important;
  padding: 4px 0 !important;
  box-shadow: 0 20px 60px rgba(23, 110, 191, 0.12) !important;
}

.eval-dialog .el-message-box__header {
  padding: 18px 20px 0 !important;
}

.eval-dialog .el-message-box__title {
  font-size: 18px !important;
  font-weight: 600 !important;
  color: #1e3c5c !important;
}

.eval-dialog .el-message-box__content {
  padding: 16px 20px 24px !important;
}

.eval-dialog .el-message-box__close {
  font-size: 18px !important;
  color: #c0ccda !important;
}

.eval-dialog .el-message-box__close:hover {
  color: #909399 !important;
}

/* ── 完成弹窗的"关闭"按钮 ── */
.finish-close-btn {
  background: #f0f2f5 !important;
  border-color: #dcdfe6 !important;
  color: #606266 !important;
  border-radius: 20px !important;
  padding: 8px 20px !important;
  font-size: 14px !important;
}

.finish-close-btn:hover {
  background: #e4e7ed !important;
  color: #303133 !important;
}

.eval-dialog .el-button--primary {
  border-radius: 20px !important;
  padding: 8px 20px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}
</style>