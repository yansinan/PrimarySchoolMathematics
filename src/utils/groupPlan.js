/**
 * 自定义练习的分组计划（纯函数，可测）
 *
 * 背景：自定义练习现在把 N 张卷子的题目拍平成一个 listPractices，
 * 分组信息丢失，导致「每组结束都走一次自评」做不到。
 * 这里只做「组计划 → 题号区间」的换算，不碰任何状态。
 *
 * 约定：
 *   - plan 的每一项是「一张卷子的题数」，一张卷子 = 一组练习
 *   - 组内区间左闭右开：[start, end)
 *   - 非法/空 plan → 空数组（调用方据此退回「整轮一组」的旧行为）
 *
 * @example
 *   buildGroupRanges([12, 12, 12])
 *   // [{ index: 1, start: 0, end: 12 }, { index: 2, start: 12, end: 24 }, …]
 */

/**
 * @typedef {Object} GroupRange
 * @property {number} index 组序号（1 基，用于展示「第 2/3 组」）
 * @property {number} start 本组第一题的题号（0 基，含）
 * @property {number} end   本组结束后一题号（0 基，不含）
 */

/**
 * 把组计划换算成题号区间
 * @param {number[]} plan 每组的题数
 * @returns {GroupRange[]}
 */
export function buildGroupRanges(plan) {
  if (!Array.isArray(plan)) return []
  const ranges = []
  let cursor = 0
  for (const raw of plan) {
    const size = Math.floor(Number(raw))
    if (!Number.isFinite(size) || size <= 0) continue
    ranges.push({ index: ranges.length + 1, start: cursor, end: cursor + size })
    cursor += size
  }
  return ranges
}

/**
 * 当前题号落在第几组
 * @param {GroupRange[]} ranges
 * @param {number} questionIndex 0 基题号
 * @returns {number} 组序号（1 基）；找不到返回 0
 */
export function groupIndexOf(ranges, questionIndex) {
  if (!Array.isArray(ranges) || questionIndex < 0) return 0
  const hit = ranges.find(r => questionIndex >= r.start && questionIndex < r.end)
  return hit ? hit.index : 0
}

/**
 * 是否本组最后一题
 * @param {GroupRange[]} ranges
 * @param {number} questionIndex 0 基题号
 * @returns {boolean} 空 ranges 或越界时返回 false（调用方按「整轮最后一题」处理）
 */
export function isLastOfGroup(ranges, questionIndex) {
  if (!Array.isArray(ranges) || !ranges.length) return false
  const hit = ranges.find(r => questionIndex >= r.start && questionIndex < r.end)
  return !!hit && questionIndex === hit.end - 1
}

/**
 * 本组的题号区间
 * @param {GroupRange[]} ranges
 * @param {number} questionIndex 0 基题号
 * @returns {GroupRange | null}
 */
export function rangeOfGroup(ranges, questionIndex) {
  if (!Array.isArray(ranges)) return null
  return ranges.find(r => questionIndex >= r.start && questionIndex < r.end) || null
}

/**
 * 分组是否真的「分了多组」——只有多组才需要组间自评
 * @param {GroupRange[]} ranges
 * @returns {boolean}
 */
export function hasMultipleGroups(ranges) {
  return Array.isArray(ranges) && ranges.length > 1
}
