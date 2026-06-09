/**
 * 错题服务（S 层）— v4.0b
 *
 * 基于 services/database.js（v4.0a 薄封装）提供错题 CRUD + 多维过滤。
 * 读取时通过 Answer.fromJSON(plain) 包成 Answer 实例，所有判断走 getter（isWrong/isFixed）。
 *
 * 与 services/analysis.js#getWrongAnswers 关系：分析服务用 readonly 视角
 * （拼接题目表，做统计），本服务是错题"全生命周期"管理（查/标修正/删/清空）。
 *
 * 调用方：import { getWrongAnswers } from '@/services/wrongAnswerService'
 *
 * @see v4-PLAN-error-injection.md § v4.0b
 * @see utils/algorithm/answer.js Answer 类
 */

import { DB, getAllAnswers } from '@/services/database'
import { Answer } from '@/utils/algorithm/answer'

/**
 * 错题查询（多维过滤，按 timestamp 倒序）
 * @param {Object} [opts]
 * @param {string} [opts.studentId='default']
 * @param {string} [opts.operator]       — '+' '-' '×' '÷'
 * @param {number} [opts.minOperand]     — operandMin ≥
 * @param {number} [opts.maxOperand]     — operandMax ≤
 * @param {number} [opts.days=30]        — 近 N 天
 * @param {number} [opts.limit=20]       — 返回条数
 * @param {boolean} [opts.includeFixed=false] — 是否包含已标记修正的
 * @returns {Promise<Array<Answer>>} — Answer 实例数组（isWrong/isFixed getter）
 */
export async function getWrongAnswers(opts = {}) {
  const {
    studentId = 'default',
    operator,
    minOperand,
    maxOperand,
    days = 30,
    limit = 20,
    includeFixed = false,
  } = opts

  const all = await getAllAnswers(studentId)
  const cutoff = Date.now() - days * 864e5

  return all
    .map(plain => Answer.fromJSON(plain))   // ← 包成 Answer 实例
    .filter(a => !a.isCorrect)              // ← 仅"用户答错过"（含已修正的）
    .filter(a => !operator || a.operator === operator)
    // operand 范围"重叠"语义：错题 [minQ, maxQ] 与查询 [minF, maxF] 有交集
    .filter(a => minOperand == null || maxOperand == null
      || ((a.operandMax ?? 0) >= minOperand && (a.operandMin ?? 0) <= maxOperand))
    .filter(a => includeFixed || !a.isFixed)  // ← 用 getter
    .filter(a => (a.timestamp ?? a.startedAt ?? 0) >= cutoff)
    .sort((a, b) => (b.timestamp ?? b.startedAt ?? 0) - (a.timestamp ?? a.startedAt ?? 0))
    .slice(0, limit)
}

/**
 * 错题数量统计
 * @param {Object} [opts] — 同 getWrongAnswers
 * @returns {Promise<number>}
 */
export async function countWrongAnswers(opts = {}) {
  const all = await getWrongAnswers({ ...opts, limit: Number.MAX_SAFE_INTEGER })
  return all.length
}

/**
 * 按 equation 精确查找错题
 * @param {string} equation
 * @param {string} [studentId='default']
 * @returns {Promise<Answer|null>}
 */
export async function getWrongAnswerByEquation(equation, studentId = 'default') {
  const all = await getAllAnswers(studentId)
  const found = all.find(a => a.equation === equation && a.isCorrect === false)
  return found ? Answer.fromJSON(found) : null
}

/**
 * 标记某条错题"已修正"（学生后来答对 → 不再算错题）
 *
 * @param {number} sessionId
 * @param {number} questionIndex
 * @param {boolean} [corrected=true] — false 表示"取消修正"（恢复为错题）
 * @returns {Promise<boolean>} 是否找到并标记成功
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
 * 删除单条错题（从 db.answers 物理删除）
 * @param {number} sessionId
 * @param {number} questionIndex
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
 * @param {string} [studentId='default']
 * @returns {Promise<number>} 删除条数
 */
export async function clearWrongAnswers(studentId = 'default') {
  const sessions = await DB.practiceSessions.where('studentId').equals(studentId).toArray()
  const sessionIds = sessions.map(s => s.id)
  if (!sessionIds.length) return 0

  const answers = await DB.answers.where('sessionId').anyOf(sessionIds).toArray()
  const wrongIds = answers.filter(a => !a.isCorrect).map(a => a.id)
  if (!wrongIds.length) return 0

  await DB.answers.bulkDelete(wrongIds)
  return wrongIds.length
}
