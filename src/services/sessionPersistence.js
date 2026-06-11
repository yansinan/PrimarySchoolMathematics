/**
 * Session 持久化 service（E1 抽层, 2026-06-08）
 *
 * 接收 composable 拼好的 payload，写入 DB。
 * 单题写入由 `savePerQuestion → Answer.save()` + `Question.save()` 内聚处理。
 *
 * ## 1 个 export
 * - `persistSession(payload)` — 整组 checkpoint / final 保存（含 sessionData + answersData）
 *
 * @example
 *   await persistSession({ answers, configSnapshot, evaluations })
 */

import { saveSession } from '@/services/PracticeSession'

/**
 * 持久化 1 个练习 session 到 IndexedDB。
 *
 * @param {Object} params
 * @param {Array}  params.answers         - session.answers 原始数据（含跨组重复，不去重）
 * @param {Object}  params.configSnapshot  - Generate.vue 传来的 config 快照
 * @param {string} [params.evaluations]   - JSON 字符串或 null
 * @param {string} [params.studentId='default']
 * @returns {Promise<number|null>} sessionId 或 null（失败时）
 */
export async function persistSession({
  answers,
  configSnapshot,
  evaluations,
  studentId = 'default',
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

  const sessionData = {
    studentId,
    config: configSnapshot || {},
    totalQuestions: uniqueAnswers.length,
    // correctCount / accuracy / totalDuration: 不写——由 PracticeSession.computeStats 实时算
    evaluations: evaluations || null,
  }

  const answersData = answers.map((a) => ({
    equation: a.equation,
    solution: a.solution,
    userAnswer: a.userAnswer,
    responseTime: a.responseTime || 0,
    operator: a.operator || '',
    isCarry: a.isCarry || false,
    isBorrow: a.isBorrow || false,
    stepCount: a.stepCount || 1,
    operandMin: a.operandMin ?? 0,
    operandMax: a.operandMax ?? 0,
    timestamp: a.timestamp || Date.now(),
  }))

  try {
    const sessionId = await saveSession(sessionData, answersData)
    if (import.meta.env.DEV) {
      console.log(
        `[SessionPersistence] Session saved to DB: #${sessionId}, ${answers.length} questions`,
      )
    }
    return sessionId
  } catch (err) {
    console.error('[SessionPersistence] Failed to save session:', err)
    return null
  }
}
