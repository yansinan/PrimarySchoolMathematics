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
import { computeAndSaveAbilityProfile } from '@/services/abilityProfile'
// 修复 Bug 3: 直接 import db 实例, 用于 savePerQuestion 写单条 answer
// (避免每题都 persistSession 产生 N 个 1 步 session 污染"最近练习"列表)
import db, { saveQuestion } from '@/utils/store/database'
// E1: persistSession 从 S 层调, 不再绕 store action (2026-06-08)
import { persistSession } from '@/services/sessionPersistence'

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
   * 拿 store 画像数据，传入 abilityProfile 纯函数
   * 避免 U 层 abilityProfile.js 反向依赖 M 层 store（ARCHITECTURE § 1.2）
   */
  function buildProfileContext() {
    return {
      diagAnswers: practiceStore.abilityProfile?.diagAnswers || [],
      adaptiveAnswers: practiceStore.adaptiveAnswers || [],
      currentDifficultyIdx: practiceStore.currentDifficultyIdx ?? -1,
    }
  }

  /**
   * 1) 每题答完：fire-and-forget
   * 修复 Bug 3:
   *   - 不再调 practiceStore.persistSession()，避免每答 1 题都创建 1 个 session 记录
   *   - 改为只把"最近一条 answer"写到 db.answers 表（不写 session 表）
   *   - 这样"最近练习"列表只显示 group checkpoint 和最终 session，不再被 1 步 session 淹没
   *   - abilitySnapshot 仍正常更新（fire-and-forget）
   */
  function savePerQuestion() {
    // 同步更新能力画像（fire-and-forget）
    computeAndSaveAbilityProfile(buildProfileContext())
    // 取 session.answers 最后一条（刚答完的那题），单独写入 db.answers
    // sessionId=0 表示这条 answer 暂未关联到任何 session record
    // 等到 group checkpoint / final 时，persistSession 会再写一份带 sessionId 的完整 record
    const answers = practiceStore.session.answers
    const lastAnswer = answers[answers.length - 1]
    if (lastAnswer) {
      void db.answers.put(lastAnswer)
      // ✨ B-2 修复：同步写入 questions 表（equation 唯一键去重，首次创建后续复用 id）
      void saveQuestion({
        ...lastAnswer,
        operands: [lastAnswer.operandMin, lastAnswer.operandMax].filter(x => x > 0),
      })
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
    computeAndSaveAbilityProfile(buildProfileContext())
    const evaluations = extractEvaluationsJSON(history)
    await persistSession({
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
    computeAndSaveAbilityProfile(buildProfileContext())
    const evaluations = extractEvaluationsJSON(history)
    practiceStore.session.answers = answers
    await persistSession({
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
    computeAndSaveAbilityProfile(buildProfileContext())
    await persistSession({
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
