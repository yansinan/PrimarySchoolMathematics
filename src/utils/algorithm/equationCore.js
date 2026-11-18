/**
 * Equation core utilities — 共享的算式标准化与基础工具函数
 *
 * 把 equationParser / EquationSolver 中重复定义的小工具集中到本文件，
 * 避免多处维护同一份逻辑。本文件是 1.2a 步骤的产物。
 */

/**
 * 将算式中常见的中文/全角运算符统一替换为 JS 可 eval 的标准符号。
 * 用于规范化 `× ÷ ＋ －` 为 `* / + -`。
 *
 * @param {string} [expr='']
 * @returns {string}
 */
export const toEvalSymbols = (expr = '') => {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
}

/**
 * 把 * / 换成数学符号 × ÷（显示用，toEvalSymbols 的逆操作）
 *
 * 只替换运算符位置上的符号。这里用「数字/右括号/未知数 + 运算符 + 数字」的模式，
 * 避免误伤负数或其它场景里出现的 /（本项目的算式只有四则运算，不会有别的用法）。
 * @param {string} [expr='']
 * @returns {string}
 */
export const toDisplaySymbols = (expr = '') => {
  return String(expr)
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
}
