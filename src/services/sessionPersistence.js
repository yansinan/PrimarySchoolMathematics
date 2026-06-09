/**
 * Session 持久化 service（E1 抽层, 2026-06-08；E1 方案 B 加 persistSingleAnswer, 2026-06-08）
 *
 * 替代原 `stores/practice.js#saveSessionToDB`（业务混在 M 层违例）。
 * 接收 composable 拼好的 payload（不依赖 store），按 ARCHITECTURE.md §1.2
 * 纯函数式 S 层：只引 U 层（`@/utils/score` + `@/utils/store/database`）。
 *
 * 业务变更影响面：未来如果 save 逻辑变复杂（多步事务、错误重试、上传云端），
 * 只需改本文件。
 *
 * ## 2 个 export
 * - `persistSession(payload)` — 整组 checkpoint / final 保存（含 sessionData + answersData）
 * - `persistSingleAnswer(answer)` — 单题 fire-and-forget 持久化（写 answers + questions 表）
 *
 * @example
 *   await persistSession({ answers, configSnapshot, evaluations })
 *   await persistSingleAnswer(lastAnswer)
 */

import { sumAnswerScores, sumResponseTimes } from '@/utils/score'
import db, { saveSession } from '@/utils/store/database'
import { Question } from '@/utils/algorithm/question'

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

  const correctCount = sumAnswerScores(uniqueAnswers)
  const totalDuration = sumResponseTimes(uniqueAnswers)

  const sessionData = {
    studentId,
    config: configSnapshot || {},
    totalQuestions: uniqueAnswers.length,
    correctCount,
    accuracy: uniqueAnswers.length > 0 ? correctCount / uniqueAnswers.length : 0,
    totalDuration,
    evaluations: evaluations || null,
  }

  const answersData = answers.map((a) => ({
    equation: a.equation,
    solution: a.solution,
    userAnswer: a.userAnswer,
    isCorrect: a.isCorrect,
    responseTime: a.responseTime || 0,
    operator: a.operator || '',
    isCarry: a.isCarry || false,
    isBorrow: a.isBorrow || false,
    stepCount: a.stepCount || 1,
    operandMin: a.operandMin ?? 0,
    operandMax: a.operandMax ?? 0,
    attemptCount: a.attemptCount ?? 1,
    score: typeof a.score === 'number' ? a.score : a.isCorrect ? 1 : 0,
    timestamp: a.timestamp || Date.now(),
  }))

  try {
    const sessionId = await saveSession(sessionData, answersData)
    console.log(
      `[SessionPersistence] Session saved to DB: #${sessionId}, ${answers.length} questions, ${Math.round((correctCount / answers.length) * 100)}% accuracy`,
    )
    return sessionId
  } catch (err) {
    console.error('[SessionPersistence] Failed to save session:', err)
    return null
  }
}

/**
 * 持久化 1 条答题（fire-and-forget，每题答完调用）。
 *
 * 替代原 `usePracticeSaver#savePerQuestion` 内的硬编 `db.answers.put` + `saveQuestion` 编排（E1 方案 B 抽层）。
 * 业务变更影响面：未来加批量重试 / 上传云端只改本文件。
 *
 * @param {Object} answer - 单条答题记录（含 equation / userAnswer / isCorrect / operandMin / operandMax 等）
 * @returns {Promise<void>}
 */
export async function persistSingleAnswer(answer) {
  if (!answer) return
  try {
    // 写 answers 表（不关联 sessionId，group checkpoint / final 时 persistSession 会再写带 sessionId 的完整 record）
    await db.answers.put(answer)
    // ✨ B-2 修复：同步写入 questions 表（equation 唯一键去重，首次创建后续复用 id）
    await Question.save({
      ...answer,
      operands: [answer.operandMin, answer.operandMax].filter(x => x > 0),
    })
  } catch (err) {
    console.error('[SessionPersistence] Failed to persist single answer:', err)
  }
}
