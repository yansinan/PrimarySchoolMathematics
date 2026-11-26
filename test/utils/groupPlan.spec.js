/**
 * 分组计划换算 —— 自定义练习「一张卷子 = 一组练习」
 */
import { describe, it, expect } from 'vitest'
import {
  buildGroupRanges,
  groupIndexOf,
  isLastOfGroup,
  rangeOfGroup,
  hasMultipleGroups,
} from '@/utils/groupPlan'

describe('buildGroupRanges', () => {
  it('三张卷子各 12 题 → 三段左闭右开区间', () => {
    expect(buildGroupRanges([12, 12, 12])).toEqual([
      { index: 1, start: 0, end: 12 },
      { index: 2, start: 12, end: 24 },
      { index: 3, start: 24, end: 36 },
    ])
  })

  it('忽略非法项与 0 题组', () => {
    expect(buildGroupRanges([12, 0, -3, 'x', 6])).toEqual([
      { index: 1, start: 0, end: 12 },
      { index: 2, start: 12, end: 18 },
    ])
  })

  it('非数组 → 空数组（调用方退回整轮一组）', () => {
    expect(buildGroupRanges(null)).toEqual([])
    expect(buildGroupRanges(undefined)).toEqual([])
  })
})

describe('groupIndexOf / rangeOfGroup / isLastOfGroup', () => {
  const ranges = buildGroupRanges([12, 12, 12])

  it('题号落在正确组', () => {
    expect(groupIndexOf(ranges, 0)).toBe(1)
    expect(groupIndexOf(ranges, 11)).toBe(1)
    expect(groupIndexOf(ranges, 12)).toBe(2)
    expect(groupIndexOf(ranges, 35)).toBe(3)
  })

  it('越界题号 → 0 / null', () => {
    expect(groupIndexOf(ranges, 36)).toBe(0)
    expect(rangeOfGroup(ranges, -1)).toBeNull()
  })

  it('只在组末题返回 true', () => {
    expect(isLastOfGroup(ranges, 11)).toBe(true)
    expect(isLastOfGroup(ranges, 10)).toBe(false)
    expect(isLastOfGroup(ranges, 35)).toBe(true)   // 最后一组最后一题
    expect(isLastOfGroup(ranges, 36)).toBe(false)  // 越界
  })

  it('空 ranges 一律 false（整轮一组时按老逻辑走）', () => {
    expect(isLastOfGroup([], 5)).toBe(false)
    expect(hasMultipleGroups([])).toBe(false)
  })
})

describe('hasMultipleGroups', () => {
  it('单张卷子不算多组', () => {
    expect(hasMultipleGroups(buildGroupRanges([20]))).toBe(false)
    expect(hasMultipleGroups(buildGroupRanges([12, 12]))).toBe(true)
  })
})
