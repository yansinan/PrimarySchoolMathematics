/**
 * PracticeSession 域类 + CRUD（S 层）
 *
 * 扩展 databaseInit.PracticeSession 骨架类，聚合 session 相关数据访问。
 * - isCorrect / score 字段不写入（getter 即真理）
 *
 * @see services/databaseInit.js — DB 实例 + Schema 骨架 + DB 级操作（export/import/clear）
 */

import { DB, PracticeSession as SchemaSession } from './databaseInit'
import { Answer } from '@/utils/algorithm/answer'
import { sumResponseTimes } from '@/utils/score'

// ─── Domain Class ──────────────────────────────────────────────────────────

export class PracticeSession extends SchemaSession {
  constructor(overrides = {}) {
    super()
    Object.assign(this, overrides)
  }

  /**
   * 本 session 关联的所有答案（Answer 实例，走 getter）
   * @returns {Promise<import('@/utils/algorithm/answer').Answer[]>}
   */
  async getAnswers() {
    const raws = await DB.answers.where('sessionId').equals(this.id).sortBy('timestamp')
    return raws.map(r => Answer.fromJSON(r))
  }

  /**
   * 从本 session 的 raw answers 实时算统计（不存 DB）
   *
   * 支持两种调用方式：
   *   1) await session.computeStats()           — 自动从 DB 读
   *   2) await session.computeStats(rawAnswers)  — 复用已有数据
   *
   * @param {Array} [rawAnswers] — 可选的预加载答案数组，避免重复读 DB
   * @returns {Promise<{totalQuestions:number, correctCount:number, accuracy:number, totalDuration:number}>}
   */
  async computeStats(rawAnswers = null) {
    const answers = rawAnswers
      ? rawAnswers.map(r => r instanceof Answer ? r : Answer.fromJSON(r))
      : await this.getAnswers()
    const seen = new Set()
    const unique = answers.filter(a => {
      const key = a.questionIndex ?? a.equation
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const correctCount = Answer.sumScores(unique)
    const totalDuration = sumResponseTimes(unique)
    return {
      totalQuestions: unique.length,
      correctCount,
      accuracy: unique.length > 0 ? correctCount / unique.length : 0,
      totalDuration,
    }
  }
}

// ─── Session CRUD ──────────────────────────────────────────────────────────

/**
 * 保存一个练习 session（含答案）
 */
export async function saveSession(sessionData, answersData) {
  const now = new Date().toISOString()
  const session = {
    studentId: sessionData.studentId || 'default',
    config: sessionData.config || null,
    totalQuestions: sessionData.totalQuestions || 0,
    // correctCount / accuracy / totalDuration: 不写——由 PracticeSession.computeStats 实时算
    evaluations: sessionData.evaluations || null,
    createdAt: now,
    synced: 0,
    updatedAt: now,
  }
  const id = await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
    const sessionId = await DB.practiceSessions.add(session)
    const answers = answersData.map(a => ({
      sessionId,
      equation: a.equation || '',
      solution: a.solution ?? 0,
      userAnswer: a.userAnswer ?? 0,
      // isCorrect / score / attemptCount: 不写——由 Answer.getter 实时算
      responseTime: a.responseTime || 0,
      operator: a.operator || '',
      isCarry: !!a.isCarry,
      isBorrow: !!a.isBorrow,
      stepCount: a.stepCount || 1,
      operandMin: a.operandMin ?? 0,
      operandMax: a.operandMax ?? 0,
      timestamp: a.timestamp || Date.now(),
      synced: 0,
    }))
    const CHUNK = 500
    for (let i = 0; i < answers.length; i += CHUNK) {
      await DB.answers.bulkAdd(answers.slice(i, i + CHUNK))
    }
    return sessionId
  })
  return id
}

/**
 * 获取最近 sessions
 */
export async function getSessions(studentId = 'default', limit = 50) {
  return DB.practiceSessions
    .where('studentId').equals(studentId)
    .reverse().limit(limit).toArray()
}

/**
 * 获取 session 详情（原始数据）
 */
export async function getSessionDetail(sessionId) {
  const session = await DB.practiceSessions.get(sessionId)
  const answers = await DB.answers
    .where('sessionId').equals(sessionId).sortBy('timestamp')
  return { session, answers }
}

/**
 * 删除 session 及其所有 answer
 */
export async function deleteSession(sessionId) {
  await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
    await DB.practiceSessions.delete(sessionId)
    await DB.answers.where('sessionId').equals(sessionId).delete()
  })
}
