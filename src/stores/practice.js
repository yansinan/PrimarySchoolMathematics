import { defineStore } from 'pinia'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/equationParser'
import { saveSession } from '@/utils/database'
import { LS_KEY_PSM_PROFILE } from '@/constants/storageKeys'

const LS_KEY = LS_KEY_PSM_PROFILE

/** 从 localStorage 恢复持久化的诊断状态 */
function loadPersistedProfile() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/** 持久化诊断状态到 localStorage */
function savePersistedProfile(profile, phase) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ profile, phase }))
  } catch {}
}

/** 清除持久化的诊断状态 */
function clearPersistedProfile() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

const saved = loadPersistedProfile()

export const usePracticeStore = defineStore('drawer', {
  state: () => ({
    generateDrawerVisible: false,
    listPractices: [],
    /** @type {'idle'|'assessment'|'practice'} */
    phase: saved?.phase === 'practice' ? 'practice' : 'idle',
    /** @type {null|{
     *   levelScores:Object,
     *   weakLevels:string[],
     *   allCorrect:boolean,
     *   diagAnswers?: Array,
     *   adaptiveHistory?: Array
     * }} */
    abilityProfile: saved?.profile || null,
    /** 当前自适应难度索引（-1 表示无自适应进行中）。由 useAdaptiveSession 同步。*/
    currentDifficultyIdx: -1,
    /** 当前自适应组序号（0 表示无） */
    currentGroupIndex: 0,
    /** 自适应阶段累计答题（按题号追加，跨组不去重） */
    adaptiveAnswers: [],
    session: {
      currentIndex: 0,
      answers: [],
      currentAnswer: '',
      feedbackType: null,
      selectedOption: null,
      streak: 0,
      currentOptions: [],
      displayMode: {
        layout: 'horizontal',
        input: 'options'
      },
      // ── Stats / timing extensions ──
      startTime: null,           // current question start time (ms)
      sessionStartTime: null,    // entire session start time (ms)
      configSnapshot: null       // config snapshot from Generate.vue
    }
  }),
  getters: {
    // listQuations:(state)=>{state.listPractices.map((e)=>e.quation);},
    isReady: (state) => state.listPractices && state.listPractices.length > 0,
    totalQuestions: (s) => s.listPractices && s.listPractices.length,
    currentIndex: (state) => state.session.currentIndex,
    currentQuestion: (state) => state.listPractices[state.session.currentIndex] || null,
    emptyParsedEquation: () => EMPTY_PARSED_EQUATION,
    currentParsedEquation() {
      return parseEquation(this.currentQuestion?.equation || '') || this.emptyParsedEquation
    },
    currentCarryType() {
      return getCarryType(this.currentParsedEquation)
    },
    isLastQuestion: (state) => state.session.currentIndex >= state.listPractices.length - 1,
    correctCount: (state) => state.session.answers.filter((a) => a.isCorrect).length,
    /** 是否处于诊断模式 */
    isAssessment: (state) => state.phase === 'assessment',
    /** 是否处于正常练习模式 */
    isPractice: (state) => state.phase === 'practice',
    /** 是否空闲（未开始任何测试/练习） */
    isIdle: (state) => state.phase === 'idle',
    /** 诊断进度文字 */
    diagnosticProgress: (state) => {
      if (state.phase !== 'assessment') return ''
      const done = state.session.answers.length
      const total = state.listPractices.length
      return `能力评估 ${done}/${total}`
    }
  },
  actions: {
    setGenerateDrawerVisible(value) {
      this.generateDrawerVisible = value
    },
    toggleGenerateDrawer() {
      this.generateDrawerVisible = !this.generateDrawerVisible
    },
    setListPractices(value) {
      this.listPractices = value
    },
    setCurrentIndex(value) {
      this.session.currentIndex = value
    },
    resetCurrentIndex() {
      this.session.currentIndex = 0
    },

    // ── Phase management ──
    setPhase(p) {
      this.phase = p
      if (p === 'idle') clearPersistedProfile()
      else if (this.abilityProfile) savePersistedProfile(this.abilityProfile, p)
    },
    setAbilityProfile(profile) {
      this.abilityProfile = profile
      if (profile && this.phase !== 'idle') {
        savePersistedProfile(profile, this.phase)
      } else {
        clearPersistedProfile()
      }
    },
    /** 启动诊断模式并载入诊断题 */
    startAssessment(questions) {
      this.phase = 'assessment'
      this.listPractices = questions
      this.resetPracticeSession()
    },
    /** 完成诊断、记录能力画像
     * 数据流设计：
     *  - session.answers 只装"当前/最近一组"题（弹窗用，避免 125% bug）
     *  - abilityProfile.diagAnswers 保留诊断阶段所有题（AbilityCard 强项/薄弱用）
     *  - adaptiveAnswers 跨组累加（AbilityCard 整体准确率用）
     *  - resetPracticeSession 时清空 adaptiveAnswers（新一轮开始）
     */
    completeAssessment(profile) {
      // 把诊断答题（含 level 字段）保存到 abilityProfile.diagAnswers，
      // 后续强项/薄弱评估从这取，不再依赖 session.answers。
      const enrichedProfile = {
        ...profile,
        diagAnswers: [...this.session.answers],  // 诊断阶段全部答题（含 L1~L5 标签）
      }
      this.abilityProfile = enrichedProfile
      this.phase = 'practice'
      this.currentDifficultyIdx = 0  // 诊断完成，从难度 0 开始
      this.currentGroupIndex = 1
      // 清空 session.answers（避免 125% 正确率 bug）
      this.session.answers = []
      // 清空 adaptiveAnswers（新一轮自适应开始）
      this.adaptiveAnswers = []
      this.session.currentIndex = 0
      savePersistedProfile(enrichedProfile, 'practice')
    },
    setCurrentDifficulty(idx, groupIdx) {
      this.currentDifficultyIdx = idx
      this.currentGroupIndex = groupIdx
    },
    clearAdaptiveEngine() {
      this.currentDifficultyIdx = -1
      this.currentGroupIndex = 0
    },

    nextQuestion() {
      this.session.currentIndex++
    },
    resetPracticeSession() {
      this.session.currentIndex = 0
      this.session.answers = []
      this.session.currentAnswer = ''
      this.session.feedbackType = null
      this.session.selectedOption = null
      this.session.streak = 0
      this.session.currentOptions = []
      // P0 重构：竖式为新标准默认值（参见 PLAN-v2-roadmap.md）
      this.session.displayMode = {
        layout: 'vertical',
        input: 'keypad'
      }
      this.session.startTime = null
      this.session.sessionStartTime = null
      this.session.configSnapshot = null
    },
    resetQuestionInputState() {
      this.session.currentAnswer = ''
      this.session.feedbackType = null
      this.session.selectedOption = null
    },

    // ── Timing helpers ──
    setConfigSnapshot(config) {
      this.session.configSnapshot = config
    },

    startQuestionTimer() {
      this.session.startTime = Date.now()
    },

    endQuestionTimer() {
      const elapsed = Date.now() - (this.session.startTime || Date.now())
      return elapsed
    },

    /**
     * Persist the completed session and its answers to IndexedDB.
     * Called after the last question is answered.
     */
    async saveSessionToDB(evaluations) {
      const answers = this.session.answers
      if (!answers.length) return

      // 按 questionIndex 去重，确保每个问题只算一次
      const seen = new Set()
      const uniqueAnswers = answers.filter(a => {
        const key = a.questionIndex ?? a.equation
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const correctCount = uniqueAnswers.filter(a => a.isCorrect).length
      const totalDuration = Date.now() - (this.session.sessionStartTime || Date.now())

      const sessionData = {
        studentId: 'default',
        config: this.session.configSnapshot || {},
        totalQuestions: uniqueAnswers.length,
        correctCount,
        accuracy: uniqueAnswers.length > 0 ? correctCount / uniqueAnswers.length : 0,
        totalDuration,
        evaluations: evaluations || null
      }

      const answersData = answers.map(a => ({
        equation: a.equation,
        solution: a.solution,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect,
        responseTime: a.responseTime || 0,
        operator: a.operator || '',
        isCarry: a.isCarry || false,
        isBorrow: a.isBorrow || false,
        stepCount: a.stepCount || 1,
        operandMin: a.operandMin ?? 0,
        operandMax: a.operandMax ?? 0,
        timestamp: a.timestamp || Date.now()
      }))

      try {
        const sessionId = await saveSession(sessionData, answersData)
        console.log(`[PracticeStore] Session saved to DB: #${sessionId}, ${answers.length} questions, ${Math.round((correctCount / answers.length) * 100)}% accuracy`)
        return sessionId
      } catch (err) {
        console.error('[PracticeStore] Failed to save session:', err)
        return null
      }
    }
  }
})
