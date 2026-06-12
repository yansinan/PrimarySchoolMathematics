import { defineStore } from 'pinia'
import { Answer } from '@/services'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/algorithm/equationParser'

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    generateDrawerVisible: false,
    listPractices: [],
    /** @type {'idle'|'assessment'|'practice'} */
    phase: 'idle',
    /** 当前自适应组序号（0=无）。>=1 表示诊断评估已完成（assessmentCompleted getter 的计算依据） */
    currentGroupIndex: 0,
    /** 自适应阶段累计答题（按题号追加，跨组不去重） */
    adaptiveAnswers: [],
    /** 当前难度索引（由 loadProfile 从 DB 计算，-1 表示未加载） */
    currentDifficultyIdx: -1,
    session: {
      currentIndex: 0,
      answers: [],
      // P2-2: 诊断阶段答题 — 与练习阶段 session.answers 完全隔离
      // 防止诊断 5 道题污染练习统计（避免原 125% bug）
      diagnosticAnswers: [],
      practiceSessionId: null,
      sessionDbId: null,          // 对应 DB practiceSessions 表的 auto id (FK)
      _pendingProfileSnapshot: null,  // 练习开始时暂存的 profile 快照（第一题写入时一并入库）
      lastSavedAnswerCount: 0,
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
    // P2-2: 按 phase 分支读不同字段
    // assessment 阶段读 diagnosticAnswers（诊断题），practice 阶段读 answers（练习题）
    correctCount: (state) => state.phase === 'assessment'
      ? Answer.sumScores(state.session.diagnosticAnswers)
      : Answer.sumScores(state.session.answers),
    /** 是否处于诊断模式 */
    isAssessment: (state) => state.phase === 'assessment',
    /** 是否处于正常练习模式 */
    isPractice: (state) => state.phase === 'practice',
    /** 是否空闲（未开始任何测试/练习） */
    isIdle: (state) => state.phase === 'idle',
    /** 诊断进度文字 */
    diagnosticProgress: (state) => {
      if (state.phase !== 'assessment') return ''
      const done = state.session.diagnosticAnswers.length
      const total = state.listPractices.length
      return `能力评估 ${done}/${total}`
    },
    /**
     * 诊断评估是否已完成。
     * phase === 'practice' 表示 completeAssessment 已执行过且进入练习模式。
     * 不额外存字段，phase 在 completeAssessment 时持久化到 localStorage。
     */
    assessmentCompleted: (state) => state.phase === 'practice',
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
    },
    /** 启动诊断模式并载入诊断题 */
    startAssessment(questions) {
      this.phase = 'assessment'
      this.listPractices = questions
      // P2-2: 重置 diagnosticAnswers（新一组诊断题不混旧数据）
      this.session.diagnosticAnswers = []
      this.resetPracticeSession()
    },
    /**
     * 完成诊断、记录能力画像
     *
     * 数据流设计：
     *  - session.answers 只装"练习阶段"题（自适应各组）
     *  - session.diagnosticAnswers 只装"诊断阶段"题（5 道诊断题）
     *  - P2-2：两个字段完全隔离，无需在 completeAssessment 中清 session.answers
     *    （诊断阶段本来就只写 diagnosticAnswers，没污染 answers）
     *  - session.adaptiveConfig 诊断完成时设置，自适应引擎专用
     */
    completeAssessment(profile, diagAnswers, adaptiveOptions = {}) {
      this.phase = 'practice'
      this.currentGroupIndex = 1
      // 设置自适应专用配置（不受 configSnapshot 污染）
      this.session.adaptiveConfig = {
        targetMin: Math.max(1, adaptiveOptions.targetMin ?? 10),
        targetMax: Math.min(60, adaptiveOptions.targetMax ?? 30),
      }
      // P2-2: 不需要清 session.answers（它本来就没写诊断数据）
      // 同样清掉 diagnosticAnswers，下一轮可能重新诊断
      this.session.diagnosticAnswers = []
      this.session.currentIndex = 0
    },
    setCurrentDifficulty(idx, groupIdx) {
      this.currentGroupIndex = groupIdx
    },
    clearAdaptiveEngine() {
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
