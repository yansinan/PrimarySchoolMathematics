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

/**
 * Sum responseTime across an answer set = 活跃答题时间之和
 *
 * 区别于 wall-clock (Date.now() - startTime)：
 * - 不含思考间隔、暂停、自评停留
 * - 每道题 responseTime 字段是单条累计（重试不重置 timer）
 *   → 重试 N 次的题只贡献 1 次累计值（最终覆盖值）
 *
 * @param {Array<{responseTime?: number|null}>} answers
 * @returns {number} 总毫秒
 * @example
 *   sumResponseTimes([{responseTime:1000}, {responseTime:2000}]) // → 3000
 *   sumResponseTimes([{responseTime:1000}, {}, {responseTime:null}]) // → 1000
 *   sumResponseTimes([{responseTime:1000}, {responseTime:-500}]) // → 1000 (异常兜底)
 */
export function sumResponseTimes(answers = []) {
  if (!Array.isArray(answers)) return 0
  return answers.reduce((sum, a) => {
    const rt = a?.responseTime
    return sum + (typeof rt === 'number' && rt > 0 ? rt : 0)
  }, 0)
}