/**
 * 错题服务（S 层）— v4.0b
 *
 * 基于 services/database.js（v4.0a 薄封装）提供错题 CRUD + 多维过滤。
 * 读取时通过 Answer.fromJSON(plain) 包成 Answer 实例，所有判断走 getter（isWrong/isFixed）。
 *
 * @see v4-PLAN-error-injection.md § v4.0b
 */
import { DB } from '@/services/databaseInit'
import { Answer } from '@/utils/algorithm/answer'

/**
 * 错题查询（多维过滤，按 timestamp 倒序）
 * @param {Object} [opts]
 * @param {string} [opts.operator]       — '+' '-' '×' '÷'
 * @param {number} [opts.minOperand]     — operandMin ≥
 * @param {number} [opts.maxOperand]     — operandMax ≤
 * @param {number} [opts.days=30]        — 近 N 天
 * @param {number} [opts.limit=20]       — 返回条数
 * @param {boolean} [opts.includeFixed=false] — 是否包含已标记修正的
 * @returns {Promise<Answer[]>} — Answer 实例数组（附 .config）
 */
export async function getWrongAnswers(opts = {}) {
  const { studentId = 'default', operator, minOperand, maxOperand, days = 30, limit = 20, includeFixed = false } = opts
  const all = await Answer.getAllByStudent(studentId)
  const cutoff = Date.now() - days * 864e5
  return all
    .map(plain => Answer.fromJSON(plain))
    .filter(a => !a.isCorrect)
    .filter(a => !operator || a.operator === operator)
    .filter(a => minOperand == null || maxOperand == null
      || ((a.operandMax ?? 0) >= minOperand && (a.operandMin ?? 0) <= maxOperand))
    .filter(a => includeFixed || !a.isFixed)
    .filter(a => (a.timestamp ?? a.startedAt ?? 0) >= cutoff)
    .sort((a, b) => (b.timestamp ?? b.startedAt ?? 0) - (a.timestamp ?? a.startedAt ?? 0))
    .slice(0, limit)
}

/**
 * 错题数量统计
 * @returns {Promise<number>}
 */
export async function countWrongAnswers(opts = {}) {
  const all = await getWrongAnswers({ ...opts, limit: Number.MAX_SAFE_INTEGER })
  return all.length
}

/**
 * 按 equation 精确查找错题
 * @returns {Promise<Answer|null>}
 */
export async function getWrongAnswerByEquation(equation, studentId = 'default') {
  const raw = await Answer.getAllByStudent(studentId)
  const all = raw.map(r => Answer.fromJSON(r))
  const found = all.find(a => a.equation === equation && !a.isCorrect)
  return found || null
}

/**
 * 标记某条错题"已修正"
 * @returns {Promise<boolean>}
 */
export async function markWrongAnswerCorrected(sessionId, questionIndex, corrected = true) {
  const answers = await DB.answers.where('sessionId').equals(sessionId).toArray()
  const target = answers.find(a => a.questionIndex === questionIndex)
  if (!target) return false
  await DB.answers.update(target.id, {
    correctedAt: corrected ? new Date().toISOString() : null
  })
  return true
}

/**
 * 删除单条错题
 * @returns {Promise<boolean>}
 */
export async function removeWrongAnswer(sessionId, questionIndex) {
  const answers = await DB.answers.where('sessionId').equals(sessionId).toArray()
  const target = answers.find(a => a.questionIndex === questionIndex)
  if (!target) return false
  await DB.answers.delete(target.id)
  return true
}

/**
 * 清空某用户全部错题
 * @returns {Promise<number>}
 */
export async function clearWrongAnswers(studentId = 'default') {
  const sessions = await DB.practiceSessions.where('studentId').equals(studentId).toArray()
  const sessionIds = sessions.map(s => s.id)
  if (!sessionIds.length) return 0
  const all = await DB.answers.where('sessionId').anyOf(sessionIds).toArray()
  const instances = all.map(a => new Answer(a))
  const wrongIds = instances.filter(a => !a.isCorrect).map(a => a.id)
  if (!wrongIds.length) return 0
  await DB.answers.bulkDelete(wrongIds)
  return wrongIds.length
}
