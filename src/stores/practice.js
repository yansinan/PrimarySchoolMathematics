import { defineStore } from 'pinia'
import { Answer } from '@/services'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/algorithm/equationParser'

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    generateDrawerVisible: false,
    listPractices: [],
    /** @type {'idle'|'assessment'|'practice'} */
    phase: 'idle',
    /** 当前自适应组序号（0=无）。>=1 表示诊断评估已完成 */
    currentGroupIndex: 0,
    /**
     * 是否已完成真实能力评估（诊断）
     *
     * 由 DB 画像计算，**不随 phase 变化** —— 手动出题会把 phase 设为 'practice'，
     * 若用 phase 推导会让「手动出过题」被误判成「评估已完成」。
     * @see services/abilityProfile.js#hasRealProfile
     */
    hasRealProfile: false,
    /**
     * 当前题单的来源：'adaptive' | 'manual' | 'diagnostic'
     *
     * 为什么要区分：手动出题的题目由用户逐项指定，答题过程中**不能**被自适应引擎
     * 的 adjustNextQuestion 改写（否则用户会看到自己配的题变成别的题）。
     * @see composables/useAdaptiveSession.js#afterAnswer
     */
    listSource: 'adaptive',
    /** 自适应阶段累计答题（按题号追加，跨组不去重） */
    adaptiveAnswers: [],
    /**
     * 等待用户点「开始练习」的准备态。
     * 有画像进入练习页时不立刻出题，先展示学习情况/本次设置/练习重点。
     * 手动出题（Generate.vue 生成题单）会把它置 false 直接进题。
     */
    readyToStart: false,
    /** 当前难度索引（useAdaptiveSession 从 Profile.load() 同步，-1 表示未加载） */
    currentDifficultyIdx: -1,
    /**
     * 「练习档位」被手动改动过的版本号。
     *
     * 家长在设置里指定/清除起点档位后 +1，练习页 watch 它刷新「准备开始」界面。
     * 用 store 中转而不是事件总线：页面与设置抽屉不在同一组件树。
     */
    levelOverrideRevision: 0,
    session: {
      currentIndex: 0,
      answers: [],
      // P2-2: 诊断阶段答题 — 与练习阶段 session.answers 完全隔离
      // 防止诊断 5 道题污染练习统计（避免原 125% bug）
      diagnosticAnswers: [],
      /**
       * 本轮的持久化身份：一轮一个，所有 checkpoint + 最终结算共用。
       * 由 resetPracticeSession 清空、usePracticeSaver 在本轮首次写入时生成。
       */
      practiceSessionId: null,
      /** 本轮首题创建的 practiceSessions 行 id（answer.sessionId 外键指向它），随 practiceSessionId 一起清 */
      sessionDbId: null,
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
      adaptiveConfig: null,      // 自适应引擎专用配置，只在诊断完成时设置，不受 Generate.vue 污染
      /**
       * 用户当前在抽屉里设置的自适应练习量（实时）。
       * adaptiveConfig 是「诊断完成那一刻的快照」，改抽屉不会更新它 ——
       * 于是开始界面和引擎都还在用旧值，表现为「改了配置没反应」。
       * 这里单独存用户的最新设置，读取优先级：
       *   adaptiveTarget（实时设置） > adaptiveConfig（诊断快照） > 默认 10/30
       */
      adaptiveTarget: null
    }
  }),
  getters: {
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
     *
     * 数据源是 hasRealProfile（来自 DB 画像），**不再从 phase 推导** ——
     * 手动出题会把 phase 设为 'practice'，用 phase 推导会让「手动出过题」被误判为已评估。
     */
    assessmentCompleted: (state) => state.hasRealProfile,
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
    /** 设置「是否已完成真实能力评估」（由 DB 画像计算结果写入） */
    setHasRealProfile(value) {
      this.hasRealProfile = !!value
    },
    /** 设置题单来源：'adaptive' | 'manual' | 'diagnostic' */
    setListSource(source) {
      this.listSource = source
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
    clearAdaptiveEngine() {
      this.currentGroupIndex = 0
    },

    /** 设置里改了「起点档位」→ 通知练习页刷新准备界面 */
    bumpLevelOverride() {
      this.levelOverrideRevision++
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
      // 新一轮 = 新的持久化身份。不清的话，同一页面生命周期内第二轮起会复用第一轮的 id：
      //  - Answer.save 按 (practiceSessionId, questionIndex) 判同一答题槽位 → 第二轮第 1 题覆盖第一轮第 1 题
      //  - PracticeSession.list 按 practiceSessionId 去重 → 多轮合并成一条练习记录
      //  - Profile.loadSessionLevels 每个 practiceSessionId 只认首条快照 → 第二轮起丢「本轮起始档位」
      this.session.practiceSessionId = null
      this.session.sessionDbId = null
      this.session._pendingProfileSnapshot = null
    },
    resetQuestionInputState() {
      this.session.currentAnswer = ''
      this.session.feedbackType = null
      this.session.selectedOption = null
    },

    setReadyToStart(val) {
      this.readyToStart = !!val
    },

    /**
     * 记录用户当前设置的自适应练习量（抽屉里一改就调）
     * @param {number} min 最少题数
     * @param {number} max 最多题数
     */
    setAdaptiveTarget(min, max) {
      const lo = Number(min)
      const hi = Number(max)
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return
      if (lo < 1 || hi < 1) return
      this.session.adaptiveTarget = {
        targetMin: Math.floor(lo),
        targetMax: Math.floor(hi),
      }
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
