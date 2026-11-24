/**
 * PracticeSession 域类 + CRUD（S 层）
 *
 * 扩展 databaseInit.PracticeSession 骨架类，聚合 session 相关数据访问。
 * - isCorrect / score 字段不写入（getter 即真理）
 *
 * @see services/databaseInit.js — DB 实例 + Schema 骨架 + DB 级操作（export/import/clear）
 */

import { DB, PracticeSession as SchemaSession } from './databaseInit'
import { Answer } from '@/services'
import { sumResponseTimes } from '@/utils/score'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

// ─── Domain Class ──────────────────────────────────────────────────────────

export class PracticeSession extends SchemaSession {
  constructor(overrides = {}) {
    super()
    Object.assign(this, overrides)
  }

  /**
   * 练习开始：创建 session 空壳（先于任何 answer，保证 FK 完整性）
   * @param {Object} options
   * @param {string} options.practiceSessionId
   * @param {Object} [options.configSnapshot] — 练习配置快照
   * @param {Object} [options.profileSnapshot] — 用户状态快照（开始前）
   * @param {string} [options.studentId='default']
   * @returns {Promise<number|null>}
   */
  static async create({ practiceSessionId, configSnapshot, profileSnapshot, evaluations, completed, studentId = 'default' } = {}) {
    if (!practiceSessionId) return null
    const now = new Date().toISOString()
    // 深拷贝：Pinia store 中读出的对象可能是 reactive Proxy→IDB structured clone 无法序列化→DataCloneError
    const safeClone = (v) => {
      if (v == null || typeof v !== 'object') return v
      try { return JSON.parse(JSON.stringify(v)) } catch { return v }
    }
    try {
      return await DB.practiceSessions.add({
        studentId,
        practiceSessionId,
        config: safeClone(configSnapshot) || null,
        profileSnapshot: safeClone(profileSnapshot) || null,
        evaluations: evaluations || null,
        completed: completed === true,
        createdAt: now,
        synced: 0,
        updatedAt: now,
      })
    } catch (err) {
      console.error('[PracticeSession] Failed to create session:', err)
      return null
    }
  }

  /**
   * 组/轮完成：更新 session metadata（不写 answers）
   * @param {Object} options
   * @param {string} options.practiceSessionId
   * @param {string} [options.evaluations] — JSON 字符串
   * @param {Object} [options.finalProfileSnapshot] — 结束时的用户状态
   * @returns {Promise<number>} 更新的记录数
   */
  static async update({ practiceSessionId, evaluations, finalProfileSnapshot } = {}) {
    if (!practiceSessionId) return 0
    try {
      return await DB.practiceSessions
        .where('practiceSessionId').equals(practiceSessionId)
        .modify({
          ...(evaluations != null ? { evaluations } : {}),
          ...(finalProfileSnapshot != null ? { finalProfileSnapshot, completed: true } : {}),
          updatedAt: new Date().toISOString(),
        })
    } catch (err) {
      console.error('[PracticeSession] Failed to update session:', err)
      return 0
    }
  }

  /**
   * 本 session 关联的所有答案（Answer 实例，走 getter）
   * @returns {Promise<import('@/services').Answer>}
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
    const correctCount = answers.filter(a => a.isCorrect).length
    const totalDuration = sumResponseTimes(answers)
    return {
      totalQuestions: answers.length,
      correctCount,
      accuracy: answers.length > 0 ? correctCount / answers.length : 0,
      totalDuration,
    }
  }

  /**
   * 计算 session 摘要统计（不依赖 DB 的纯函数）
   * @param {Object} session — 原始 session 记录
   * @param {Array} answers — 本 session 的答案数组
   * @returns {{ totalQuestions, correctCount, accuracy, difficultyLabel, completion, practiceType, completed }}
   *   - completed 原样透传 session.completed：true=已完成 / false=中断 / undefined=旧数据没有该字段
   */
  static computeSessionStats(session, answers = []) {
    const correctCount = answers.filter(a => a.isCorrect).length
    const total = answers.length
    const accuracy = total > 0 ? correctCount / total : 0

    // 本轮配置快照：自适应轮由 startNewAdaptiveSession 写入
    // { mode:'adaptive', difficultyIdx, targetMin, targetMax }，手动轮是 Generate 的表单快照
    let cfg = null
    try {
      cfg = typeof session.config === 'string' ? JSON.parse(session.config) : session.config
    } catch { /* ignore */ }

    // 难度标签：从 config 读 difficultyIdx
    let difficultyLabel = '—'
    if (cfg?.difficultyIdx != null) {
      const d = DIFFICULTY_LEVELS[cfg.difficultyIdx]
      if (d) difficultyLabel = d.label
    }

    // 题量进度：实际题数 / 本轮上限（自适应轮允许在 min~max 之间提前结束，
    // 所以这个数只是「练到上限的几成」，完成与否看 completed，不能拿它当完成判据）
    const targetMax = cfg?.targetMax || 30
    const completion = targetMax > 0 ? Math.min(1, total / targetMax) : 1

    // 练习类型
    let practiceType = '普通'
    if (session.evaluations || cfg?.mode === 'adaptive') practiceType = '自适应'
    else if (cfg?.diagnostic) practiceType = '诊断'

    return {
      totalQuestions: total,
      correctCount,
      accuracy,
      difficultyLabel,
      completion,
      practiceType,
      completed: session.completed,
    }
  }

