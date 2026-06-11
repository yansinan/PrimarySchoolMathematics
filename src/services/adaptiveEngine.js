/**
 * 自适应练习引擎（Service 层）
 *
 * 将练习分成小组，根据每组的答题效果自动调整下一组的题型、难度和题量。
 *
 * 三维调节：
 * 1. 输入模式: choice2(最简单) → choice4 → vertical_keypad(标准) → horizontal_keypad(掌握验证) — 辅助递减
 * 2. 填空位置: result(标准) → mixed(等式不同位置填空，更难) — 思维挑战递增
 * 3. 难度阶梯: 12级数字/进退位微调
 *
 * 目标：保持信心，探索边界。
 *
 * 升层说明：2026-06-10 从 utils/algorithm/adaptiveEngine.js（U 层）升到 services/（S 层）。
 * 纯函数（computeDifficultyIdx）和 utility 保留在 utils/algorithm/adaptiveEngine.js。
 */

import { sumResponseTimes } from '@/utils/score'
import { EquationSolver } from '@/utils/algorithm/EquationSolver'
import {
  ACCURACY_THRESHOLDS,
  SPEED_THRESHOLDS,
  ASSIST_LEVELS,
  MAX_NORMAL_ASSIST_LEVEL,
  MASTERY_CHECK_CONFIG,
  CONSECUTIVE_GOOD_TO_ADVANCE,
  MIN_GROUPS_PER_DIMENSION,
  PROFILE_RATIOS,
  STRONG_THRESHOLD,
  WEAK_THRESHOLD,
  EVAL_WEAK_THRESHOLD,
} from '@/constants/practice'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { Question } from '@/utils/algorithm/question'
import { Answer, WrongAnswer } from '@/utils/algorithm'
import { generateOneQuestion } from '@/utils/algorithm/adaptiveBatch'

// 小组题量阶梯（每个速度级别对应一个基数）
const GROUP_SIZES = [6, 10, 14, 18, 22]

// ─── 内部辅助函数 ──────────────────────────────────────────────

