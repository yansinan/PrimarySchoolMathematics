/**
 * 选择题干扰项：按「孩子真实的算错方式」生成，而不是正确答案 ±1/±2/±5 这类机械扰动。
 *
 * 为什么要这么做：
 *  - 机械邻近值（+1/-1/+2/-2/+10）四个选项一眼看上去一样"平"，孩子可以靠数感猜，
 *    起不到诊断作用；真正有价值的是**能区分到底哪一步错了**。
 *  - 每个干扰项对应一个已知错误模型，孩子选错时，错因是可命名的（忘进位 / 忘退位 / 借错位 / 口诀串行…）。
 *
 * 错误模型（小学低年级最常见，按出现频率排序）：
 *
 * 加法 a + b = c
 *   1. 忘进位：个位满十没进上去 → c - 10；十位也满十 → c - 100
 *   2. 多进一位：不该进却进了 → c + 10
 *   3. 个位错 ±1（口算滑手）
 *   4. 十位错 ±10（位值混淆）
 *   5. 运算符看错：把 + 当 - → a - b（结果需为正）
 *
 * 减法 a - b = c
 *   1. 忘退位：个位不够减直接拿大减小 → c + 10
 *   2. 「大减小」：把 a-b 做成 b-a 的位值错觉 → c + 2b（= a - b + 2b）
 *   3. 个位错 ±1 / 十位错 ±10
 *   4. 借位多借一位 → c - 10
 *
 * 乘法 a × b = c
 *   1. 口诀串行：(a±1)×b、a×(b±1)
 *   2. 忘进位：c - 10（个位进位丢），高位乘法漏加 → c - a×10 或 c - b×10（取合法者）
 *   3. 把乘当加：a + b
 *   4. c ± a、c ± b（多算/少算一组）
 *
 * 除法 a ÷ b = c
 *   1. 商 ±1（试商偏差）
 *   2. 乘法口诀反向：(b±1)×c
 *   3. 余数当商 / 少算一组：c ± 1
 *   4. c ± b
 *
 * 输出约定：
 *  - 全部为正整数，去重，且不含正确答案
 *  - 顺序 = 优先级（越靠前越"常见"），调用方取前 N 个即可
 *  - 数量不足时用「同量级的邻近值」补齐（仍然随机，不退回固定序列）
 *
 * @see services/adaptiveEngine.js — generateDistractors 优先用错题库，其次用本模块
 */

const OP_ADD = 1
const OP_SUB = 2
const OP_MUL = 3
const OP_DIV = 4

/** 把算式里的运算符归一化成 1/2/3/4 */
function normalizeOp(operator, equation = '') {
  // 题对象里 operator 可能是数值（1/2/3/4），也可能是符号
  const asNum = Number(operator)
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 4) return asNum
  const raw = operator || equation.match(/[+\-*/×÷＋－]/)?.[0] || ''
  const map = {
    '+': OP_ADD, '＋': OP_ADD,
    '-': OP_SUB, '－': OP_SUB,
    '*': OP_MUL, '×': OP_MUL,
    '/': OP_DIV, '÷': OP_DIV,
  }
  return map[raw] || 0
}

/** 从算式里取两个操作数（a op b = ?），取不到返回 [null, null] */
function parseOperands(equation) {
  if (!equation) return [null, null]
  const body = equation.replace(/=.*$/, '').trim()
  const m = body.match(/^(\d+)\s*[+\-*/×÷＋－]\s*(\d+)$/)
  if (!m) return [null, null]
  return [Number(m[1]), Number(m[2])]
}

/** 10 的 k 次方（k 取 1/2/3，超界按 0 处理） */
function pow10(k) {
  return k >= 1 && k <= 4 ? Math.pow(10, k) : 0
}

/**
 * 加法：进位发生在哪一位
 * @returns {number} 0 = 没进位；1 = 个位进位；2 = 十位进位…
 */
function addCarryPosition(a, b) {
  let carryFrom = 0
  let carry = 0
  let x = a
  let y = b
  for (let k = 0; k < 6; k++) {
    const sum = (x % 10) + (y % 10) + carry
    if (sum >= 10) {
      carry = 1
      carryFrom = Math.max(carryFrom, k + 1)
    } else {
      carry = 0
    }
    x = Math.floor(x / 10)
    y = Math.floor(y / 10)
    if (x === 0 && y === 0) break
  }
  return carryFrom
}