  /**
   * 批量加载 sessions 的统计信息
   * @param {Array<Object>} sessions
   * @returns {Promise<Object<string, Object>>} sessionId → stats（普通对象，按 id 下标取）
   */
  static async getBatchSessionStats(sessions) {
    if (!sessions.length) return {}
    // 用 practiceSessionId 分组查 answers（而非 sessionId）
    const psIds = [...new Set(sessions.filter(s => s.practiceSessionId).map(s => s.practiceSessionId))]
    const standaloneIds = sessions.filter(s => !s.practiceSessionId).map(s => s.id)
    const allRows = []
    if (psIds.length) {
      const byPsid = (await DB.answers
        .where('practiceSessionId').anyOf(psIds).toArray())
        .map(r => Answer.fromJSON(r))
      allRows.push(...byPsid)
    }
    if (standaloneIds.length) {
      const bySid = await Answer.findBySessions(standaloneIds)
      allRows.push(...bySid)
    }
    const grouped = {}
    for (const a of allRows) {
      const key = a.practiceSessionId || a.sessionId
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(a)
    }
    const statsObj = {}
    for (const s of sessions) {
      const key = s.practiceSessionId || s.id
      statsObj[s.id] = PracticeSession.computeSessionStats(s, grouped[key] || [])
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
    // 用 practiceSessionId 查 answers（sessionId 只对应第一条 savePerQuestion 的 session）
    let answers = []
    if (session && session.practiceSessionId) {
      answers = await Answer.findByPracticeSessionId(session.practiceSessionId)
    }

    let siblings = []
    let consumed = 0
    if (session && session.practiceSessionId) {
      const totalAnswers = answers.length
      // 组边界 = 带 evaluations、且不是最终结算（completed）的行。
      // 每个 checkpoint 的 evaluations 是累积历史，末尾那条就是它自己这一组；
      // 最终结算行的 evaluations 是整轮历史，末组已被最后一个 checkpoint 覆盖，再算一次会切走两次。
      // 被点开的这一行若是未完成的 checkpoint（中断的轮次），它自己也是边界，
      // 否则它那一组会和后面没答完的下一组混在一起。旧数据没有 completed 字段，保持原「排除自身」行为。
      const isInterruptedCheckpoint = session.completed === false && !!session.evaluations
      const checkpoints = (await PracticeSession.findByPracticeSessionId(session.practiceSessionId))
        .filter(s => s.evaluations && s.completed !== true && (s.id !== sessionId || isInterruptedCheckpoint))
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      for (const s of checkpoints) {
        let groupSize = 0
        try {
          const evals = typeof s.evaluations === 'string' ? JSON.parse(s.evaluations) : s.evaluations
          if (Array.isArray(evals) && evals.length) {
            const last = evals[evals.length - 1]
            groupSize = last?.count || 0
          }
        } catch { /* ignore */ }
        if (!groupSize) {
          groupSize = Math.floor(totalAnswers / (checkpoints.length + 1))
        }
        const sliceEnd = Math.min(consumed + groupSize, totalAnswers)
        siblings.push({ session: s, answers: answers.slice(consumed, sliceEnd) })
        consumed = sliceEnd
      }
      if (consumed < totalAnswers) {
        answers = answers.slice(consumed)
      } else {
        answers = []
      }
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

  /** 查某学生全部 session（不分组合，供 clearWrongAnswers 之类用） */
  static async findAllByStudent(studentId = 'default') {
    return await DB.practiceSessions
      .where('studentId').equals(studentId).toArray()
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
