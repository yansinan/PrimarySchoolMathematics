/**
 * 难度匹配（纯函数，无状态，无 IO）
 *
 * 提取自 question.js——独立出来避免 equationParser 与 question 的循环依赖。
 *
 * @see utils/algorithm/question.js
 * @see utils/algorithm/equationParser.js
 */

import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const _OP_TO_NUM = { '+': 1, '-': 2, '*': 3, '/': 4, '×': 3, '÷': 4, '＋': 1, '－': 2 }

/** 从算式拆出两个操作数 */
function _parseOperands(equation, operator) {
  if (!equation || !operator) return [null, null]
  const eq = equation.replace(/=.*$/, '').trim()
  const idx = eq.indexOf(operator)
  if (idx === -1) return [null, null]
  const left = parseInt(eq.substring(0, idx).trim())
  const right = parseInt(eq.substring(idx + 1).trim())
  if (isNaN(left) || isNaN(right)) return [null, null]
  return [left, right]
}

/** 加法是否进位（个位相加≥10） */
function _isCarry(a, b) {
  return (a % 10) + (b % 10) >= 10
}

/** 减法是否退位 */
function _isBorrow(a, b, opNum) {
  if (opNum !== 2) return false
  return (a % 10) < (b % 10)
}

/**
 * 将一道题匹配到 DIFFICULTY_LEVELS 档位
 * @param {object} answer
 * @returns {{ levelIdx: number, label: string } | null}
 */
export function matchLevel(answer) {
  if (!answer || !answer.equation) return null
  const opChar = answer.operator || answer.equation.replace(/=.*$/, '').trim().match(/[+\-*/×÷＋－]/)?.[0] || ''
  const opNum = _OP_TO_NUM[opChar]
  if (opNum == null) return null
  const [a, b] = (answer.operandMin != null && answer.operandMax != null)
    ? [answer.operandMin, answer.operandMax]
    : _parseOperands(answer.equation, opChar)
  if (a == null || b == null) return null
  const operandMin = Math.min(a, b)
  const operandMax = Math.max(a, b)
  const hasCarry = answer.isCarry ?? _isCarry(a, b)
  const hasBorrow = answer.isBorrow ?? _isBorrow(a, b, opNum)
  for (let i = 0; i < DIFFICULTY_LEVELS.length; i++) {
    const level = DIFFICULTY_LEVELS[i]
    if (opNum === 1) {
      if (level.carry === '2' && !hasCarry) continue
      if (level.carry === '3' && hasCarry) continue
    }
    if (opNum === 2) {
      if (level.abdication === '2' && !hasBorrow) continue
      if (level.abdication === '3' && hasBorrow) continue
    }
    const rangeMatch = (() => {
      const specific = level.formulaList.find(f => {
        if (operandMax > f.max) return false
        if (!(operandMin >= f.min || operandMax >= f.min)) return false
        return f.operators != null && f.operators.includes(opNum)
      })
      if (specific) return true
      const hasExplicitOp = level.formulaList.some(f => f.operators != null)
      if (hasExplicitOp) return false
      return level.formulaList.some(f => {
        if (operandMax > f.max) return false
        if (!(operandMin >= f.min || operandMax >= f.min)) return false
        return f.operators == null
      })
    })()
    if (!rangeMatch) continue
    return { levelIdx: i, label: level.label }
  }
  return null
}

/**
 * 将答题记录按 matchLevel 分组
 * @param {Array} answers
 * @returns {Array<{levelIdx:number, label:string, total:number, correct:number, accuracy:number}>}
 */
export function groupAnswersByLevel(answers) {
  const map = {}
  for (const a of (answers || [])) {
    const match = matchLevel(a)
    if (!match) continue
    const key = match.levelIdx
    if (!map[key]) {
      map[key] = { levelIdx: key, label: match.label, total: 0, correct: 0 }
    }
    map[key].total++
    if (a.isCorrect) map[key].correct++
  }
  return Object.values(map).map((g) => ({
    ...g,
    accuracy: g.total > 0 ? g.correct / g.total : 0,
  }))
}
