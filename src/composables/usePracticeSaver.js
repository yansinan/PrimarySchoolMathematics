/**
 * 练习持久化 composable
 *
 * 封装 Practice.vue 中 4 处 `practiceStore.saveSessionToDB` 调用：
 *  - 每题答完（fire-and-forget）
 *  - 自适应一组完成（checkpoint，含 evaluations）
 *  - 自适应全部完成（dialog callback，含 evaluations + refresh stats）
 *  - 普通练习完成（无 evaluations + refresh stats）
 *
 * 把"answers 整理 + evaluations 提取 + save + refresh stats"集中到这里，
 * 后续如果 save 逻辑变复杂（多步事务、错误重试、上传云端），只需要改这一个文件。
 *
 * 用法：
 *   const saver = usePracticeSaver()
 *   saver.savePerQuestion()                              // fire-and-forget
 *   await saver.saveGroupCheckpoint(answers, history)    // 自适应一组后
 *   await saver.saveAdaptiveFinal(answers, history)      // 自适应全部完成
 *   await saver.savePracticeFinal()                      // 普通练习完成
 */

import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { computeAndSaveAbilityProfile } from '@/utils/abilityProfile'

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
  const statsStore = useStatsStore()

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
   * - 不 await，不阻塞 UI
   * - 多次写同一题自动覆盖
   * - 同步更新能力画像（fire‑and‑forget）
   */
  function savePerQuestion() {
    computeAndSaveAbilityProfile(buildProfileContext())
    return practiceStore.saveSessionToDB()
  }

  /**
   * 2) 自适应一组完成：checkpoint
   * - 含 evaluations（如果之前答过有自评的组）
   * - 只更新能力画像，不存 session；整轮完成时才落最终 session
   * - 不 await，让弹窗立即显示
   */
  async function saveGroupCheckpoint(history) {
    computeAndSaveAbilityProfile(buildProfileContext())
    void history
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
    await practiceStore.saveSessionToDB(evaluations)
    await statsStore.refreshAll()
  }

  /**
   * 4) 普通练习完成：最终保存
   * - 不含 evaluations
   * - 触发 stats refresh
   * - 同步更新能力画像
   */
  async function savePracticeFinal() {
    computeAndSaveAbilityProfile(buildProfileContext())
    await practiceStore.saveSessionToDB()
    await statsStore.refreshAll()
  }

  return {
    savePerQuestion,
    saveGroupCheckpoint,
    saveAdaptiveFinal,
    savePracticeFinal,
  }
}
