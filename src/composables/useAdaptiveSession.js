/**
 * 自适应会话管理 composable
 *
 * 拆分自 Practice.vue 的自适应会话逻辑（Phase 4 渐进式）。
 * 当前 PR 抽取了：
 *  - 响应式状态：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset / nextLocked
 *  - 方法：startNewAdaptiveSession / completeAssessment / completeGroup
 *
 * ARCH § 1.3 业务编排下沉 composable:
 *  - PR-4.3: 抽 handleAssessmentComplete -> completeAssessment (31 行)
 *  - PR-4.4: 抽 completeAdaptiveGroup -> completeGroup (123 行, options 注入)
 *
 * 外部依赖（router / statsStore / dialogs / saver）通过 useAdaptiveSession(options) 注入，
 * 默认从 useXxx() 取；单测/Storybook 可显式覆盖。
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { usePracticeDialogs } from '@/composables/usePracticeDialogs'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { generateDiagnosticQuestions, analyzeAbility } from '@/utils/algorithm/diagnostic'
import { Engine } from '@/services/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/algorithm/adaptiveBatch'
import { Profile, hasRealProfile } from '@/services/abilityProfile'
import { playSfx, tierForRate } from '@/utils/sound/sfx'
import { getGroupComment, getCommentByRate } from '@/constants/practice'
import { sumResponseTimes } from '@/utils/score'
import { TARGET_LIMITS } from '@/utils/form/formDefaults'
import { formatDuration } from '@/utils/time/timeFormat'
import { Answer, WrongAnswer } from '@/services'

/**
 * 自适应会话 composable 工厂
 *
 * @param {object} [options] - 外部依赖注入 (单测/Storybook 覆盖用)
 * @param {object} [options.router] - vue-router 实例
 * @param {object} [options.statsStore] - stats store 实例
 * @param {object} [options.dialogs] - 弹窗 composable 实例
 * @param {object} [options.saver] - 持久化 composable 实例
 * @returns {object} composable API
 */
