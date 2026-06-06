import { toEvalSymbols } from './equationCore'
import { matchLevel } from './adaptiveEngine'

const OPERATOR_SET = ['+', '-', '*', '/', '×', '÷', '＋', '－']

/**
 * @typedef {'+'|'-'|'*'|'/'|'＋'|'－'|''} EquationOperator
 */

/**
 * @typedef {'leftOperand'|'rightOperand'|'result'} BlankPosition
 */

/**
 * @typedef {'carry'|'borrow'|''} CarryType
 */

/**
 * @typedef {Object} ParsedEquation
 * @property {EquationOperator} operator
 * @property {string} leftOperand
 * @property {string} rightOperand
 * @property {string} resultValue
 * @property {BlankPosition} blankPosition
 */

/** @type {ParsedEquation} */
export const EMPTY_PARSED_EQUATION = {
  operator: '',
  leftOperand: '',
  rightOperand: '',
  resultValue: '',
  blankPosition: 'result'
}

/**
 * Parse an equation string into normalized display fields used by question components.
 *
 * @param {string} [equation='']
 * @returns {ParsedEquation}
 */
export const parseEquation = (equation = '') => {
  const normalizedEquation = toEvalSymbols(equation)
  let operator = ''

  for (let i = 0; i < normalizedEquation.length; i++) {
    const char = normalizedEquation[i]
    if (OPERATOR_SET.includes(char)) {
      operator = char
      break
    }
  }

  const operatorIndex = operator ? normalizedEquation.indexOf(operator) : -1
  const equalIndex = normalizedEquation.indexOf('=')

  const leftRaw = operatorIndex === -1 ? normalizedEquation.replace('=', '') : normalizedEquation.substring(0, operatorIndex)

  let rightRaw = ''
  if (operatorIndex !== -1) {
    rightRaw = normalizedEquation.substring(operatorIndex + 1)
    const rightEqualIndex = rightRaw.indexOf('=')
    if (rightEqualIndex !== -1) {
      rightRaw = rightRaw.substring(0, rightEqualIndex)
    }
  }

  const resultRaw = equalIndex === -1 ? '' : normalizedEquation.substring(equalIndex + 1)

  const leftOperand = leftRaw.replace('__', '')
  const rightOperand = rightRaw.replace('__', '')
  const resultValue = resultRaw.replace('__', '')

  let blankPosition = 'result'
  if (normalizedEquation.includes('__')) {
    if (!operator || operatorIndex === -1) {
      blankPosition = 'result'
    } else {
      const blankIndex = normalizedEquation.indexOf('__')
      const finalEqualIndex = equalIndex === -1 ? normalizedEquation.length : equalIndex
      if (blankIndex < operatorIndex) {
        blankPosition = 'leftOperand'
      } else if (blankIndex > operatorIndex && blankIndex < finalEqualIndex) {
        blankPosition = 'rightOperand'
      } else {
        blankPosition = 'result'
      }
    }
  }

  return {
    operator,
    leftOperand,
    rightOperand,
    resultValue,
    blankPosition
  }
}

/**
 * Return carry/borrow type based on parsed equation operands.
 *
 * @param {ParsedEquation} parsedEquation
 * @returns {CarryType}
 */
export const getCarryType = (parsedEquation) => {
  const left = parseInt(parsedEquation.leftOperand) || 0
  const right = parseInt(parsedEquation.rightOperand) || 0
  const operator = parsedEquation.operator

  if (operator === '+' || operator === '＋') {
    const leftLast = left % 10
    const rightLast = right % 10
    if (leftLast + rightLast >= 10) {
      return 'carry'
    }
  }

  if (operator === '-' || operator === '－') {
    const leftLast = left % 10
    const rightLast = right % 10
    if (leftLast < rightLast) {
      return 'borrow'
    }
  }

  return ''
}

/**
 * 提取算式元数据(用于答案记录的入参元数据)
 *
 * 抽离自 Practice.vue handleSubmit (L378-388):
 *   - 9 行重复的 operator / isCarry / isBorrow / operandMin / operandMax 提取
 *
 * @param {string} equation - 算式字符串, 如 "23+47="
 * @param {object} [currentQuestion] - 当前题目对象(用于 stepCount 兜底)
 * @returns {{
 *   operator: string,
 *   isCarry: boolean,
 *   isBorrow: boolean,
 *   stepCount: number,
 *   operandMin: number,
 *   operandMax: number,
 * }}
 */
export function extractQuestionMetadata(equation, currentQuestion = null) {
  const parsed = parseEquation(equation)
  const operator = parsed?.operator || ''
  const isCarry = getCarryType(parsed) === 'carry'
  const isBorrow = getCarryType(parsed) === 'borrow'
  const leftVal = parseInt(parsed?.leftOperand) || 0
  const rightVal = parseInt(parsed?.rightOperand) || 0
  const operandMin = Math.min(leftVal, rightVal)
  const operandMax = Math.max(leftVal, rightVal)
  const stepCount = currentQuestion?.stepCount || 1
  return { operator, isCarry, isBorrow, stepCount, operandMin, operandMax }
}

/**
 * inputMode → { layout, assistLevel }
 */
const _DISP_MODE = {
  choice2:          { layout: 'horizontal', assistLevel: 0 },
  choice4:          { layout: 'horizontal', assistLevel: 1 },
  vertical_keypad:  { layout: 'vertical',   assistLevel: 2 },
  horizontal_keypad:{ layout: 'horizontal', assistLevel: 3 },
}

/**
 * 对一道题进行全字段推导 —— 补全 raw 题目对象中缺失的派生字段
 *
 * 输入是 store 中 listPractices 的原始条目（equation + solution + inputMode 等），
 * 输出是包含以下所有字段的规范化对象：
 *   基础 → equation, solution, options, inputMode, difficulty, ...
 *   派生 → operator, operandMin, operandMax, isCarry, isBorrow,
 *          layout, blankMode, assistLevel, difficultyIdx
 *
 * U 层纯函数，无状态，无 IO。
 *
 * @param {object|null} q - 原始题目对象
 * @returns {object} 补齐派生字段后的题目对象
 */
export function enrichQuestion(q) {
  if (!q) return null
  const eq = q.equation || ''
  const parsed = parseEquation(eq)
  const meta = extractQuestionMetadata(eq, q)
  const dm = _DISP_MODE[q.inputMode] || {}
  const matched = matchLevel(q)

  return {
    ...q,
    operator:       q.operator  || meta.operator,
    operandMin:     q.operandMin != null ? q.operandMin : meta.operandMin,
    operandMax:     q.operandMax != null ? q.operandMax : meta.operandMax,
    isCarry:        q.isCarry   ?? meta.isCarry,
    isBorrow:       q.isBorrow  ?? meta.isBorrow,
    layout:         q.layout    || dm.layout || '—',
    blankMode:      q.blankMode || (eq.includes('__') ? parsed.blankPosition : '—'),
    assistLevel:    q.assistLevel ?? dm.assistLevel ?? '—',
    difficultyIdx:  q.difficultyIdx ?? (matched ? matched.levelIdx : '—'),
  }
}
