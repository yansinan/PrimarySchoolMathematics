/**
 * 错题服务（S 层）— v4.0b
 *
 * 基于 services/database.js（v4.0a 薄封装）提供错题 CRUD + DB 查询。
 * 查询结果委托 WrongAnswer.filterBy 做纯函数过滤/排序。
 * DB 写操作（标记修正/删除/清空）直接操作 Dexie。
 *
 * @see ../utils/algorithm/wrongAnswer.js — 过滤逻辑内聚到类
 * @see services/analysis.js — 分析服务用 readonly 视角
 */

import { DB, getAllAnswers } from '@/services/database'
import { WrongAnswer } from '@/utils/algorithm/wrongAnswer'

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
 * @returns {Promise<Array<WrongAnswer>>}
 */
export async function getWrongAnswers(opts = {}) {
  const { studentId = 'default', days = 30, limit = 20, ...rest } = opts
  const all = await getAllAnswers(studentId)
  return WrongAnswer.filterBy(all, { days, limit, ...rest })
}

/**
 * 错题数量统计
 * @param {Object} [opts] — 同 getWrongAnswers
 * @returns {Promise<number>}
 */
export async function countWrongAnswers(opts = {}) {
  const all = await getAllAnswers(opts.studentId || 'default')
  return WrongAnswer.filterBy(all, { ...opts, limit: Infinity }).length
}

/**
 * 按 equation 精确查找错题
 * @param {string} equation
 * @param {string} [studentId='default']
 * @returns {Promise<WrongAnswer|null>}
 */
export async function getWrongAnswerByEquation(equation, studentId = 'default') {
  const all = await getAllAnswers(studentId)
  const found = all.find(a => a.equation === equation && a.isCorrect === false)
  return found ? WrongAnswer.fromJSON(found) : null
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