export function useAdaptiveSession(options = {}) {
  const practiceStore = usePracticeStore()
  const { session, correctCount, isAssessment, totalQuestions } = storeToRefs(practiceStore)

  // 外部依赖（注入模式，默认从 useXxx() 取）
  const router = options.router || useRouter()
  const statsStore = options.statsStore || useStatsStore()
  const dialogs = options.dialogs || usePracticeDialogs()
  let _profileForSaver = null
  const saver = options.saver || usePracticeSaver(() => _profileForSaver)


  /** 自适应引擎实例（由 createAdaptiveEngine 创建） */
  const adaptiveEngine = ref(null)
  /** 当前组序号（从 1 开始） */
  const adaptiveGroupIndex = ref(0)
  /** 当前组之前累积的答案数，用于 ProgressSteps 截取本组 */
  const groupAnswerOffset = ref(0)
  /** 当前组内正确题数（只算本组，走 getter：userAnswer===solution） */
  const groupCorrectCount = computed(() =>
    isAssessment.value
      ? Answer.sumScores(session.value.diagnosticAnswers)
      : Answer.sumScores(session.value.answers.slice(groupAnswerOffset.value))
  )
  /** 防止 handleNext 重复调用（choice 模式 + setTimeout 同时触发） */
  const nextLocked = ref(false)

  /**
   * 当前阶段展示标签（封装 4 个分支的 currentStage 计算）
   * 等价于 V 层原 L172-186 的 currentStage computed
   * @returns {import('vue').ComputedRef<string>}
   */
  const stageName = computed(() => {
    if (isAssessment.value) {
      // P2-2: 诊断答案已隔离到 diagnosticAnswers
      return `能力评估 ${session.value.diagnosticAnswers.length}/${totalQuestions.value}`
    }
    if (adaptiveEngine.value) {
      const engine = adaptiveEngine.value
      const label = engine.getDifficultyLabel()
      const groupIdx = adaptiveGroupIndex.value
      // 自适应没有固定组数（练够本轮目标题量就结束，可能提前收尾），
      // 所以不给「共 N 组」这种会变的估计值，改成显示本轮已完成题量。
      const answered = engine.totalAnswered || 0
      const target = engine.targetMax || 0
      const round = target > 0 ? ` · ${Math.min(answered, target)}/${target} 题` : ''
      return `${label} · 第 ${groupIdx} 组${round}`
    }
    return '一年级'
  })

  /**
   * 启动新诊断（生成诊断题 + 启动评估）
   * 替代 V 层直接调 generateDiagnosticQuestions + startAssessment
   * 语义与 V 层原 onMounted L724-735 + watch L527-545 完全等价
   * @returns {void}
   */
  const startNewDiagnosticSession = () => {
    const questions = generateDiagnosticQuestions()
    if (questions.length > 0) {
      practiceStore.startAssessment(questions)
    }
  }

  /**
   * 启动新一轮自适应练习
   * - 已有能力画像：基于画像直接生成新一轮
   * - 没有画像：进入空闲态，重新生成诊断题开始评估
   */
  async function startNewAdaptiveSession() {
    // 新一轮开始音效（handleStartPractice 里已有一声 start，靠 sfx 的 1.2s 节流去重）
    playSfx('start')
    if (!practiceStore.assessmentCompleted) {
      // 无画像 → 重新评估
      practiceStore.setPhase('idle')
      practiceStore.clearAdaptiveEngine()
      practiceStore.setListPractices([])
      const questions = generateDiagnosticQuestions()
      if (questions.length > 0) {
        practiceStore.startAssessment(questions)
      }
      return
    }

    // 基于已有画像生成新一轮练习
    // 练习量优先级：adaptiveTarget（抽屉里当前设置，实时）> adaptiveConfig（诊断快照）> configSnapshot > 默认
    const liveTarget = practiceStore.session.adaptiveTarget
    const adaptiveConfig = practiceStore.session.adaptiveConfig || {}
    const fallbackConfig = practiceStore.session.configSnapshot || {}
    const targetMin = liveTarget?.targetMin ?? adaptiveConfig.targetMin ?? fallbackConfig.targetMin ?? 10
    const targetMax = liveTarget?.targetMax ?? adaptiveConfig.targetMax ?? fallbackConfig.targetMax ?? 30

    // 从 DB 加载画像作为唯一事实源
    const dbProfile = await Profile.load()
    const engine = new Engine({
      difficultyIdx: dbProfile.difficultyIdx,
      strongLevelIndices: dbProfile.strongLevelIndices,
      weakLevelIndices: dbProfile.weakLevelIndices,
      targetMin,
      targetMax,
    })
    // 暂存 profile 快照（第一题写入时一并创建 session）——
    // 必须放在 resetPracticeSession 之后，它会清掉上一轮没消费掉的快照
    _profileForSaver = dbProfile
    engine.wrongAnswerPool = await WrongAnswer.loadPool(dbProfile)
    adaptiveEngine.value = engine
    adaptiveGroupIndex.value = 1
    // 同步到 store
    practiceStore.currentGroupIndex = 1
    practiceStore.currentDifficultyIdx = dbProfile.difficultyIdx

    // 新一轮：清状态 + 换新的 practiceSessionId（见 stores/practice.js#resetPracticeSession）
    practiceStore.resetPracticeSession()
    practiceStore.session._pendingProfileSnapshot = dbProfile.snapshot()
    practiceStore.session.sessionStartTime = Date.now()
    // 本轮配置快照：只用于练习记录展示（起始档位 / 题量目标）。
    // 自适应轮不经过 Generate，不写这里，记录列表里难度显示「—」、完成度只能按默认 30 题猜。
    practiceStore.session.configSnapshot = {
      mode: 'adaptive',
      difficultyIdx: dbProfile.difficultyIdx,
      targetMin,
      targetMax,
    }
    practiceStore.setPhase('practice')

    const size = engine.getGroupSize()
    // P5: 生成排列方案 → 按方案出题
    // startNewAdaptiveSession 时 groupIndex=1（G1=confidence）
    const plan = engine.generateQuestionPlan(1, size, false)
    const questions = generateAdaptiveBatch(engine, size, plan)
    practiceStore.setListSource('adaptive')
    practiceStore.setListPractices(questions)

    ElMessage({
      message: '🔄 新一轮开始！加油！',
      duration: 2000,
      offset: 100,
      customClass: 'feedback-message'
    })
  }

  /**
   * PR-4.3: 诊断完成 → 分析能力 → 启动自适应练习
   *
   * 抽离自 Practice.vue L438-468 (31 行) handleAssessmentComplete:
   *   - 分析能力 (analyzeAbility)
   *   - ElMessage 评估完成提示
   *   - 创建自适应引擎 (固定 targetMin=10, targetMax=30 默认值)
   *   - 同步到 store (setListPractices / completeAssessment)
   *
   * @returns {Promise<void>}
   */
  async function completeAssessment() {
    // P2-2: 诊断答案已隔离到 diagnosticAnswers
    const snapshot = [...session.value.diagnosticAnswers]
    const answeredCount = snapshot.length
    const profile = analyzeAbility(snapshot)

    playSfx('assess')
    ElMessage({
      message: `📊 评估完成！共 ${answeredCount} 题，正确 ${correctCount.value} 题`,
      duration: 3000,
      offset: 100,
      customClass: 'feedback-message'
    })

    // 先存 store（completeAssessment 保存 profile、写诊断答案到 DB）
    // 题量读用户在抽屉里设的自适应练习量，不能硬编码 —— 否则设「最多 10 题」也会按 30 题跑
    // 诊断完成时也以用户当前设置为准（否则刚改完设置去做诊断又会被旧值覆盖）
    const liveTarget = practiceStore.session.adaptiveTarget
    const cfg = practiceStore.session.adaptiveConfig || practiceStore.session.configSnapshot || {}
    const targetMin = liveTarget?.targetMin ?? cfg.targetMin ?? 10
    const targetMax = liveTarget?.targetMax ?? cfg.targetMax ?? 30
    practiceStore.completeAssessment(profile, snapshot, { targetMin, targetMax })

    // 从 DB 加载画像创建引擎（诊断答案已由 savePerQuestion 写入 DB）
    const dbProfile = await Profile.load()
    // 诊断完成 → 放行抽屉入口（以 DB 画像为准，而不是无条件置 true）
    practiceStore.setHasRealProfile(hasRealProfile(dbProfile))
    const engine = new Engine({
      difficultyIdx: dbProfile.difficultyIdx,
      strongLevelIndices: dbProfile.strongLevelIndices,
      weakLevelIndices: dbProfile.weakLevelIndices,
      targetMin,
      targetMax,
    })
    _profileForSaver = dbProfile
    // 暂存 profile 快照（第一题写入时一并创建 session）
    practiceStore.session._pendingProfileSnapshot = dbProfile.snapshot()
    engine.wrongAnswerPool = await WrongAnswer.loadPool(dbProfile)
    adaptiveEngine.value = engine
    adaptiveGroupIndex.value = 1
    practiceStore.currentDifficultyIdx = dbProfile.difficultyIdx

    // 诊断完成后不立刻出题：回到准备界面，让学生看清这轮练什么再点「开始练习」。
    // 引擎已就绪，startNewAdaptiveSession 会在点开始时重建一套干净的会话。
    practiceStore.setReadyToStart(true)
    // 清空诊断题单，否则 currentQuestion 仍是最后一道诊断题，模板会继续显示答题卡
    practiceStore.setListPractices([])
  }

  /**
   * PR-4.4: 自适应一组完成 → 评估 → 生成下一组或结束
   *
   * 抽离自 Practice.vue L469-625 (157 行) completeAdaptiveGroup:
   *   - 小组反馈 (correctRate / groupTime)
   *   - 弹出自我评价对话框 (dialogs.showSelfEvaluationDialog)
   *   - 评估下一步 (evaluateGroup)
   *   - 实时保存检查点 (saver.saveGroupCheckpoint)
   *   - 整轮完成 → 汇总弹窗 → 路由跳转
   *
   * 外部依赖通过 options 注入 (router / statsStore / dialogs / saver):
   *   - 默认从 useXxx() 注入, 单测/Storybook 可覆盖
   *
   * @returns {Promise<'continue' | 'done' | 'restart'>}
   *   - 'continue': 生成下一组
   *   - 'done': 整轮完成, 弹窗已关, 路由已 push
   *   - 'restart': 弹窗 'confirm' 触发了新一轮 (调用方应返回不跳页)
   */
  async function completeGroup() {
    const allAnswers = [...session.value.answers]
    const instances = allAnswers.map(a => a instanceof Answer ? a : new Answer(a))
    const engine = adaptiveEngine.value
    // 手动题单：这一轮的全部答案就是这一组，不能按自适应组大小切
    //（原实现一律用 engine.lastGroupSize，手动出 6 题、上次自适应组是 4 题时，
    //  只评了后 4 题 → 弹窗显示 4/4，且 evaluateGroup 拿到残缺数据）
    const isManualList = practiceStore.listSource === 'manual'
    // 用持久化的 lastGroupSize，不重新调 getGroupSize（防随机抖动导致切片错位）
    const size = isManualList ? allAnswers.length : (engine.lastGroupSize || engine.getGroupSize())
    const groupAnswers = instances.slice(-size)
    const groupCorrect = groupAnswers.filter(a => a.isCorrect).length
    const groupTime = sumResponseTimes(groupAnswers)

    // ── 小组反馈 ──
    const groupIdx = adaptiveGroupIndex.value
    const label = engine.getDifficultyLabel()
    const correctRate = Math.round((groupCorrect / groupAnswers.length) * 100)
    const groupComment = getGroupComment(correctRate, groupTime, groupAnswers.length)

    // ── 强化小组反馈: 弹出自我评价对话框 ──
    let evaluationScore = 3  // 默认 3 = 刚刚好
    try {
      playSfx('group', { perfect: groupAnswers.length > 0 && groupCorrect === groupAnswers.length })
      evaluationScore = (await dialogs.showSelfEvaluationDialog({
        groupIndex: groupIdx,
        correctCount: groupCorrect,
        totalCount: groupAnswers.length,
        timeText: formatDuration(groupTime),
        comment: groupComment,
      })) ?? 3
    } catch { /* 弹窗关闭异常 → 保持默认 3 */ }

    adaptiveEngine.value.lastEvaluation = evaluationScore

    // 评估并决定下一步
    const prevDifficultyIdx = engine.difficultyIdx
    const result = engine.evaluateGroup(groupAnswers)
    adaptiveEngine.value = result.engine
    // 升档奖励音：错开组完成音（group 约 200ms）与自我评价弹窗
    if (result.engine.difficultyIdx > prevDifficultyIdx) {
      setTimeout(() => playSfx('levelup'), 320)
    }
    adaptiveGroupIndex.value++
    practiceStore.currentGroupIndex = adaptiveGroupIndex.value

    // ── 组 checkpoint：自我评价一落定就写 DB ──
    // 放在组边界的画像刷新之前：evaluateGroup 只依赖内存数据，先落库，
    // 后面任何一步读库失败都不会丢掉这一组已经产生的评价。
    await saver.saveGroupCheckpoint(result.engine.history)

    // ── 组边界刷新画像（一次 DB 查询），更新 engine.profile（强/弱项列表 getter 委派到 profile） ──
    // 注意：engine.difficultyIdx（engine 自身字段，由 evaluateGroup / adjustNextQuestion 维护）
    // 与 dbProfile.difficultyIdx（Profile 实例字段，computeDifficultyIdx 从 DB 全集计算）
    // 是两个独立变量。组边界只刷 profile 的强弱项列表，不覆盖 engine 自身的运行时难度。
    const dbProfile = await Profile.load()
    adaptiveEngine.value.profile = dbProfile
    practiceStore.currentDifficultyIdx = adaptiveEngine.value.difficultyIdx

    // ── 强制兜底: 累积答题超过硬上限 → 直接结束 ──
    const forceDone = allAnswers.length >= TARGET_LIMITS.absoluteMax

    if (result.done || forceDone) {
      // ── 整轮完成：先算汇总（纯内存）→ 立即落库 → 最后弹总结 ──
      const finalAnswers = allAnswers
      // 要「答对几题」，不是掌握分（sumScores 会给出 1.666 这类小数）
      const totalCorrect = finalAnswers.filter(a => (a instanceof Answer ? a.isCorrect : Answer.isCorrect(a))).length
      // 用时用「整轮开始时间 → 现在」的墙上时间，而不是逐题 responseTime 之和。
      // 后者不含组间自我评价弹窗、页面生成等待，家长看到的数比真实耗时要短。
      const startedAt = practiceStore.session.sessionStartTime
      const totalTime = startedAt ? (Date.now() - startedAt) : sumResponseTimes(finalAnswers)
      const totalRate = Math.round((totalCorrect / finalAnswers.length) * 100)
      // 结束音效按成绩分档：优秀 / 一般 / 鼓励（不评判）
      playSfx('complete', { tier: tierForRate(totalRate) })
      const { emoji, comment, color: rateColor2 } = getCommentByRate(totalRate)

      // 最终结算先落库：总结弹窗上的按钮不产生任何数据，保存不能等它。
      // 否则弹窗开着时关标签页 / 崩溃，这一轮就永远没有 completed 标记和最终快照。
      // （手动练习 handlePracticeComplete 一直是先存后弹，这里对齐）
      const profile = _profileForSaver
      const history = (result.engine && result.engine.history) || []
      const evaluations = (history || [])
        .filter(h => h.evaluation != null)
        .map(h => ({ group: h.groupIdx, score: h.evaluation }))
      await saver.saveSessionFinal({
        evaluations: evaluations.length ? JSON.stringify(evaluations) : null,
        finalProfileSnapshot: profile?.snapshot ? profile.snapshot() : null,
      })

      // ── 汇总弹窗（纯展示，不产生数据） ──
      let action = 'close'
      try {
        action = await dialogs.showPracticeSummaryDialog({
          emoji,
          comment,
          totalAnswers: finalAnswers.length,
          correctAnswers: totalCorrect,
          rate: totalRate,
          rateColor: rateColor2,
          totalTime: formatDuration(totalTime, { roundSeconds: true }),
          confirmText: '开始新一轮',
          cancelText: '📊 分析',
        })
      } catch { /* 弹窗异常 → action 保持 'close' */ }

      practiceStore.setListPractices([])

      if (action === 'confirm') {
        adaptiveEngine.value = null
        adaptiveGroupIndex.value = 0
        groupAnswerOffset.value = 0
        return 'restart'
      } else {
        // 'cancel' 或 'close' 都视为查看分析或返回首页
        const shouldRestart = practiceStore.assessmentCompleted && action !== 'cancel'
        adaptiveEngine.value = null
        adaptiveGroupIndex.value = 0
        groupAnswerOffset.value = 0
        if (shouldRestart) {
          return 'restart'
        }
        router.push('/home')
        if (action === 'cancel') {
          setTimeout(() => statsStore.openDrawer(), 300)
        }
        return 'done'
      }
    }

    // ── 生成下一组 ──
    // P5: 预测是否为最后一组（totalAnswered + 组大小×1.5 >= targetMax）
    // 关键: 先把本轮答案写回 session.answers (确保组边界数据完整),
    // 再 setListPractices 触发 watch (watch 内 saved = [...session.answers] 拿到完整数据)。
    const nextEngine = result.engine
    const nextSize = result.nextGroupSize
    const isLast = nextEngine.totalAnswered + nextSize * 1.5 >= nextEngine.targetMax
    const nextPlan = nextEngine.generateQuestionPlan(adaptiveGroupIndex.value, nextSize, isLast)
    const nextQuestions = generateAdaptiveBatch(nextEngine, nextSize, nextPlan)
    nextEngine.lastGroupSize = nextQuestions.length  // 持久化实际生成题数，供下次 completeGroup 切片用
    groupAnswerOffset.value = allAnswers.length
    session.value.answers = [...allAnswers]
    practiceStore.resetCurrentIndex()
    practiceStore.setListSource('adaptive')
    practiceStore.setListPractices(nextQuestions)
    return 'continue'
  }

  /**
   * P5: 答完一题后触发 — 封装动态微调（C 层中转，避免 V 层直接 import U 层）
   * 由 Practice.vue handleNext 中调用
   */
  async function afterAnswer() {
    // 手动出题的题单不做「动态微调」：用户逐项指定的题目必须原样保留，
    // 只有自适应题单才允许 adjustNextQuestion 改写下一题。
    if (practiceStore.listSource !== 'adaptive') return
    if (!adaptiveEngine.value) return
    const eng = adaptiveEngine.value
    const profile = _profileForSaver || eng.profile
    const roundAnswers = [...session.value.answers]

    // 加载错题池（读 profile.masteryMap，不再 getAll）
    if (profile) {
      eng.wrongAnswerPool = await WrongAnswer.loadPool(profile)
    }

    adaptiveEngine.value.adjustNextQuestion(
      roundAnswers,
      practiceStore.session.currentIndex,
      practiceStore.listPractices
    )
  }

  return {
    // 状态（ref）
    adaptiveEngine,
    adaptiveGroupIndex,
    groupAnswerOffset,
    groupCorrectCount,
    nextLocked,
    // 计算属性
    stageName,                  // P2.2: 替代 V 层 currentStage computed
    // 方法
    startNewAdaptiveSession,
    startNewDiagnosticSession,  // P2.3: 替代 V 层 generateDiagnosticQuestions + startAssessment 直调
    completeAssessment,
    completeGroup,
    afterAnswer,                // P5: 答完一题动态微调
  }
}
