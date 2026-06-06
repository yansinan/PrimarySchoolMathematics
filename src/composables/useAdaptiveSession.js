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
import { createAdaptiveEngine, getGroupSize, evaluateGroup, getDifficultyLabel } from '@/utils/algorithm/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/algorithm/adaptiveBatch'
import { getGroupComment, getCommentByRate } from '@/constants/practice'
import { sumAnswerScores } from '@/utils/score'
import { TARGET_LIMITS } from '@/utils/formDefaults'
import { formatDuration } from '@/utils/timeFormat'

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
  const { session, correctCount, isAssessment, totalQuestions, abilityProfile } = storeToRefs(practiceStore)

  // 外部依赖（注入模式，默认从 useXxx() 取）
  const router = options.router || useRouter()
  const statsStore = options.statsStore || useStatsStore()
  const dialogs = options.dialogs || usePracticeDialogs()
  const saver = options.saver || usePracticeSaver()

  // ── 响应式状态 ──
  /** 自适应引擎实例（由 createAdaptiveEngine 创建） */
  const adaptiveEngine = ref(null)
  /** 当前组序号（从 1 开始） */
  const adaptiveGroupIndex = ref(0)
  /** 当前组之前累积的答案数，用于 ProgressSteps 截取本组 */
  const groupAnswerOffset = ref(0)
  /** 当前组内正确题数（只算本组） */
  const groupCorrectCount = computed(() =>
    session.value.answers.slice(groupAnswerOffset.value).filter(a => a.isCorrect).length
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
  function startNewAdaptiveSession() {
    const profile = practiceStore.abilityProfile
    if (!profile) {
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
    // 从 adaptiveConfig 读取（由 completeAssessment 设置，不受 Generate.vue 污染）
    // 退回到 configSnapshot 仅当 adaptiveConfig 不存在时（已接入旧数据的用户）
    const adaptiveConfig = practiceStore.session.adaptiveConfig || {}
    const fallbackConfig = practiceStore.session.configSnapshot || {}
    const targetMin = adaptiveConfig.targetMin ?? fallbackConfig.targetMin ?? 10
    const targetMax = adaptiveConfig.targetMax ?? fallbackConfig.targetMax ?? 30
    const engine = createAdaptiveEngine(profile, targetMin, targetMax)
    adaptiveEngine.value = engine
    adaptiveGroupIndex.value = 1
    // 同步到 store（供 AbilityCard 等其他组件读取）
    practiceStore.setCurrentDifficulty(engine.difficultyIdx, 1)

    practiceStore.resetPracticeSession()
    practiceStore.session.sessionStartTime = Date.now()
    practiceStore.setPhase('practice')

    const size = getGroupSize(engine)
    const questions = generateAdaptiveBatch(engine, size)
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
    const answers = session.value.answers
    const profile = analyzeAbility(answers)
    const answeredCount = answers.length

    ElMessage({
      message: `📊 评估完成！共 ${answeredCount} 题，正确 ${correctCount.value} 题`,
      duration: 3000,
      offset: 100,
      customClass: 'feedback-message'
    })

    // 创建自适应引擎, 生成第 1 组
    // 使用固定默认值 (targetMin=10, targetMax=30),
    // 不读 configSnapshot (属于 Generate.vue, 已被多次污染)。
    // completeAssessment 会把这些默认值写入 adaptiveConfig, 后续组从那读。
    const targetMin = 10
    const targetMax = 30
    const engine = createAdaptiveEngine(profile, targetMin, targetMax)
    adaptiveEngine.value = engine
    adaptiveGroupIndex.value = 1

    const size = getGroupSize(engine)
    const firstQuestions = generateAdaptiveBatch(engine, size)

    // 传入 targetMin/targetMax 到 adaptiveConfig (之后 startNewAdaptiveSession 从这读)
    practiceStore.completeAssessment(profile, { targetMin, targetMax })
    practiceStore.setListPractices(firstQuestions)
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
    const engine = adaptiveEngine.value
    const size = getGroupSize(engine)
    const groupAnswers = allAnswers.slice(-size)
    const groupCorrect = groupAnswers.filter(a => a.isCorrect).length
    const groupTime = groupAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)

    // ── 小组反馈 ──
    const groupIdx = adaptiveGroupIndex.value
    const label = getDifficultyLabel(engine)
    const correctRate = Math.round((groupCorrect / groupAnswers.length) * 100)
    const groupComment = getGroupComment(correctRate, groupTime, groupAnswers.length)

    // ── 强化小组反馈: 弹出自我评价对话框 ──
    let evaluationScore = 3  // 默认 3 = 刚刚好
    try {
      evaluationScore = await dialogs.showSelfEvaluationDialog({
        groupIndex: groupIdx,
        correctCount: groupCorrect,
        totalCount: groupAnswers.length,
        timeText: formatDuration(groupTime),
        comment: groupComment,
      })
    } catch { /* 弹窗关闭异常 → 保持默认 3 */ }

    adaptiveEngine.value.lastEvaluation = evaluationScore

    // 评估并决定下一步
    const result = evaluateGroup(engine, groupAnswers)
    adaptiveEngine.value = result.engine
    adaptiveGroupIndex.value++
    practiceStore.setCurrentDifficulty(result.engine.difficultyIdx, adaptiveGroupIndex.value)

    // ── 实时保存检查点 ──
    practiceStore.adaptiveAnswers = [...practiceStore.adaptiveAnswers, ...allAnswers]
    await saver.saveGroupCheckpoint(result.engine.history)

    // ── 强制兜底: 累积答题超过硬上限 → 直接结束 ──
    const forceDone = practiceStore.adaptiveAnswers.length >= TARGET_LIMITS.absoluteMax

    if (result.done || forceDone) {
      // ── 全部完成 → 弹汇总弹窗 ──
      const finalAnswers = practiceStore.adaptiveAnswers
      const totalCorrect = sumAnswerScores(finalAnswers)
      const totalTime = finalAnswers.reduce((s, a) => s + (a.responseTime || 0), 0)
      const totalRate = Math.round((totalCorrect / finalAnswers.length) * 100)
      const { emoji, comment, color: rateColor2 } = getCommentByRate(totalRate)

      let action = 'close'
      try {
        action = await dialogs.showPracticeSummaryDialog({
          emoji,
          comment,
          totalAnswers: finalAnswers.length,
          correctAnswers: totalCorrect,
          rate: totalRate,
          rateColor: rateColor2,
          totalTime: formatDuration(totalTime),
          confirmText: '开始新一轮',
          cancelText: '📊 分析',
        })
      } catch { /* 弹窗异常 → action 保持 'close' */ }

      // 无论 action 是什么, 都先保存到数据库
      await saver.saveAdaptiveFinal(finalAnswers, (result.engine && result.engine.history) || [])
      practiceStore.setListPractices([])

      if (action === 'confirm') {
        return 'restart'
      } else {
        // 'cancel' 或 'close' 都视为查看分析或返回首页
        const shouldRestart = practiceStore.abilityProfile && action !== 'cancel'
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
    // 关键: 先把本轮答案写回 session.answers (确保组边界数据完整),
    // 再 setListPractices 触发 watch (watch 内 saved = [...session.answers] 拿到完整数据)。
    const nextQuestions = generateAdaptiveBatch(result.engine, result.nextGroupSize)
    groupAnswerOffset.value = allAnswers.length
    session.value.answers = [...allAnswers]
    practiceStore.resetCurrentIndex()
    practiceStore.setListPractices(nextQuestions)
    return 'continue'
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
  }
}
