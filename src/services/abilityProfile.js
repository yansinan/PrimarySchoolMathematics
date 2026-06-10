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

import { Answer } from '@/utils/algorithm/answer'
import { Question } from '@/utils/algorithm/question'
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
  /** @param {{ difficultyIdx: number, strongLevelIndices: number[], weakLevelIndices: number[], _rawAnswers?: Array }} data */
  constructor(data = {}) {
    this.difficultyIdx = data.difficultyIdx ?? 0
    this.strongLevelIndices = data.strongLevelIndices ?? []
    this.weakLevelIndices = data.weakLevelIndices ?? []
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
    return new Profile({
      difficultyIdx: Profile.computeDifficultyIdx(answers),
      strongLevelIndices: groups.filter(g => g.accuracy >= STRONG_THRESHOLD).map(g => g.levelIdx),
      weakLevelIndices: groups.filter(g => g.accuracy < WEAK_THRESHOLD).map(g => g.levelIdx),
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
