/**
 * 自适应会话管理 composable
 *
 * 拆分自 Practice.vue 的自适应会话逻辑（Phase 4 渐进式）。
 * 当前 PR 抽取了：
 *  - 响应式状态：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset / nextLocked
 *  - 方法：startNewAdaptiveSession / completeAssessment
 *
 * handleAssessmentComplete 已在 PR-4.3 抽到 completeAssessment。
 * completeGroup 仍保留在 Practice.vue，后续 PR-4.4 继续迁移。
 *
 * ARCH § 1.3 业务编排下沉 composable。
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { generateDiagnosticQuestions, analyzeAbility } from '@/utils/diagnostic'
import { createAdaptiveEngine, getGroupSize } from '@/utils/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/adaptiveBatch'

export function useAdaptiveSession() {
  const practiceStore = usePracticeStore()
  const { session, correctCount } = storeToRefs(practiceStore)

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

  return {
    // 状态（ref）
    adaptiveEngine,
    adaptiveGroupIndex,
    groupAnswerOffset,
    groupCorrectCount,
    nextLocked,
    // 方法
    startNewAdaptiveSession,
    completeAssessment,
    // 注：completeGroup 仍由 Practice.vue 内部实现 (PR-4.4 续抽)
  }
}
