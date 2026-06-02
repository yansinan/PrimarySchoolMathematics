import { defineStore } from 'pinia'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/equationParser'
import { saveSession } from '@/utils/database'

const LS_KEY = 'psm_profile'

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
    /** @type {null|{levelScores:Object, weakLevels:string[], allCorrect:boolean}} */
    abilityProfile: saved?.profile || null,
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
    /** 完成诊断、记录能力画像 */
    completeAssessment(profile) {
      this.abilityProfile = profile
      this.phase = 'practice'
      this.session.answers = [] // clear assessment answers
      savePersistedProfile(profile, 'practice')
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
      this.session.displayMode = {
        layout: 'horizontal',
        input: 'options'
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
