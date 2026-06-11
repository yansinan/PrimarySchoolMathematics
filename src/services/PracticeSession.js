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
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

// ─── Domain Class ──────────────────────────────────────────────────────────

export class PracticeSession extends SchemaSession {
  constructor(overrides = {}) {
    super()
    Object.assign(this, overrides)
  }

  /**
   * 保存一个练习 session（含答案）
   *
   * @param {Object} options
   * @param {Array}  options.answers         - session.answers 原始数据（含跨组重复，不去重）
   * @param {Object} [options.configSnapshot] - Generate.vue 传来的 config 快照
   * @param {string} [options.evaluations]   - JSON 字符串或 null
   * @param {string} [options.studentId='default']
   * @param {string} [options.practiceSessionId] — 练轮次 ID，同一轮所有 session 共用
   * @returns {Promise<number|null>} sessionId 或 null（失败时）
   */
  static async save({
    answers,
    configSnapshot,
    evaluations,
    studentId = 'default',
    practiceSessionId = null,
  }) {
    if (!answers || !answers.length) return null

    // 按 questionIndex 去重,确保每个问题只算 1 次
    const seen = new Set()
    const uniqueAnswers = answers.filter((a) => {
      const key = a.questionIndex ?? a.equation
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const now = new Date().toISOString()
    const session = {
      studentId,
      config: configSnapshot || null,
      practiceSessionId,
      totalQuestions: uniqueAnswers.length,
      // correctCount / accuracy / totalDuration: 不写——由 computeStats 实时算
      evaluations: evaluations || null,
      createdAt: now,
      synced: 0,
      updatedAt: now,
    }

    const answersData = answers.map((a) => ({
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
      inputMode: a.inputMode || '',
      blankMode: a.blankMode || 'result',
      timestamp: a.timestamp || Date.now(),
      synced: 0,
    }))

    try {
      const id = await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
        const sessionId = await DB.practiceSessions.add(session)
        const CHUNK = 500
        for (let i = 0; i < answersData.length; i += CHUNK) {
          const chunk = answersData.slice(i, i + CHUNK).map(a => ({ ...a, sessionId }))
          await DB.answers.bulkAdd(chunk)
        }
        return sessionId
      })
      if (import.meta.env.DEV) {
        console.log(
          `[PracticeSession] Session saved: #${id}, ${answers.length} questions`,
        )
      }
      return id
    } catch (err) {
      console.error('[PracticeSession] Failed to save session:', err)
      return null
    }
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
    const correctCount = unique.filter(a => a.isCorrect).length
    const totalDuration = sumResponseTimes(unique)
    return {
      totalQuestions: unique.length,
      correctCount,
      accuracy: unique.length > 0 ? correctCount / unique.length : 0,
      totalDuration,
    }
  }

  /**
   * 计算 session 摘要统计（不依赖 DB 的纯函数）
   * @param {Object} session — 原始 session 记录
   * @param {Array} answers — 本 session 的答案数组
   * @returns {{ totalQuestions, correctCount, accuracy, difficultyLabel, completion, practiceType }}
   */
  static computeSessionStats(session, answers = []) {
    const unique = answers.filter(a => {
      const key = a.questionIndex ?? a.equation
      return key != null
    })
    const correctCount = unique.filter(a => a.isCorrect).length
    const total = unique.length
    const accuracy = total > 0 ? correctCount / total : 0

    // 难度标签：从 config 读 difficultyIdx
    let difficultyLabel = '—'
    try {
      const cfg = typeof session.config === 'string' ? JSON.parse(session.config) : session.config
      if (cfg?.difficultyIdx != null) {
        const d = DIFFICULTY_LEVELS[cfg.difficultyIdx]
        if (d) difficultyLabel = d.label
      }
    } catch { /* ignore */ }

    // 完成度：实际题数 / 计划目标
    let completion = total > 0 ? 1 : 0
    try {
      const cfg = typeof session.config === 'string' ? JSON.parse(session.config) : session.config
      const targetMax = cfg?.targetMax || 30
      completion = targetMax > 0 ? Math.min(1, total / targetMax) : 1
    } catch { /* ignore */ }

    // 练习类型
    let practiceType = '普通'
    if (session.evaluations) practiceType = '自适应'
    else if (session.config?.diagnostic) practiceType = '诊断'

    return { totalQuestions: total, correctCount, accuracy, difficultyLabel, completion, practiceType }
  }

