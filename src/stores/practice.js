import { defineStore } from 'pinia'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/algorithm/equationParser'
// E1: saveSession / sumResponseTimes 已迁 services/sessionPersistence.js
import { LS_KEY_PSM_PROFILE } from '@/constants/storageKeys'
import { sumAnswerScores } from '@/utils/score'

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

export const usePracticeStore = defineStore('practice', {
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
      configSnapshot: null,      // config snapshot from Generate.vue，仅用于数据库统计
      adaptiveConfig: null       // 自适应引擎专用配置，只在诊断完成时设置，不受 Generate.vue 污染
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
    correctCount: (state) => sumAnswerScores(state.session.answers),
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
     *  - session.adaptiveConfig 诊断完成时设置，自适应引擎专用，不受 Generate.vue 污染
     *  - resetPracticeSession 时清空 adaptiveAnswers 和 adaptiveConfig（新一轮开始）
     */
    completeAssessment(profile, diagAnswers, adaptiveOptions = {}) {
      // 把诊断答题（含 level 字段）保存到 abilityProfile.diagAnswers
      // diagAnswers 是调用方传来（防异步竞态），不用 this.session.answers
      const enrichedProfile = {
        ...profile,
        diagAnswers: [...(diagAnswers || this.session.answers)],
      }
      this.abilityProfile = enrichedProfile
      this.phase = 'practice'
      this.currentDifficultyIdx = 0
      this.currentGroupIndex = 1
      // 设置自适应专用配置（不受 configSnapshot 污染）
      this.session.adaptiveConfig = {
        targetMin: Math.max(1, adaptiveOptions.targetMin ?? 10),
        targetMax: Math.min(60, adaptiveOptions.targetMax ?? 30),
      }
      // 清空 session.answers 和 adaptiveAnswers
      this.session.answers = []
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
  }
})
