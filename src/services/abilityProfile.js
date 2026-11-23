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
import { PracticeSession } from './PracticeSession'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import {
  STRONG_THRESHOLD,
  WEAK_THRESHOLD,
  ACCURACY_THRESHOLDS,
  LEVEL_EVIDENCE_MIN,
} from '@/constants/practice'
import { loadLevelOverride } from '@/utils/store/levelOverride'

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
 * computeDifficultyIdx 已 inline 为本文件 Profile.computeDifficultyIdx 静态方法。
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
   * 练习重点（准备开始界面展示）
   *
   * 只取**当前档位及以下**的弱项：更高的档位这轮根本不会出题
   * （出题上限是 difficultyIdx + 2 的强项池 + 挑战题），把它们当「练习重点」展示
   * 会让孩子看着「多位数×多位数」，实际却在练口诀 —— 手动改过起点档位后尤其明显。
   *
   * @param {number} [limit=3] 最多返回几个
   * @returns {string[]} 档位名称
   */
  getFocusLevels(limit = 3) {
    return [...this.weakLevelIndices]
      .filter(idx => idx <= this.difficultyIdx)
      .sort((a, b) => a - b)
      .slice(0, limit)
      .map(idx => DIFFICULTY_LEVELS[idx]?.label)
      .filter(Boolean)
  }

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
    // 家长手动指定的「起点档位」（设置 → 其他设置）：生效后旧轮次不再参与阶梯
    const override = loadLevelOverride()
    const sessionLevels = await Profile.loadSessionLevels(studentId, override?.since ?? null)
    return new Profile({
      difficultyIdx: Profile.computeDifficultyIdx(answers, sessionLevels, override?.levelIdx ?? null),
      strongLevelIndices: groups.filter(g => g.accuracy >= STRONG_THRESHOLD).map(g => g.levelIdx),
      weakLevelIndices: groups.filter(g => g.accuracy < WEAK_THRESHOLD).map(g => g.levelIdx),
      masteryMap,
      _rawAnswers: rows,
    })
  }

  /**
   * 读取「每轮练习的起始档位」—— 升档阶梯的唯一依据
   *
   * 为什么需要它：一档位里混着三种题（强项 / 弱项 / 挑战），只有「这一轮就是以该档
   * 起练」才算真练过该档。若用「答题命中的档位」统计，挑战题（每轮 3~6 道、档位 +1）
   * 答对 100% 就会被认成该档强项 → 下一轮整体跳档（口诀没练完就窜到多位数乘法）。
   *
   * 数据源：practiceSessions 记录里 profileSnapshot.difficultyIdx（每题写入时一并落库）。
   * 同一 practiceSessionId 有多条记录（首题空壳 / 组 checkpoint / 最终结算），
   * 只取第一条带快照的 —— 即「本轮开始时」的档位。
   *
   * @param {string} [studentId='default']
   * @param {number|null} [since] - 只取该时间点之后创建的轮次（手动指定档位后，旧轮次不再参与阶梯）
   * @returns {Promise<Map<string, number>>} practiceSessionId → 起始档位索引
   */
  static async loadSessionLevels(studentId = 'default', since = null) {
    const levels = new Map()
    const sinceIso = since ? new Date(since).toISOString() : null
    try {
      const rows = await PracticeSession.findAllByStudent(studentId)
      for (const row of rows) {
        const pid = row.practiceSessionId
        if (!pid || levels.has(pid)) continue
        // createdAt 是 ISO 字符串，字典序即时间序
        if (sinceIso && (row.createdAt || '') < sinceIso) continue
        const snapshot = row.profileSnapshot || row.finalProfileSnapshot
        const levelIdx = snapshot?.difficultyIdx
        if (typeof levelIdx === 'number') levels.set(pid, levelIdx)
      }
    } catch { /* 读不到会话记录 → 退化为「诊断定位起点」逻辑 */ }
    return levels
  }

  /**
   * 从答题历史计算用户当前最适合的难度等级
   *
   * 两套规则，按数据条件自动选择：
   *
   * A. 有「每轮起始档位」记录（正常使用后）→ 走阶梯：
   *    从最早的起始档位往上逐档检查，每一档必须
   *      - 有本轮记录（不是被跳过的空档）
   *      - 题量 ≥ LEVEL_EVIDENCE_MIN（不是中途退出 / 少量探针）
   *      - 正确率 ≥ ACCURACY_THRESHOLDS.good（算掌握）
   *    第一个不满足的档位就是当前档位 → 每轮最多升一档，跳过的档位自动回填重练。
   *
   * B. 没有轮次记录（首次诊断 / 手动出题历史 / 旧版数据）→ 沿用诊断定位逻辑：
   *    诊断 5 题只用来定位起点，+1 不跨运算类型（避免「诊断全对直接进乘法」）。
   *
   * C. 家长手动指定了起点档位（utils/store/levelOverride）→ 以该档为 baseline，
   *    只认 baseline 之后新增的轮次；即使还没有新轮次，也直接返回 baseline。
   *
   * @param {Array} answers - Answer 实例或 plain object
   * @param {Map<string, number>} [sessionLevels] - practiceSessionId → 起始档位
   * @param {number|null} [baselineLevel] - 手动指定的起点档位索引
   * @returns {number} DIFFICULTY_LEVELS 索引
   */
  static computeDifficultyIdx(answers, sessionLevels = null, baselineLevel = null) {
    if (!answers?.length) return 0
    const wrapped = answers.map(a => (a instanceof Answer ? a : new Answer(a)))
    const groups = Question.groupAnswersByLevel(wrapped)
    groups.sort((a, b) => a.levelIdx - b.levelIdx)

    const rungs = sessionLevels?.size
      ? [...new Set(sessionLevels.values())].sort((a, b) => a - b)
      : []
    const maxLevel = DIFFICULTY_LEVELS.length - 1
    const startLevel = baselineLevel != null
      ? Math.min(maxLevel, Math.max(0, baselineLevel))
      : (rungs.length ? rungs[0] : null)
    // 无轮次记录、也没手动指定 → 只能靠诊断答题史定位起点
    if (startLevel == null) return groups.length ? Profile._diagnosisDifficultyIdx(groups) : 0

    const rungSet = new Set(rungs)
    const byLevel = Profile._answersBySessionLevel(wrapped, sessionLevels || new Map())
    for (let i = startLevel; i <= maxLevel; i++) {
      const rungAnswers = byLevel.get(i) || []
      // 断档（从没以该档起练过）或题量不足 → 就停在这一档
      if (!rungSet.has(i) || rungAnswers.length < LEVEL_EVIDENCE_MIN) return i
      const rate = rungAnswers.filter(a => a.isCorrect).length / rungAnswers.length
      // 没掌握 → 继续练这一档，不升
      if (rate < ACCURACY_THRESHOLDS.good) return i
    }
    return maxLevel
  }

  /**
   * 按「本轮起始档位」给答案分组（挑战题自动归到它所属的那一轮，不单独成档）
   * @param {Array} answers - Answer 实例
   * @param {Map<string, number>} sessionLevels
   * @returns {Map<number, Array>} 起始档位 → 该轮答案
   */
  static _answersBySessionLevel(answers, sessionLevels) {
    const byLevel = new Map()
    for (const a of answers) {
      const levelIdx = sessionLevels.get(a.practiceSessionId)
      if (typeof levelIdx !== 'number') continue
      if (!byLevel.has(levelIdx)) byLevel.set(levelIdx, [])
      byLevel.get(levelIdx).push(a)
    }
    return byLevel
  }

  /**
   * 诊断定位起点（无轮次记录时使用）
   *
   * 原则：基于已有强弱项，不强推未探索的难度
   * - 从高到低取 accuracy ≥ STRONG_THRESHOLD（强项）的最高档作为 difficultyIdx
   * - 全部强项 → 最高有过数据的档位（+1 且不跨运算类型）
   * - 无强项 → 最低有过数据的档位
   *
   * @param {Array<{levelIdx:number, label:string, total:number, accuracy:number}>} groups
   * @returns {number} DIFFICULTY_LEVELS 索引
   */
  static _diagnosisDifficultyIdx(groups) {
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
