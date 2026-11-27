/**
 * 错因说明：给定「算式 + 正确答案 + 孩子的答案」，说出他大概怎么错的。
 *
 * 与 utils/algorithm/distractors.js 共用同一套错误模型：
 *   那边是「按错因造干扰项」，这边是「按错因解释孩子写下的答案」——同源，便于以后统一维护。
 *
 * 面向孩子：label 短（2~4 字），hint 一句人话，不出现"进位位权"这种术语。
 *
 * @example
 *   explainError({ equation: '27+15=', solution: 42, userAnswer: 32 })
 *   // → { code: 'forgotCarry', label: '忘进位', hint: '个位 7+5=12，要进 1 给十位' }
 */

const OP_ADD = 1
const OP_SUB = 2
const OP_MUL = 3
const OP_DIV = 4

function normalizeOp(operator, equation = '') {
  const asNum = Number(operator)
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 4) return asNum
  const raw = operator || equation.match(/[+\-*/×÷＋－]/)?.[0] || ''
  return ({ '+': OP_ADD, '＋': OP_ADD, '-': OP_SUB, '－': OP_SUB, '*': OP_MUL, '×': OP_MUL, '/': OP_DIV, '÷': OP_DIV })[raw] || 0
}

function parseOperands(equation) {
  if (!equation) return [null, null]
  const body = equation.replace(/=.*$/, '').trim()
  const m = body.match(/^(\d+)\s*[+\-*/×÷＋－]\s*(\d+)$/)
  return m ? [Number(m[1]), Number(m[2])] : [null, null]
}

/** 加法：进位发生在第几位（0 = 没进位） */
function addCarryPos(a, b) {
  let from = 0, carry = 0, x = a, y = b
  for (let k = 0; k < 6; k++) {
    const s = (x % 10) + (y % 10) + carry
    if (s >= 10) { carry = 1; from = Math.max(from, k + 1) } else carry = 0
    x = Math.floor(x / 10); y = Math.floor(y / 10)
    if (x === 0 && y === 0) break
  }
  return from
}

/** 减法：退位发生在第几位（0 = 没退位） */
function subBorrowPos(a, b) {
  let from = 0, borrow = 0, x = a, y = b
  for (let k = 0; k < 6; k++) {
    const d = (x % 10) - borrow - (y % 10)
    if (d < 0) { borrow = 1; from = Math.max(from, k + 1) } else borrow = 0
    x = Math.floor(x / 10); y = Math.floor(y / 10)
    if (x === 0 && y === 0) break
  }
  return from
}

const UNKNOWN = { code: 'unknown', label: '', hint: '' }

/** 兜底：说不出具体错因时，至少告诉孩子「差多少」 */
function diffHint(correct, answer) {
  const d = answer - correct
  if (!Number.isFinite(d) || d === 0) return ''
  return `比正确答案${d > 0 ? '多' : '少'}了 ${Math.abs(d)}`
}

/**
 * 推断错因
 * @param {object} p
 * @param {string} [p.equation] 算式（`27+15=` 或 `27+15=__`）
 * @param {number} p.solution 正确答案
 * @param {number} p.userAnswer 孩子的答案
 * @param {number|string} [p.operator] 归一化运算符（可选）
 * @returns {{ code: string, label: string, hint: string }}
 */
export function explainError({ equation = '', solution, userAnswer, operator } = {}) {
  if (userAnswer == null || userAnswer === '') return UNKNOWN
  const answer = Number(userAnswer)
  const correct = Number(solution)
  if (!Number.isFinite(answer) || !Number.isFinite(correct) || answer === correct) return UNKNOWN

  const [a, b] = parseOperands(equation)
  const op = normalizeOp(operator, equation)
  if (a == null || b == null || !op) return UNKNOWN

  const diff = answer - correct

  if (op === OP_ADD) {
    const carryPos = addCarryPos(a, b)
    if (carryPos && answer === correct - Math.pow(10, carryPos)) {
      return {
        code: 'forgotCarry',
        label: '忘进位',
        hint: `个位 ${a % 10}+${b % 10} 满十了，要进 1 给前一位`,
      }
    }
    if (carryPos && answer === correct + Math.pow(10, carryPos)) {
      return { code: 'overCarry', label: '多进一位', hint: '这一步不该进位，却多进了 1' }
    }
    if (a > b && answer === a - b) {
      return { code: 'opConfused', label: '看成减法', hint: '把「+」看成了「−」' }
    }
    if (Math.abs(diff) === 1) return { code: 'unitsSlip', label: '个位算错', hint: '个位差 1，再看看个位相加' }
    if (Math.abs(diff) === 10) return { code: 'tensSlip', label: '十位算错', hint: '十位差 1，再看看十位' }
    return { code: 'addOther', label: '', hint: diffHint(correct, answer) }
  }

  if (op === OP_SUB) {
    const borrowPos = subBorrowPos(a, b)
    if (borrowPos && answer === correct + Math.pow(10, borrowPos)) {
      return {
        code: 'forgotBorrow',
        label: '忘退位',
        hint: `个位 ${a % 10} 不够减 ${b % 10}，要向十位借 1`,
      }
    }
    if (borrowPos && answer === correct - Math.pow(10, borrowPos)) {
      return { code: 'overBorrow', label: '多借一位', hint: '借了 1 却多减了 10' }
    }
    // 注意：c + 2b 与 a + b 恒等（c = a − b），无法区分「减反了」和「看成加法」，
    // 只保留更常见的后者
    if (answer === a + b) return { code: 'opConfused', label: '看成加法', hint: '把「−」看成了「+」' }
    if (Math.abs(diff) === 1) return { code: 'unitsSlip', label: '个位算错', hint: '个位差 1，再看看个位相减' }
    if (Math.abs(diff) === 10) return { code: 'tensSlip', label: '十位算错', hint: '十位差 1，再看看十位' }
    return { code: 'subOther', label: '', hint: diffHint(correct, answer) }
  }

  if (op === OP_MUL) {
    // 「看成加法」优先：小数字时 a+b 恰好等于某个相邻口诀（2×4 答 6），
    // 但孩子写出两数之和时，更像把乘号看成了加号
    if (answer === a + b) return { code: 'opConfused', label: '看成加法', hint: '把「×」看成了「+」' }
    if (answer === (a + 1) * b || answer === (a - 1) * b || answer === a * (b + 1) || answer === a * (b - 1)) {
      return { code: 'tableDrift', label: '口诀串行', hint: `背到相邻的口诀去了，${a}×${b} 再念一遍` }
    }
    if (Math.abs(diff) === 10) return { code: 'carryLost', label: '进位丢了', hint: '乘积的进位没加上' }
    return { code: 'mulOther', label: '', hint: diffHint(correct, answer) }
  }

  if (op === OP_DIV) {
    if (Math.abs(diff) === 1) return { code: 'trialQuotient', label: '试商偏差', hint: `想一想 ${b}×${correct} 是不是 ${a}` }
    if (a % b && answer === a % b) return { code: 'remainderAsQuotient', label: '把余数当商', hint: '余数不是商，商是能整除的那个数' }
    if (answer === (correct + 1) * b || answer === (correct - 1) * b ||
        answer === (b + 1) * correct || answer === (b - 1) * correct) {
      return { code: 'tableReverse', label: '口诀反向错', hint: `用 ${b}×${correct} 反查一遍` }
    }
    return { code: 'divOther', label: '', hint: diffHint(correct, answer) }
  }

  return UNKNOWN
}
