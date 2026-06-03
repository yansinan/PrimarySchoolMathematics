/**
 * 自适应会话管理 composable
 *
 * 拆分自 Practice.vue 的自适应会话逻辑（Phase 4 渐进式）。
 * 本文件只管理"启动/恢复新一轮"的部分，
 * 其余 handleAssessmentComplete / completeGroup 仍保留在 Practice.vue，
 * 后续 PR 继续迁移。
 *
 * 返回：
 *  - startNewAdaptiveSession(): 启动/恢复新一轮自适应练习
 */

import { ElMessage } from 'element-plus'
import { usePracticeStore } from '@/stores/practice'
import { generateDiagnosticQuestions } from '@/utils/diagnostic'
import { createAdaptiveEngine, getGroupSize } from '@/utils/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/adaptiveBatch'

export function useAdaptiveSession() {
  const practiceStore = usePracticeStore()

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

  return { startNewAdaptiveSession }
}
