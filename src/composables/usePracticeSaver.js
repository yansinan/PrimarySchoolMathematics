/**
 * 练习持久化 composable
 *
 * 封装 Practice.vue 中 4 处持久化调用：
 *  - 每题答完（fire-and-forget，只写 answer 不写 session）
 *  - 自适应一组完成（checkpoint，写 1 个 group session）
 *  - 自适应全部完成（dialog callback，写最终 session + refresh stats）
 *  - 普通练习完成（写最终 session + refresh stats）
 *
 * 把"answers 整理 + evaluations 提取 + save + refresh stats"集中到这里，
 * 后续如果 save 逻辑变复杂（多步事务、错误重试、上传云端），只需要改这一个文件。
 *
 * 用法：
 *   const saver = usePracticeSaver(profileRef)
 *   saver.savePerQuestion()                              // fire-and-forget
 *   await saver.saveGroupCheckpoint(history)            // 自适应一组后（write evaluations）
 *   await saver.saveSessionFinal({ evaluations, finalProfileSnapshot })  // 练习完成
 */

import { usePracticeStore } from '@/stores/practice'
import { useStatsQuery } from '@/composables'
// persistSession 已内聚到 PracticeSession.save() 静态方法
import { PracticeSession } from '@/services/PracticeSession'
import { Answer } from '@/services'

/**
 * 从 history 中提取 evaluations（{group, score}[]），转 JSON 字符串
 * @param {Array<{groupIdx?: number, evaluation?: number}>} history
 * @returns {string | null} JSON 字符串或 null
 */
function extractEvaluationsJSON(history) {
  const recs = (history || [])
    .filter(h => h.evaluation != null)
    .map(h => ({ group: h.groupIdx, score: h.evaluation, count: h.total || 0 }))
  return recs.length ? JSON.stringify(recs) : null
}

export function usePracticeSaver(profileRef = null) {
  const practiceStore = usePracticeStore()
  const { refreshAll } = useStatsQuery()

  /** 获取/生成轮次 ID（每轮首次保存时生成） */
  function getPracticeSessionId() {
    if (!practiceStore.session.practiceSessionId) {
      practiceStore.session.practiceSessionId =
        `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    }
    return practiceStore.session.practiceSessionId
  }

  /**
   * 1) 每题答完：fire-and-forget
   * 修复 Bug 3:
   *   - 改为只把"最近一条 answer"写到 db.answers 表（不写 session 表）
   *   - 这样"最近练习"列表只显示 group checkpoint 和最终 session，不再被 1 步 session 淹没
   */
  async function savePerQuestion() {
    // P2-2: 诊断阶段答在 diagnosticAnswers，练习阶段答在 answers
    const target = practiceStore.phase === 'assessment'
      ? practiceStore.session.diagnosticAnswers
      : practiceStore.session.answers
    const lastAnswer = target[target.length - 1]
    if (lastAnswer) {
      const pid = getPracticeSessionId()
      let sessionDbId = practiceStore.session.sessionDbId
      // 第一题写入时创建 session（避免空壳，仅练习阶段）
      if (!sessionDbId && pid && practiceStore.phase !== 'assessment') {
        const snapshot = practiceStore.session._pendingProfileSnapshot
        sessionDbId = await PracticeSession.create({
          practiceSessionId: pid,
          configSnapshot: practiceStore.session.configSnapshot,
          profileSnapshot: snapshot,
        })
        if (sessionDbId) practiceStore.session.sessionDbId = sessionDbId
        practiceStore.session._pendingProfileSnapshot = null
      }
      // 由 Profile 统一写入（DB + 缓存）
      const answerData = practiceStore.phase !== 'assessment'
        ? { ...lastAnswer, practiceSessionId: pid, sessionId: sessionDbId }
        : { ...lastAnswer }
      const profile = typeof profileRef === 'function' ? profileRef() : profileRef
      if (profile && typeof profile.recordAnswer === 'function') {
        await profile.recordAnswer(answerData)
      } else {
        // fallback: 无 profile 时直接写
        Answer.save(answerData)
      }
    }
  }

  /**
   * 2) 自适应一组完成：group checkpoint
   * 同一轮所有 checkpoint + final 共用 practiceSessionId。
   * 每组 checkpoint **只存当组新增答案**（不重复存历史组），
   * final 保存时存全部（含之前未存完的）。
   */
  async function saveGroupCheckpoint(history) {
    const evaluations = extractEvaluationsJSON(history)
    if (!evaluations) return
    const pid = getPracticeSessionId()
    await PracticeSession.create({
      practiceSessionId: pid,
      evaluations,
      // 标记为 checkpoint，不是最终结算
      profileSnapshot: null,
    })
  }

  /**
   * 3) 练习完成：保存 evaluations + 最终用户快照（合并 adaptive/manual 路径）
   * @param {Object} [opts]
   * @param {string} [opts.evaluations] — JSON 字符串（adaptive 有，manual 无）
   * @param {Object} [opts.finalProfileSnapshot] — 结束时的用户状态
   */
  async function saveSessionFinal({ evaluations, finalProfileSnapshot } = {}) {
    const pid = getPracticeSessionId()
    if (pid) {
      // 最终结算创建一条新 session（带 finalProfileSnapshot，标记 completed）
      await PracticeSession.create({
        practiceSessionId: pid,
        configSnapshot: practiceStore.session.configSnapshot,
        profileSnapshot: finalProfileSnapshot || null,
        evaluations: evaluations || null,
        completed: true,
      })
    }
    practiceStore.session.lastSavedAnswerCount = practiceStore.session.answers.length
    await refreshAll()
  }

  return {
    savePerQuestion,
    saveGroupCheckpoint,
    saveSessionFinal,
  }
}
