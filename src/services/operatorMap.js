/**
 * Operator 映射服务 (S 层)
 *
 * 单一来源消除 stores/stats.js ↔ useStatsDrawer.js 的 operator label 重复
 * (ARCHITECTURE.md §3.5 / §2.1 目标树 services/operatorMap.js)
 *
 * 使用:
 *   import { OPERATOR_SYMBOLS, OPERATOR_LABELS, getOperatorSymbol, getOperatorLabel } from '@/services'
 */

/** 运算符 → 图表显示符号（全角：＋ － × ÷） */
export const OPERATOR_SYMBOLS = {
  '+': '＋',
  '-': '－',
  '*': '×',
  '/': '÷',
}

/** 运算符 → 中文名称 */
export const OPERATOR_LABELS = {
  '+': '加法',
  '-': '减法',
  '*': '乘法',
  '/': '除法',
}

/** 取运算符图表符号（找不到 → 返回原字符） */
export function getOperatorSymbol(op) {
  return OPERATOR_SYMBOLS[op] || op
}

/** 取运算符中文名称（找不到 → 返回原字符） */
export function getOperatorLabel(op) {
  return OPERATOR_LABELS[op] || op
}