  /**
   * 批量加载 sessions 的统计信息
   * @param {Array<Object>} sessions
   * @returns {Promise<Map<number, Object>>} sessionId → stats
   */
  static async getBatchSessionStats(sessions) {
    if (!sessions.length) return new Map()
    const ids = sessions.map(s => s.id)
    const rows = await Answer.findBySessions(ids)
    const grouped = {}
    for (const a of rows) {
      if (!grouped[a.sessionId]) grouped[a.sessionId] = []
      grouped[a.sessionId].push(a)
    }
    const statsObj = {}
    for (const s of sessions) {
      statsObj[s.id] = PracticeSession.computeSessionStats(s, grouped[s.id] || [])
    }
    return statsObj
  }

  // ── Session CRUD（封装 DB.practiceSessions 所有操作） ──

  /** 获取最近 sessions（每轮只返回最新一条） */
  static async list(studentId = 'default', limit = 50) {
    const all = await DB.practiceSessions
      .where('studentId').equals(studentId)
      .reverse().toArray()

    const groups = new Map()
    const standalone = []
    for (const s of all) {
      if (s.practiceSessionId) {
        if (!groups.has(s.practiceSessionId)) {
          groups.set(s.practiceSessionId, s)
        }
      } else {
        if (standalone.length < limit * 2) standalone.push(s)
      }
    }

    const merged = [...groups.values(), ...standalone]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return merged.slice(0, limit)
  }

  /** 获取 session 详情（含 answers + siblings） */
  static async getDetail(sessionId) {
    const session = await DB.practiceSessions.get(sessionId)
    const answers = sessionId != null ? await Answer.findBySession(sessionId) : []

    let siblings = []
    if (session && session.practiceSessionId) {
      const raw = await PracticeSession.findByPracticeSessionId(session.practiceSessionId)
      const filtered = raw.filter(s => s.id !== sessionId)
      siblings = await Promise.all(filtered.map(async s => ({
        session: s,
        answers: await Answer.findBySession(s.id),
      })))
    }

    return { session, answers, siblings }
  }

  /** 按 practiceSessionId 查所有 session（按 createdAt 排序） */
  static async findByPracticeSessionId(practiceSessionId) {
    if (!practiceSessionId) return []
    return await DB.practiceSessions
      .where('practiceSessionId').equals(practiceSessionId)
      .sortBy('createdAt')
  }

  /** 删除 session 及其所有 answer */
  static async deleteOne(sessionId) {
    await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
      await DB.practiceSessions.delete(sessionId)
      await Answer.deleteBySession(sessionId)
    })
  }

  /** 删除某学生全部 session + 关联的 answer */
  static async deleteByStudentId(studentId = 'default') {
    const all = await DB.practiceSessions
      .where('studentId').equals(studentId).toArray()
    const sessionIds = all.map(s => s.id)
    if (!sessionIds.length) return 0
    await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
      await DB.practiceSessions.where('studentId').equals(studentId).delete()
      for (const sid of sessionIds) {
        await Answer.deleteBySession(sid)
      }
    })
    return sessionIds.length
  }
}

// ─── Session CRUD（导出函数，委托给 PracticeSession 类方法） ──────────────

/**
 * 获取最近 sessions（每轮只返回最新一条）
 */
export async function getSessions(studentId = 'default', limit = 50) {
  return PracticeSession.list(studentId, limit)
}

/**
 * 获取 session 详情（原始数据）
 * 同时返回同 practiceSessionId 的 checkpoint 子 session（含各自答案）
 */
export async function getSessionDetail(sessionId) {
  return PracticeSession.getDetail(sessionId)
}

/**
 * 删除 session 及其所有 answer
 */
export async function deleteSession(sessionId) {
  await PracticeSession.deleteOne(sessionId)
}