function weightedRandom(items, weights) {
  if (!items.length) return null
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function generateDistractors(correct, count, wrongPool = [], equation = '') {
  const distractors = new Set()
  if (correct == null || isNaN(correct) || correct <= 0) return []
  // 优先错题库：取同一算式（含交换律/事实家族）的历史错误答案
  if (wrongPool.length && equation) {
    const matches = WrongAnswer.findByEquation(wrongPool, equation, { exact: false })
    for (const w of matches) {
      const v = Number(w.userAnswer)
      if (v !== correct && v > 0 && !distractors.has(v)) distractors.add(v)
      if (distractors.size >= count) return Array.from(distractors).slice(0, count)
    }
  }
  // 算法填充
  const candidates = [
    correct + 1, correct - 1,
    correct + 2, correct - 2,
    correct + 5, correct - 5,
    correct + 10, correct - 10,
    Math.abs(correct - 1),
    correct + (correct > 5 ? -3 : 3),
  ]
  for (const c of candidates) {
    if (c !== correct && c > 0 && !distractors.has(c)) distractors.add(c)
    if (distractors.size >= count) break
  }
  while (distractors.size < count) {
    const r = Math.max(1, correct + Math.floor(Math.random() * 10) - 5)
    if (r !== correct && !distractors.has(r)) distractors.add(r)
  }
  return Array.from(distractors).slice(0, count)
}

function buildReviewQuestion(wa) {
  const eqBody = (wa.equation || '')
    .replace(/=\d+$/, '').replace(/=__$/, '').replace(/=$/, '').trim()
  return {
    equation: `${eqBody}=__`,
    solution: wa.solution,
    inputMode: 'vertical_keypad',
    operator: wa.operator,
    operandMin: wa.operandMin,
    operandMax: wa.operandMax,
    isCarry: wa.isCarry,
    isBorrow: wa.isBorrow,
  }
}

function pickInputMode(engine) {
  if (engine.masteryCheck && engine.masteryCheck.active) return 'horizontal_keypad'
  const r = Math.random()
  const L = engine.assistLevel
  if (L === 2) {
    if (r < 0.70) return 'choice2'
    if (r < 0.90) return 'choice4'
    return 'vertical_keypad'
  }
  if (L === 1) {
    if (r < 0.50) return 'choice4'
    if (r < 0.75) return 'choice2'
    return 'vertical_keypad'
  }
  if (r < 0.70) return 'vertical_keypad'
  if (r < 0.85) return 'choice4'
  return 'choice2'
}

/**
 * 自适应练习引擎（Service 层）
 * 自适应引擎
 *
 * 职责分工：
 *  - Profile（来自 loadProfile）：提供 strong/weakLevelIndices，组边界替换
 *  - Engine#difficultyIdx：own property，会话内由 evaluateGroup / adjustNextQuestion 维护
 *  - strongLevelIndices / weakLevelIndices：通过 getter 委派 this.profile，消除双源
 *
 * 组边界刷新：
 *   engine.profile = await loadProfile()   // 只刷强弱项列表
 *   engine.difficultyIdx 保留，不从 DB 覆盖  // 与会话内运行时难度是两个独立变量
 */
export class Engine {
  constructor({
    difficultyIdx = 0,
    strongLevelIndices = [],
    weakLevelIndices = [],
    targetMin = 10,
    targetMax = 30,
  } = {}) {
    this.profile = { difficultyIdx, strongLevelIndices, weakLevelIndices }
    this.difficultyIdx = difficultyIdx
    this.assistLevel = 0
    this.blankMode = 'result'
    this.groupSizeIdx = 0
    this.totalAnswered = 0
    this.groupIndex = 0
    this.groupsAtThisLevel = 0
    this.consecutiveGood = 0
    this.consecutiveBad = 0
    this.targetMin = targetMin
    this.targetMax = targetMax
    this.masteryCheck = { active: false, horizontalGood: 0, consecutiveVerticalGood: 0 }
    this.lastGroupResult = null
    this.lastEvaluation = null
    this.lastGroupSize = 0
    this.history = []
    this.baseConfig = {
      step: '1', whereIsResult: '0', enableBrackets: false,
      remainder: '3', solution: '0', numberOfPapers: 1,
    }
  }

  get strongLevelIndices() { return this.profile?.strongLevelIndices ?? [] }
  get weakLevelIndices() { return this.profile?.weakLevelIndices ?? [] }

  /** 当前难度标签文字 */
  getDifficultyLabel() {
    const level = DIFFICULTY_LEVELS[this.difficultyIdx]
    return level ? level.label : '综合'
  }

  /** 当前难度标签文字（含组序号） */
  get difficultyLabel() {
    const idx = Math.max(0, this.difficultyIdx)
    return `${DIFFICULTY_LEVELS[idx]?.label || '—'} · 第${this.groupIndex}组`
  }

  /** 当前组的难度配置（含 baseConfig） */
  getDifficultyConfig() {
    const level = DIFFICULTY_LEVELS[this.difficultyIdx] || DIFFICULTY_LEVELS[4]
    return {
      ...this.baseConfig,
      formulaList: level.formulaList,
      carry: level.carry,
      abdication: level.abdication,
      resultMinValue: 1,
      resultMaxValue: level.resultMax,
    }
  }

  getGroupSize() {
    const x = this.groupSizeIdx || 0
    const base = 2 + 4 * x
    const jitter = Math.floor(Math.random() * 5) - 2
    const size = Math.max(4, base + jitter * 2)
    this.lastGroupSize = size
    return size
  }

  diversifyBatch(baseEquations) {
    return baseEquations.map(q => {
      const modeKey = pickInputMode(this)
      const modeConfig = ASSIST_LEVELS.find(m => m.key === modeKey) || ASSIST_LEVELS[0]
      let equation = q.equation
      let solution = q.solution
      let options = undefined
      const eqPart = equation.replace(/\\=$/, '').split('=')[0]
      equation = `${eqPart}=__`
      const recomputed = EquationSolver.solve(equation)
      const mismatch = recomputed == null || recomputed !== solution
      if (mismatch) {
        console.warn('[P0:diversifyBatch] equation=%s solution=%d recomputed=%d → 需要修根因', equation, solution, recomputed)
      }
      if (modeConfig.input === 'options' && modeConfig.optionCount > 0) {
        const count = modeConfig.optionCount
        const distractors = generateDistractors(solution, count - 1, this.wrongAnswerPool, q.equation)
        options = [solution, ...distractors].sort(() => Math.random() - 0.5)
        if (!options.includes(solution)) {
          options = [solution]
          while (options.length < count) {
            const d = solution + (options.length + 1)
            if (d > 0) options.push(d)
          }
          options.sort(() => Math.random() - 0.5)
        }
      }
      return { ...q, equation, solution, options, inputMode: modeKey }
    })
  }

  evaluateGroup(groupAnswers) {
    const engine = this
    const instances = groupAnswers.map(a => a instanceof Answer ? a : new Answer(a))
    const total = instances.length
    const correct = instances.filter(a => a.isCorrect).length
    const rate = total > 0 ? correct / total : 0
    const avgTime = total > 0 ? sumResponseTimes(instances) / total : Infinity
    engine.history = engine.history || []
    engine.history.push({
      groupIdx: engine.groupIndex, difficultyIdx: engine.difficultyIdx,
      assistLevel: engine.assistLevel, blankMode: engine.blankMode,
      groupSizeIdx: engine.groupSizeIdx, total, correct, rate, avgTime,
      evaluation: engine.lastEvaluation,
    })
    engine.lastEvaluation = undefined  // 消费后重置，防止跨组污染
    engine.groupsAtThisLevel = (engine.groupsAtThisLevel || 0) + 1
    const isGood = rate >= ACCURACY_THRESHOLDS.good
    const isBad = rate < ACCURACY_THRESHOLDS.bad
    if (isGood) { engine.consecutiveGood++; engine.consecutiveBad = 0 }
    else if (isBad) { engine.consecutiveBad++; engine.consecutiveGood = 0 }
    else { engine.consecutiveGood = 0; engine.consecutiveBad = 0 }

    let nextSize = this.getGroupSize()
    let done = false
    const maxLevel = DIFFICULTY_LEVELS.length - 1

    if (engine.totalAnswered >= engine.targetMax) { done = true }
    else if (engine.consecutiveGood >= CONSECUTIVE_GOOD_TO_ADVANCE && engine.groupsAtThisLevel >= MIN_GROUPS_PER_DIMENSION) {
      if (engine.difficultyIdx < maxLevel) {
        engine.difficultyIdx = Math.min(maxLevel, engine.difficultyIdx + 1)
        engine.assistLevel = Math.min(MAX_NORMAL_ASSIST_LEVEL, engine.assistLevel + 1)
        engine.groupsAtThisLevel = 0; engine.consecutiveGood = 0; engine.blankMode = 'result'
        nextSize = this.getGroupSize()
      } else { done = true }
    } else if (engine.consecutiveBad >= CONSECUTIVE_GOOD_TO_ADVANCE && engine.groupsAtThisLevel >= MIN_GROUPS_PER_DIMENSION) {
      if (engine.difficultyIdx > 0) {
        engine.difficultyIdx = Math.max(0, engine.difficultyIdx - 1)
        engine.assistLevel = 0; engine.groupsAtThisLevel = 0; engine.consecutiveBad = 0
        nextSize = this.getGroupSize()
      } else { done = true }
    }
    engine.totalAnswered += total; engine.groupIndex++
    return { engine, nextGroupSize: nextSize || this.getGroupSize(), done, history: engine.history }
  }

  generateQuestionPlan(groupIndex, groupSize, isLastGroup = false) {
    const totalStrong = this.strongLevelIndices.length
    const totalWeak = this.weakLevelIndices.length
    const canDoStrong = totalStrong > 0; const canDoWeak = totalWeak > 0
    const hasChallenge = this.difficultyIdx < DIFFICULTY_LEVELS.length - 1
    let groupType
    if (groupIndex === 1) groupType = 'confidence'
    else if (groupIndex === 2) groupType = 'repair'
    else if (isLastGroup) groupType = 'confidence'
    else groupType = 'mixed'
    const cfg = PROFILE_RATIOS[groupType]
    let weakPct
    if (cfg.weak != null) { weakPct = cfg.weak }
    else if (!canDoWeak) { weakPct = 0 }
    else {
      const weakSeverity = this.weakLevelIndices.length / Math.max(1, this.weakLevelIndices.length + this.strongLevelIndices.length)
      weakPct = cfg.weakMin + weakSeverity * (cfg.weakMax - cfg.weakMin)
    }
    let strongPct
    if (!canDoStrong && canDoWeak) { strongPct = 0; weakPct = Math.min(1, (weakPct || 0) + cfg.strong) }
    else if (!canDoStrong && !canDoWeak) { strongPct = 1; weakPct = 0 }
    else { strongPct = cfg.strong }
    if (weakPct == null) weakPct = 0
    if (strongPct == null) strongPct = cfg.strong
    const challengePct = hasChallenge ? (cfg.challenge || 0) : 0
    const challengeCount = Math.floor(groupSize * challengePct)
    const weakCount = Math.floor((groupSize - challengeCount) * weakPct)
    const strongCount = groupSize - challengeCount - weakCount
    const plan = []
    for (let i = 0; i < strongCount; i++) plan.push('strong')
    for (let i = 0; i < weakCount; i++) plan.push('weak')
    for (let i = 0; i < challengeCount; i++) plan.push('challenge')
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]]
    }
    return plan
  }

  adjustNextQuestion(roundAnswers, nextIdx, listPractices) {
    roundAnswers = roundAnswers.map(a => a instanceof Answer ? a : new Answer(a))
    let isReview = false
    if (nextIdx >= 0 && nextIdx < listPractices.length && this.wrongAnswerPool?.length) {
      let streak = 0
      for (let i = roundAnswers.length - 1; i >= 0; i--) {
        if (roundAnswers[i].isCorrect) streak++
        else break
      }
      if (streak >= 3) {
        const candidates = this.wrongAnswerPool.filter(w => {
          const m = Question.matchLevel(w)
          return m && m.levelIdx <= this.difficultyIdx
        })
        if (candidates.length > 0) {
          // 选 mastery 最低的（最不熟的优先复习）
          const wa = candidates.reduce((best, c) =>
            (c.mastery ?? 0) < (best.mastery ?? 0) ? c : best
          )
          const idx = this.wrongAnswerPool.indexOf(wa)
          if (idx >= 0) this.wrongAnswerPool.splice(idx, 1)
          listPractices[nextIdx] = buildReviewQuestion(wa)
          isReview = true
        }
      }
    }
    if (!isReview && nextIdx >= 0 && nextIdx < listPractices.length) {
      const nextQ = listPractices[nextIdx]
      const nextQInst = nextQ instanceof Question ? nextQ : new Question(nextQ)
      const nextMatch = nextQInst.levelMatch
      const nextLevelIdx = nextMatch ? nextMatch.levelIdx : -1
      const inStrong = this.strongLevelIndices.includes(nextLevelIdx)
      const inWeak = this.weakLevelIndices.includes(nextLevelIdx)
      const isChallenge = nextLevelIdx === this.difficultyIdx + 1
      const isCurrent = nextLevelIdx === this.difficultyIdx
      if (!inStrong && !inWeak && !isChallenge && !isCurrent) {
        // P2-1: 即时生成新题替换（不再从 reserve pool 预生成池中取）
        // 用当前 listPractices 已用的 equation 作 seen 去重
        const seen = new Set(listPractices.map(q => (q.equation || '').replace(/=$/, '')))
        const fresh = generateOneQuestion(this.difficultyIdx, this, seen, 'swap')
        if (fresh) {
          const diversified = this.diversifyBatch([fresh])
          if (diversified[0]) listPractices[nextIdx] = diversified[0]
        }
      }
    }
    if (!isReview && this.assistLevel <= 1 && roundAnswers?.length >= 2) {
      const recentTwo = roundAnswers.slice(-2)
      const bothCorrect = recentTwo.every(a => a.isCorrect)
      const notAlreadyHorizontal = listPractices[nextIdx]
        && listPractices[nextIdx].inputMode !== 'horizontal_keypad'
        && !recentTwo.some(a => a.inputMode === 'horizontal_keypad')
      if (bothCorrect && notAlreadyHorizontal && nextIdx >= 0 && nextIdx < listPractices.length) {
        listPractices[nextIdx] = { ...listPractices[nextIdx], inputMode: 'horizontal_keypad' }
        if (this.masteryCheck) this.masteryCheck.horizontalGood = (this.masteryCheck.horizontalGood || 0) + 1
      }
    }
    if (roundAnswers?.length >= 2) {
      let wrongStreak = 0
      for (let i = roundAnswers.length - 1; i >= 0; i--) {
        if (!roundAnswers[i].isCorrect) wrongStreak++
        else break
      }
      if (wrongStreak >= 2 && this.difficultyIdx > 0) {
        this.difficultyIdx = Math.max(0, this.difficultyIdx - 1)
        // P2-1: 连续答错换更简单的题——即时生成（不再从 reserve pool 取）
        if (nextIdx >= 0 && nextIdx < listPractices.length) {
          const seen = new Set(listPractices.map(q => (q.equation || '').replace(/=$/, '')))
          const fresh = generateOneQuestion(this.difficultyIdx, this, seen, 'downshift')
          if (fresh) {
            const diversified = this.diversifyBatch([fresh])
            if (diversified[0]) listPractices[nextIdx] = diversified[0]
          }
        }
      }
    }
    if (!roundAnswers || roundAnswers.length < 3) return
    const groups = Question.groupAnswersByLevel(roundAnswers)
    const histWeakLabels = this.weakLevelIndices
      .map(idx => DIFFICULTY_LEVELS[idx]?.label)
      .filter(Boolean)
    for (const g of groups) {
      if (g.total < 2) continue
      if (histWeakLabels.includes(g.label) && g.accuracy >= STRONG_THRESHOLD) {
        this.assistLevel = Math.min(MAX_NORMAL_ASSIST_LEVEL, this.assistLevel + 1)
        continue
      }
      if (!histWeakLabels.includes(g.label) && g.accuracy < EVAL_WEAK_THRESHOLD) {
        this.assistLevel = Math.max(0, this.assistLevel - 1)
      }
    }
  }

  pickStrongLevel() {
    const indices = this.strongLevelIndices
    if (!indices.length) return null
    const MAX_ADVANCE = 2
    const filtered = indices.filter(i => i <= this.difficultyIdx + MAX_ADVANCE)
    if (!filtered.length) return this.difficultyIdx
    const n = filtered.length
    const weights = Array.from({ length: n }, (_, i) => Math.pow(1.5, i))
    return weightedRandom(filtered, weights)
  }

  pickWeakLevel() {
    const indices = this.weakLevelIndices
    if (!indices.length) return null
    // 从最低难度弱项开始练（indices 天然升序）
    return indices[0]
  }
}
