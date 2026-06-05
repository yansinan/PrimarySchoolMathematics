/**
 * 题目得分工具
 *
 * 规则：score = max(0, 1 - (attemptCount - 1) / 3)
 * - 首次答对 = 1
 * - 第二次答对 = 2/3
 * - 第三次答对 = 1/3
 * - 第四次及之后答对 = 0
 * - 答错始终记 0
 */

export function computeScore(attemptCount = 1) {
  const normalizedAttemptCount = Number.isFinite(attemptCount) ? Math.max(1, attemptCount) : 1
  return Math.max(0, 1 - (normalizedAttemptCount - 1) / 3)
}

export function buildAttemptScore(previousAttemptCount = 0, isCorrect = false) {
  const attemptCount = Math.max(1, (Number.isFinite(previousAttemptCount) ? previousAttemptCount : 0) + 1)
  return {
    attemptCount,
    score: isCorrect ? computeScore(attemptCount) : 0,
  }
}

export function getAnswerScore(answer) {
  if (!answer) return 0
  if (typeof answer.score === 'number') return answer.score
  return answer.isCorrect ? 1 : 0
}

export function sumAnswerScores(answers = []) {
  return (answers || []).reduce((sum, answer) => sum + getAnswerScore(answer), 0)
}