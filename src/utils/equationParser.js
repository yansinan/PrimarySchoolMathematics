const OPERATOR_SET = ['+', '-', '*', '/', '×', '÷', '＋', '－']

const toEvalSymbols = (expr = '') => {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
}

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
