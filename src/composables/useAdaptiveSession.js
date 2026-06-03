/**
 * 自适应会话管理 composable
 *
 * 拆分自 Practice.vue 的自适应会话逻辑（Phase 4 渐进式）。
 * 当前 PR 抽取了：
 *  - 响应式状态：adaptiveEngine / adaptiveGroupIndex / groupAnswerOffset / nextLocked
 *  - 方法：startNewAdaptiveSession
 *
 * handleAssessmentComplete / completeGroup 仍保留在 Practice.vue，
 * 后续 PR 继续迁移（避免单 PR 改动过大）。
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { generateDiagnosticQuestions } from '@/utils/diagnostic'
import { createAdaptiveEngine, getGroupSize } from '@/utils/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/adaptiveBatch'

export function useAdaptiveSession() {
  const practiceStore = usePracticeStore()
  const { session } = storeToRefs(practiceStore)

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
    const snapshot = practiceStore.session.configSnapshot || {}
    const targetMin = snapshot.targetMin ?? 10
    const targetMax = snapshot.targetMax ?? 30
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

  return {
    // 状态（ref）
    adaptiveEngine,
    adaptiveGroupIndex,
    groupAnswerOffset,
    groupCorrectCount,
    nextLocked,
    // 方法
    startNewAdaptiveSession,
    // 注：handleAssessmentComplete / completeGroup 仍由 Practice.vue 内部实现
  }
}
