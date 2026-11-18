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
/**
 * 判断一个 profile 是否代表「已完成真实能力评估」
 *
 * 为什么不能用 practiceStore.phase === 'practice' 判断：
 *   手动出题（Generate.vue#generateFormulas）也会把 phase 设为 'practice'，
 *   于是从没做过诊断的用户也会被当成「评估已完成」。
 *
 * 判据与 Practice.vue onMounted 一致：有难度索引 / 有强项 / 有弱项，三者任一即为真。
 *
 * @param {Profile|null|undefined} profile
 * @returns {boolean}
 */
export function hasRealProfile(profile) {
  if (!profile) return false
  return (profile.difficultyIdx > 0)
    || ((profile.strongLevelIndices?.length ?? 0) > 0)
    || ((profile.weakLevelIndices?.length ?? 0) > 0)
}

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
      const nextIdx = Math.min(DIFFICULTY_LEVELS.length - 1, highest.levelIdx + 1)
      // 只在同一运算类型内 +1。
      // 跨学段推档会造成「诊断 5 题全对 → 直接进乘法」这类跳级：
      // 两位数加减的最高档（8 进退位巩固）+1 正好是 9（乘法口诀·2~6）。
      // 真实升档交给引擎的「连续多组成绩稳定」机制，诊断只负责定位起点。
      if (Profile._opKind(DIFFICULTY_LEVELS[nextIdx]) !== Profile._opKind(DIFFICULTY_LEVELS[highest.levelIdx])) {
        return highest.levelIdx
      }
      return nextIdx
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].accuracy >= STRONG_THRESHOLD) return groups[i].levelIdx
    }
    return groups[0].levelIdx
  }

  /** 档位的运算类型：加减统一归为 'as'（它的 operators 可能是 null 或 [1,2]） */
  static _opKind(level) {
    const ops = (level?.formulaList || []).flatMap(f => f.operators || [])
    if (!ops.length) return 'as'
    if (ops.includes(3) && !ops.includes(4)) return 'mul'
    if (ops.includes(4) && !ops.includes(3)) return 'div'
    return 'as'
  }
}
