/**
 * 用户能力画像 — 加载 + 查询（service 层）
 *
 * 职责：
 *  - Profile 类：用户统计数据（难度 + 强弱项索引），不可变，组边界整体替换
 *  - Engine 通过 this.profile 持有实例，强弱项走 getter 委派
 *
 * 调用方：
 *  - useAdaptiveSession.js → Profile.load() 加载画像
 *  - Engine → this.profile 引用 Profile 实例
 *
 * 相关模块：
 *  - services/adaptiveEngine.js — Engine 类
 */

import { Answer, Question } from '@/services'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { STRONG_THRESHOLD, WEAK_THRESHOLD } from '@/constants/practice'

/**
 * 用户能力画像（不可变数据类）
 *
 * 唯一事实源：Profile.load() 从 DB 计算后创建。
 * Engine 通过 this.profile 持有实例，强弱项走 getter 委派消除双源。
 *
 * 与 Engine 的分工：
 *   Profile = 用户统计数据（难度 + 强弱项索引），组边界整体替换
 *   Engine  = 会话运行时状态，通过 this.profile 引用 Profile 实例
 *
 * @see services/adaptiveEngine.js — Engine 类（持 Profile 实例）
 * @see utils/algorithm/adaptiveEngine.js — computeDifficultyIdx（原 U 层函数已 inline）
 */
export class Profile {
  /** @param {{ difficultyIdx: number, strongLevelIndices: number[], weakLevelIndices: number[], _rawAnswers?: Array, masteryMap?: Map }} data */
  constructor(data = {}) {
    this.difficultyIdx = data.difficultyIdx ?? 0
    this.strongLevelIndices = data.strongLevelIndices ?? []
    this.weakLevelIndices = data.weakLevelIndices ?? []
    this.masteryMap = data.masteryMap || new Map()
    /** @private 原始 DB 行，供调用方复用避免重复查询 */
    this._rawAnswers = data._rawAnswers ?? null
  }

  /** 当前难度等级的文字标签 */
  get difficultyLabel() {
    return DIFFICULTY_LEVELS[Math.max(0, this.difficultyIdx)]?.label || '—'
  }

  /** 弱项占已知总档位的比例（0-1），越大越严重 */
  get weakSeverity() {
    const total = this.strongLevelIndices.length + this.weakLevelIndices.length
    return total > 0 ? this.weakLevelIndices.length / total : 0
  }

  /** 指定等级是否为强项 */
  isStrong(levelIdx) { return this.strongLevelIndices.includes(levelIdx) }

  /** 指定等级是否为弱项 */
  isWeak(levelIdx) { return this.weakLevelIndices.includes(levelIdx) }

  /**
   * 返回当前用户状态快照（可序列化，用于 session 前后对比）
   * @returns {Object}
   */
  snapshot() {
    return {
      difficultyIdx: this.difficultyIdx,
      strongLevelIndices: [...this.strongLevelIndices],
      weakLevelIndices: [...this.weakLevelIndices],
      totalAnswered: (this._rawAnswers || []).length,
      numMastered: this.masteryMap
        ? [...this.masteryMap.values()].filter(v => v >= Answer.MASTERY_THRESHOLD).length
        : 0,
      createdAt: Date.now(),
    }
  }

  /**
   * 记录一条新 answer：写入 DB + 更新缓存 + 增量 mastery（O(1)）
   * @param {Object|Answer} answerLike — Answer 实例或 raw answerEntry 对象
   */
  async recordAnswer(answerLike) {
    if (!answerLike) return
    const inst = answerLike instanceof Answer ? answerLike : new Answer(answerLike)
    // 写入 DB（Answer.save 自动补齐 questionId）
    await Answer.save(inst)
    // 缓存追加
    this._rawAnswers = this._rawAnswers || []
    this._rawAnswers.push(inst)
    // 增量更新 mastery
    const key = `${inst.equation || ''}_${inst.solution}`
    const cur = this.masteryMap?.get(key) ?? 0
    let delta = 0
    if (inst.isCorrect) {
      if ((inst.previousAttemptCount ?? 0) > 0) {
        const bonus = Answer.MASTERY_MODE_BONUS[inst.inputMode] ?? 0
        delta = Answer.MASTERY_CORRECT_REWARD + bonus
      }
    } else {
      delta = Answer.MASTERY_WRONG_PENALTY
    }
    if (delta !== 0) {
      this.masteryMap = this.masteryMap || new Map()
      this.masteryMap.set(key, Math.max(-999, Math.min(Answer.MASTERY_THRESHOLD, cur + delta)))
    }
  }

  /**
   * 从 DB 加载用户画像
   * 唯一事实源：Answer.getAllByStudent 读 db.answers 全表。
   * 调用方：useAdaptiveSession.js（组边界刷新时 3 处调用）
   *
   * @param {string} [studentId='default']
   * @returns {Promise<Profile>}
   */
  static async load(studentId = 'default') {
    const rows = await Answer.getAllByStudent(studentId)
    const answers = rows.map(r => Answer.fromJSON(r))
    const groups = Question.groupAnswersByLevel(answers)
    const masteryMap = Answer.computeMastery(answers)
    return new Profile({
      difficultyIdx: Profile.computeDifficultyIdx(answers),
      strongLevelIndices: groups.filter(g => g.accuracy >= STRONG_THRESHOLD).map(g => g.levelIdx),
      weakLevelIndices: groups.filter(g => g.accuracy < WEAK_THRESHOLD).map(g => g.levelIdx),
      masteryMap,
      _rawAnswers: rows,
    })
  }

  /**
   * 从答题历史计算用户当前最适合的难度等级
   *
   * 原则：基于已有强弱项，不强推未探索的难度
   * - 从高到低取 accuracy ≥ STRONG_THRESHOLD（强项）的最高档作为 difficultyIdx
   * - 全部强项 → 最高有过数据的档位
   * - 无强项 → 最低有过数据的档位
   * - 无数据 → 0（起步）
   *
   * @param {Array} answers - Answer 实例或 plain object
   * @returns {number} DIFFICULTY_LEVELS 索引
   */
  static computeDifficultyIdx(answers) {
    if (!answers?.length) return 0
    const wrapped = answers.map(a => (a instanceof Answer ? a : new Answer(a)))
    const groups = Question.groupAnswersByLevel(wrapped)
    if (!groups.length) return 0
    groups.sort((a, b) => a.levelIdx - b.levelIdx)
    if (groups.every(g => g.accuracy >= STRONG_THRESHOLD)) {
      const highest = groups[groups.length - 1]
      return Math.min(DIFFICULTY_LEVELS.length - 1, highest.levelIdx + 1)
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].accuracy >= STRONG_THRESHOLD) return groups[i].levelIdx
    }
    return groups[0].levelIdx
  }
}
