/**
 * 数据库初始化（S 层）— PracticeDB 实例定义。
 *
 * **纯 DB 层**：只负责 Dexie 实例、表结构、骨架类。不含业务逻辑。
 *
 * 跟它有关的：
 * - Schema 类（骨架构造器，继承用）— 纯 DB 范畴
 * - version/store 定义 — 表结构
 * - upgrade hooks — 数据迁移，含少量业务默认值，但是一次性兼容代码
 * - 导出/导入/清空 — 纯 DB CRUD
 */

import Dexie from 'dexie'
import { newUid } from '@/utils/id'
import { clearFormState } from '@/utils/store/formPersistence'
import { clearLevelCoefficients } from '@/utils/store/levelCoefficients'
import { clearLevelOverride } from '@/utils/store/levelOverride'
import { clearChallengeSetting } from '@/utils/store/challengeSetting'

// ─── Schema helpers (Dexie mapToClass) ───────────────────────────────────

class PracticeSession {
  constructor() {
    this.uid = null
    this.studentId = 'default'; this.config = null
    this.evaluations = null; this.practiceSessionId = null
    this.profileSnapshot = null; this.finalProfileSnapshot = null
    this.completed = false
    this.createdAt = new Date().toISOString(); this.synced = 0; this.updatedAt = new Date().toISOString()
  }
}

class Answer {
  constructor() {
    this.uid = null
    this.sessionId = 0; this.equation = ''; this.solution = 0; this.userAnswer = 0
    this.responseTime = 0; this.operator = ''; this.isCarry = false
    this.isBorrow = false; this.stepCount = 1; this.operandMin = 0
    this.operandMax = 0; this.inputMode = ''; this.blankMode = 'result'
    this.questionId = 0; this.questionIndex = 0; this.previousAttemptCount = 0
    this.correctedAt = null; this.startedAt = Date.now(); this.endedAt = null
    this.practiceSessionId = null
    this.timestamp = Date.now(); this.synced = 0
  }
}

class Question {
  constructor() {
    this.equation = ''; this.solution = 0; this.operator = ''
    this.createdAt = Date.now(); this.synced = 0
  }
}

// ─── PracticeDB — IndexedDB persistence layer ────────────────────────────

/**
 * v6 迁移：给已有行补 `uid`。
 *
 * 只写 `uid` 一个字段，不动任何业务字段；整个 version-change 是一个事务，
 * 任何异常都会回滚（DB 停在 v5），不会出现「一半有 uid 一半没有」的中间态。
 * 迁移后自检：行数不变、每行都有 uid —— 不满足就抛错回滚。
 *
 * @param {import('dexie').Transaction} tx
 */
async function backfillUids(tx) {
  for (const name of ['practiceSessions', 'answers']) {
    const table = tx.table(name)
    const before = await table.count()
    await table.toCollection().modify((row) => {
      if (!row.uid) row.uid = newUid()
    })
    const after = await table.count()
    const missing = await table.filter((row) => !row.uid).count()
    if (after !== before) throw new Error(`[db v6] ${name} 行数变化：${before} → ${after}`)
    if (missing > 0) throw new Error(`[db v6] ${name} 仍有 ${missing} 行没有 uid`)
  }
}

class PracticeDB extends Dexie {
  constructor() {
    super('PracticeDB')

    this.version(1).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, synced, timestamp',
    })
    this.version(2).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, synced, timestamp',
    })
    this.version(3).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    })
    this.version(4).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    })
    // v5: practiceSessionId 索引
    this.version(5).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt, practiceSessionId',
      answers: '++id, sessionId, questionId, startedAt, synced, timestamp, practiceSessionId',
      questions: '++id, &equation, operator, createdAt, synced',
    })

    // v6: 全局稳定行键 uid —— 快照同步按 uid 合并，自增 id 跨设备会撞
    // （见 designDocs/15-PLAN-snapshot-sync.md §5）
    this.version(6).stores({
      practiceSessions: '++id, &uid, studentId, createdAt, synced, updatedAt, practiceSessionId',
      answers: '++id, &uid, sessionId, questionId, startedAt, synced, timestamp, practiceSessionId',
      questions: '++id, &equation, operator, createdAt, synced',
    }).upgrade(backfillUids)

    this.practiceSessions.mapToClass(PracticeSession)
    this.answers.mapToClass(Answer)
    this.questions.mapToClass(Question)
  }
}

const db = new PracticeDB()

// 多标签：升级/删库时旧标签若不关连接，新标签的 version-change 会永远等待。
// versionchange → 主动关闭本标签连接（下一次查询会自动重开）；
// blocked → 通知 UI 提示用户关闭其他标签页（PSM 有多标签同时开着的可能）。
db.on('versionchange', () => {
  try { db.close() } catch { /* ignore */ }
})
db.on('blocked', () => {
  try { globalThis.dispatchEvent?.(new CustomEvent('psm:db-blocked')) } catch { /* 非浏览器环境 */ }
})

