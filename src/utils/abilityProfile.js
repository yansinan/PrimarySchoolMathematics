/**
 * 用户能力画像 — 实时计算 + 持久化
 *
 * **架构合规修正**（P2 阶段 16）：
 * - 原本：U 层引 M 层 store（U→M 违规）
 * - 现在：纯函数化，caller 传 store 数据进来（符合 § 1.2 U 不引 M）
 *
 * 使用：
 *   // caller（composable）从 store 拿数据后传进来
 *   computeAndSaveAbilityProfile({
 *     diagAnswers: store.abilityProfile?.diagAnswers,
 *     adaptiveAnswers: store.adaptiveAnswers,
 *     currentDifficultyIdx: store.currentDifficultyIdx,
 *   })
 *
 * 输出到 abilitySnapshots：
 *  - totalQuestions / correctCount / accuracy（用 score 字段算）
 *  - strong / weak（DIAG_LEVELS 等级评估）
 *  - currentLevel / totalLevels / currentLevelLabel
 */

import { saveAbilitySnapshot } from '@/utils/database'
import { DIAG_LEVELS } from '@/utils/diagnostic'
import { DIFFICULTY_LEVELS } from '@/utils/adaptiveEngine'
import { sumAnswerScores } from '@/utils/score'

/**
 * 单等级评估辅助函数
 */
function evaluateLevel(levelId, answers) {
  const la = answers.filter(a => a.level === levelId)
  if (!la.length) return { correct: 0, total: 0, accuracy: 0, hasData: false }
  const correct = la.filter(a => a.isCorrect === true).length
  const total = la.length
  return { correct, total, accuracy: sumAnswerScores(la) / total, hasData: true }
}

/**
 * 计算当前用户画像并持久化到 DB
 * 纯函数：caller 传 store 数据，U 层不引 M 层
 *
 * @param {object} opts
 * @param {Array} [opts.diagAnswers=[]]
 * @param {Array} [opts.adaptiveAnswers=[]]
 * @param {number} [opts.currentDifficultyIdx=-1]
 * @param {string} [opts.studentId='default']
 * @returns {Promise<void>}
 */
export async function computeAndSaveAbilityProfile({
  diagAnswers = [],
  adaptiveAnswers = [],
  currentDifficultyIdx = -1,
  studentId = 'default',
} = {}) {
  const all = [...diagAnswers, ...adaptiveAnswers]

  const totalQuestions = all.length
  const correctCount = sumAnswerScores(all)
  const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0

  const strong = []
  const weak = []
  for (const level of DIAG_LEVELS) {
    const s = evaluateLevel(level.id, diagAnswers)
    if (!s.hasData) continue
    if (s.accuracy >= 0.8) strong.push(level.label)
    else if (s.accuracy < 0.5) weak.push(level.label)
  }

  const currentLevel = Math.max(1, currentDifficultyIdx + 1)
  const totalLevels = DIFFICULTY_LEVELS.length
  const currentLevelLabel = DIFFICULTY_LEVELS[Math.max(0, currentDifficultyIdx)]?.label || '—'

  const snapshot = {
    studentId,
    totalQuestions,
    correctCount,
    accuracy: Math.round(accuracy * 10000) / 10000,
    strong,
    weak,
    currentLevel,
    totalLevels,
    currentLevelLabel,
  }

  try {
    await saveAbilitySnapshot(snapshot)
  } catch (err) {
    console.warn('[AbilityProfile] Save snapshot failed:', err)
  }
}