/** 减法：退位发生在哪一位 */
function subBorrowPosition(a, b) {
  let borrowFrom = 0
  let borrow = 0
  let x = a
  let y = b
  for (let k = 0; k < 6; k++) {
    const diff = (x % 10) - borrow - (y % 10)
    if (diff < 0) {
      borrow = 1
      borrowFrom = Math.max(borrowFrom, k + 1)
    } else {
      borrow = 0
    }
    x = Math.floor(x / 10)
    y = Math.floor(y / 10)
    if (x === 0 && y === 0) break
  }
  return borrowFrom
}

/** 只保留正整数、去掉正确答案、去重 */
function makePusher(correct, out) {
  const seen = new Set([correct])
  return (v) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) return
    seen.add(n)
    out.push(n)
  }
}

/**
 * 生成按错误模型排序的干扰项
 *
 * @param {object} params
 * @param {number} params.solution 正确答案
 * @param {string} [params.equation] 算式（用于解析操作数与运算符）
 * @param {number|string} [params.operator] 运算符（1/2/3/4 或 '+'/'×' 等）
 * @param {number} [params.count] 需要的干扰项数量（默认 3）
 * @returns {number[]} 干扰项（正数，不含正确答案）
 */
export function buildErrorDistractors({ solution, equation = '', operator, count = 3 } = {}) {
  const correct = Number(solution)
  if (!Number.isFinite(correct) || correct <= 0) return []
  const [a, b] = parseOperands(equation)
  const op = normalizeOp(operator, equation)
  const out = []
  const push = makePusher(correct, out)

  // 解析不出操作数 → 直接走邻近值补齐
  if (a == null || b == null || !op) {
    pushNearby(correct, out, push)
    return out.slice(0, count)
  }

  if (op === OP_ADD) {
    // ① 忘进位：把进位的那一位减掉
    const carryPos = addCarryPosition(a, b)
    if (carryPos) push(correct - pow10(carryPos))
    // ② 多进一位
    if (correct + 10 > 0) push(correct + 10)
    // ③ 个位 ±1
    push(correct - 1)
    push(correct + 1)
    // ④ 十位 ±10
    push(correct - 10)
    push(correct + 10 === correct ? 0 : correct + 10)
    // ⑤ 把 + 看成 -
    push(a - b)
    // ⑥ 只算个位、漏加十位（位值漏算）
    push(correct - (a % 10 + b % 10 - ((a + b) % 10)))
  } else if (op === OP_SUB) {
    // ① 忘退位：该退没退，结果偏大
    const borrowPos = subBorrowPosition(a, b)
    if (borrowPos) push(correct + pow10(borrowPos))
    // ② 把「−」看成「+」：c + 2b 与 a + b 恒等，取其一即可
    push(a + b)
    // ③ 个位 ±1 / 十位 ±10
    push(correct - 1)
    push(correct + 1)
    push(correct - 10)
    // ④ 多借一位
    if (borrowPos) push(correct - pow10(borrowPos))
  } else if (op === OP_MUL) {
    // ① 口诀串行
    push((a + 1) * b)
    push((a - 1) * b)
    push(a * (b + 1))
    push(a * (b - 1))
    // ② 忘进位（个位进上去的那一位）
    push(correct - 10)
    // ③ 把乘当加
    push(a + b)
    // ④ 多算 / 少算一组
    push(correct + a)
    push(correct - a)
    push(correct + b)
    push(correct - b)
  } else if (op === OP_DIV) {
    // ① 试商偏差
    push(correct + 1)
    push(correct - 1)
    // ② 把余数当商（有余数除法最常见的混淆，优先级高于口诀反向）
    if (a % b) push(a % b)
    // ③ 口诀反向：把商记错成相邻的口诀（(c±1)×b 是孩子实际会算出的数）
    push((correct + 1) * b)
    push((correct - 1) * b)
    push((b + 1) * correct)
    push((b - 1) * correct)
    // ④ 除数数量级错（多/少算一组）
    push(correct + b)
    push(correct - b)
  }

  // 数量不够 → 邻近值补齐（随机，避免固定数列）
  if (out.length < count) pushNearby(correct, out, push)

  return out.slice(0, count)
}

/** 邻近值补齐：±1、±2、±10，顺序随机 */
function pushNearby(correct, out, push) {
  const pool = [correct + 1, correct - 1, correct + 2, correct - 2, correct + 10, correct - 10, correct + 3]
  // Fisher-Yates 打散，避免每次都是同一个次序
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  for (const v of pool) push(v)
}