export { db as DB }
export default db
// ─── Schema classes（供 domain 类继承对齐） ──────────────────────────
export { PracticeSession, Answer, Question }

// ─── DB 级操作（数据导出 / 导入 / 清空） ─────────────────────────────────

/**
 * 导出全部数据（备份 / 迁移前快照）
 *
 * 答案归属三种情况都要覆盖，否则导出的备份不完整：
 *  1. `sessionId` 命中本学生的会话（旧数据 / 首题壳）；
 *  2. `practiceSessionId` 命中本学生的轮次（v5 起的正常数据）；
 *  3. 两者都没有 —— 诊断阶段的孤儿答案（本来就不写 session）。
 * 旧实现只按 `sessionId` 查，会把诊断答案整体漏掉。
 *
 * 整个读取放在一个事务里，避免导出到一半又写入产生半更新快照。
 *
 * @returns {Object} JSON-serializable 导出对象
 */
export async function exportAllData(studentId = 'default') {
  return db.transaction('r', db.practiceSessions, db.answers, db.questions, async () => {
    const sessions = await db.practiceSessions
      .where('studentId').equals(studentId).toArray()
    const sessionIds = new Set(sessions.map(s => s.id))
    const practiceSessionIds = new Set(sessions.map(s => s.practiceSessionId).filter(Boolean))
    const allAnswers = await db.answers.toArray()
    const answers = allAnswers.filter(a =>
      (a.sessionId != null && sessionIds.has(a.sessionId))
      || (a.practiceSessionId && practiceSessionIds.has(a.practiceSessionId))
      || (!a.sessionId && !a.practiceSessionId)
    )
    const questions = await db.questions.toArray()
    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      studentId,
      sessions,
      answers,
      questions,
    }
  })
}

/**
 * 导入数据（按 session.id 判重，跳过已存在的）
 *
 * v6 起每行必须有 uid：旧导出文件没有该字段，导入时补上 ——
 * 否则这些行永远不会参与快照同步（合并按 uid 取键，空键直接跳过）。
 *
 * @returns {{importedSessions: number, skippedSessions: number}}
 */
export async function importAllData(data) {
  if (!data?.sessions) return { importedSessions: 0, skippedSessions: 0 }
  let importedSessions = 0
  for (const session of data.sessions) {
    if (await db.practiceSessions.where('id').equals(session.id).first()) continue
    const { answers: _answers, ...sessionData } = session
    await db.practiceSessions.add({ ...sessionData, uid: sessionData.uid || newUid() })
    importedSessions++
    const sessAnswers = (data.answers || []).filter(a => a.sessionId === session.id)
    if (sessAnswers.length) {
      await db.answers.bulkAdd(
        sessAnswers.map(a => { const { _answers: _a, ...rest } = a; return { ...rest, uid: rest.uid || newUid() } })
      )
    }
  }
  // 孤儿答案（诊断答案既无 sessionId 也无 practiceSessionId）：旧导出会漏，新导出会带上。
  // 按 equation + timestamp 判重，重复导入同一份文件时不叠加。
  const orphans = (data.answers || []).filter(a => !a.sessionId && !a.practiceSessionId)
  for (const a of orphans) {
    const exists = await db.answers
      .filter(r => !r.sessionId && !r.practiceSessionId && r.equation === a.equation && r.timestamp === a.timestamp)
      .first()
    if (exists) continue
    const { _answers: _a, ...rest } = a
    await db.answers.add({ ...rest, uid: rest.uid || newUid() })
  }
  return { importedSessions, skippedSessions: 0 }
}

/**
 * 清空所有本地数据（sessions + answers + profile + 本地设置）
 *
 * 本地设置也一并清掉：出题表单自动保存（psm_form_state）、档位配比系数
 * （psm_level_coefficients）、手动指定的起点档位（psm_level_override）和
 * 挑战题开关（psm_challenge_enabled）都属于「用户数据」，
 * 重置后应该回到出厂默认，否则会残留上一次的配置。
 */
export async function clearAllData() {
  await db.transaction('rw', db.practiceSessions, db.answers, async () => {
    await db.practiceSessions.clear()
    await db.answers.clear()
  })
  try { localStorage.removeItem('psm_profile') } catch { /* ignore */ }
  try { clearFormState() } catch { /* ignore */ }
  try { clearLevelCoefficients() } catch { /* ignore */ }
  try { clearLevelOverride() } catch { /* ignore */ }
  try { clearChallengeSetting() } catch { /* ignore */ }
}
