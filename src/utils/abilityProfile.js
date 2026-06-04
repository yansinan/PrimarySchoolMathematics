/**
 * 用户能力画像 — 实时计算 + 持久化
 *
 * 每次答题后调用 computeAndSaveAbilityProfile()，从 store 和 DB 读取当前数据，
 * 重新计算全量画像，同时持久化到 IndexedDB 的 abilitySnapshots 表中。
 *
 * 使用场景：
 *  - handleSubmit 答完一题 → saver.savePerQuestion() → computeAndSave()
 *  - completeAdaptiveGroup 一组完成 → 同上
 *  - completeAssessment 诊断完成 → 同上
 *
 * 输出到 abilitySnapshots 的字段：
 *  - totalQuestions / correctCount / accuracy
 *  - strong / weak（DIAG_LEVELS 等级评估）
 *  - currentLevel / totalLevels / currentLevelLabel
 */

import { saveAbilitySnapshot } from '@/utils/database'
import { usePracticeStore } from '@/stores/practice'
import { DIAG_LEVELS } from '@/utils/diagnostic'
import { DIFFICULTY_LEVELS } from '@/utils/adaptiveEngine'

/**
 * 单等级评估辅助函数
 */
function evaluateLevel(levelId, answers) {
  const la = answers.filter(a => a.level === levelId)
  if (!la.length) return { correct: 0, total: 0, accuracy: 0, hasData: false }
  const correct = la.filter(a => a.isCorrect).length
  const total = la.length
  return { correct, total, accuracy: correct / total, hasData: true }
}

/**
 * 计算当前用户画像并持久化到 DB
 * 无返回值；可在 async 上下文中 fire‑and‑forget 调用
 */
export async function computeAndSaveAbilityProfile() {
  const practiceStore = usePracticeStore()
  const diag = practiceStore.abilityProfile?.diagAnswers || []
  const adaptive = practiceStore.adaptiveAnswers || []
  const all = [...diag, ...adaptive]

  // 整体统计数据
  const totalQuestions = all.length
  const correctCount = all.filter(a => a.isCorrect).length
  const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0

  // 强项/薄弱评估
  const strong = []
  const weak = []
  for (const level of DIAG_LEVELS) {
    const s = evaluateLevel(level.id, diag)
    if (!s.hasData) continue
    if (s.accuracy >= 0.8) strong.push(level.label)
    else if (s.accuracy < 0.5) weak.push(level.label)
  }

  // 等级进度
  const currentLevel = Math.max(1, practiceStore.currentDifficultyIdx + 1)
  const totalLevels = DIFFICULTY_LEVELS.length
  const currentLevelLabel = DIFFICULTY_LEVELS[Math.max(0, practiceStore.currentDifficultyIdx)]?.label || '—'

  const snapshot = {
    studentId: 'default',
    totalQuestions,
    correctCount,
    accuracy: Math.round(accuracy * 10000) / 10000,
    strong,
    weak,
    currentLevel,
    totalLevels,
    currentLevelLabel,
  }

  // 持久化到 DB（fire‑and‑forget）
  try {
    await saveAbilitySnapshot(snapshot)
  } catch (err) {
    console.warn('[AbilityProfile] Save snapshot failed:', err)
  }
}