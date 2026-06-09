/**
 * 数据访问 S 层（对接 services/databaseInit + utils/store/database）
 *
 * 当前保留 re-export 垫片模式；exportAllData / importAllData / clearAllData
 * 已迁入本文件原生实现。
 *
 * @see services/databaseInit.js — PracticeDB 实例
 * @see utils/store/database.js — 其余 CRUD（U 层，过渡保留）
 */

import { DB } from './databaseInit'

// ─── Export / Import（S 层原生实现） ───────────────────────────────

export async function exportAllData(studentId = 'default') {
  const sessions = await DB.practiceSessions.where('studentId').equals(studentId).toArray()
  const sessionIds = sessions.map(s => s.id)
  const answers = sessionIds.length ? await DB.answers.where('sessionId').anyOf(sessionIds).toArray() : []
  const snapshots = await DB.abilitySnapshots.where('studentId').equals(studentId).toArray()
  const questions = await DB.questions.toArray()
  return { version: '2.0', exportedAt: new Date().toISOString(), studentId, sessions, answers, abilitySnapshots: snapshots, questions }
}

export async function importAllData(data) {
  if (!data?.sessions) return { importedSessions: 0, skippedSessions: 0 }
  let importedSessions = 0
  for (const session of data.sessions) {
    if (await DB.practiceSessions.where('id').equals(session.id).first()) continue
    const { answers: _, ...sessionData } = session
    await DB.practiceSessions.add(sessionData)
    importedSessions++
    const sessAnswers = (data.answers || []).filter(a => a.sessionId === session.id)
    if (sessAnswers.length) await DB.answers.bulkAdd(sessAnswers.map(a => { const { _answers, ...rest } = a; return rest }))
  }
  return { importedSessions, skippedSessions: 0 }
}

export async function clearAllData() {
  await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
    await DB.practiceSessions.clear(); await DB.answers.clear()
  })
  try { localStorage.removeItem('psm_profile') } catch {}
}

// ─── re-export 其余 CRUD（垫片，逐步迁移） ─────────────────────────

export {
  default as DB, default,
  saveSession, getSessions, getSessionDetail, deleteSession,
  saveAbilitySnapshot, getLatestAbilitySnapshot,
  getAggregatedStats,
} from '@/utils/store/database'
