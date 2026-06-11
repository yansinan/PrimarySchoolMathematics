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
 *   const saver = usePracticeSaver()
 *   saver.savePerQuestion()                              // fire-and-forget
 *   await saver.saveGroupCheckpoint(history)            // 自适应一组后
 *   await saver.saveAdaptiveFinal(answers, history)      // 自适应全部完成
 *   await saver.savePracticeFinal()                      // 普通练习完成
 */

import { usePracticeStore } from '@/stores/practice'
import { useStatsQuery } from '@/composables'
// persistSession 已内聚到 PracticeSession.save() 静态方法
import { PracticeSession } from '@/services/PracticeSession'
import { Answer } from '@/utils/algorithm/answer'

/**
 * 从 history 中提取 evaluations（{group, score}[]），转 JSON 字符串
 * @param {Array<{groupIdx?: number, evaluation?: number}>} history
 * @returns {string | null} JSON 字符串或 null
 */
function extractEvaluationsJSON(history) {
  const recs = (history || [])
    .filter(h => h.evaluation != null)
    .map(h => ({ group: h.groupIdx, score: h.evaluation }))
  return recs.length ? JSON.stringify(recs) : null
}

export function usePracticeSaver() {
  const practiceStore = usePracticeStore()
  const { refreshAll } = useStatsQuery()

  /**
   * 1) 每题答完：fire-and-forget
   * 修复 Bug 3:
   *   - 改为只把"最近一条 answer"写到 db.answers 表（不写 session 表）
   *   - 这样"最近练习"列表只显示 group checkpoint 和最终 session，不再被 1 步 session 淹没
   */
  function savePerQuestion() {
    // P2-2: 诊断阶段答在 diagnosticAnswers，练习阶段答在 answers
    const target = practiceStore.phase === 'assessment'
      ? practiceStore.session.diagnosticAnswers
      : practiceStore.session.answers
    const lastAnswer = target[target.length - 1]
    if (lastAnswer) {
      void Answer.save(lastAnswer)
    }
  }

  /**
   * 2) 自适应一组完成：group checkpoint
   * 修复 Bug 3:
   *   - 之前是 void history 什么也不做，导致"最近练习"列表只看到 final session
   *   - 现在每组完成都写 1 个 group checkpoint session（含 evaluations）
   *   - 这样 1 个 group = 1 个 session, 最近练习列表清晰可读
   */
  async function saveGroupCheckpoint(history) {
    const evaluations = extractEvaluationsJSON(history)
    await PracticeSession.save({
      answers: practiceStore.session.answers,
      configSnapshot: practiceStore.session.configSnapshot,
      evaluations,
    })
  }

  /**
   * 3) 自适应全部完成：最终保存
   * - 含 evaluations + 触发 stats refresh
   * - 同步等待，用于用户关闭弹窗后的导航
   *
   * @param {Array} answers - 完整答案列表（已合并多组）
   * @param {Array} history - 引擎 history（用于提取 evaluations）
   */
  async function saveAdaptiveFinal(answers, history) {
    const evaluations = extractEvaluationsJSON(history)
    practiceStore.session.answers = answers
    await PracticeSession.save({
      answers,
      configSnapshot: practiceStore.session.configSnapshot,
      evaluations,
    })
    await refreshAll()
  }

  /**
   * 4) 普通练习完成：最终保存
   * - 不含 evaluations
   * - 触发 stats refresh
   * - 同步更新能力画像
   */
  async function savePracticeFinal() {
    await PracticeSession.save({
      answers: practiceStore.session.answers,
      configSnapshot: practiceStore.session.configSnapshot,
    })
    await refreshAll()
  }

  return {
    savePerQuestion,
    saveGroupCheckpoint,
    saveAdaptiveFinal,
    savePracticeFinal,
  }
}
