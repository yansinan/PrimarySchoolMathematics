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
