/**
 * decideListPracticesTransition 单测（纯函数）
 *
 * @see composables/useListPracticesGuard.js
 */
import { describe, it, expect } from 'vitest'
import { decideListPracticesTransition } from '@/composables/useListPracticesGuard'

describe('decideListPracticesTransition', () => {
  // ── GROUP_START 分支 ──

  describe('GROUP_START（题目非空）', () => {
    it('第一组（首次进入，无 isAdaptiveTransition）→ 清空 answers', () => {
      const result = decideListPracticesTransition({
        newList: [{ id: 1 }, { id: 2 }],
        savedAnswers: [],
        isAdaptiveTransition: false,
        hasAdaptiveEngine: false,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('GROUP_START')
      expect(result.action.savedAnswers).toEqual([])
      expect(result.action.offset).toBe(0)
      expect(result.action.shouldRestoreAnswers).toBe(false)
    })

    it('adaptive 第 2+ 组（isAdaptiveTransition=true）→ 保留 savedAnswers', () => {
      const saved = [
        { id: 1, isCorrect: true },
        { id: 2, isCorrect: true },
        { id: 3, isCorrect: false },
      ]
      const result = decideListPracticesTransition({
        newList: [{ id: 4 }, { id: 5 }],
        savedAnswers: saved,
        isAdaptiveTransition: true,
        hasAdaptiveEngine: true,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('GROUP_START')
      expect(result.action.savedAnswers).toEqual(saved)
      expect(result.action.offset).toBe(3)
      expect(result.action.shouldRestoreAnswers).toBe(true)
    })

    it('savedAnswers 不应被引用修改（防御性 copy）', () => {
      const saved = [{ id: 1 }]
      const result = decideListPracticesTransition({
        newList: [{ id: 2 }],
        savedAnswers: saved,
        isAdaptiveTransition: true,
        hasAdaptiveEngine: true,
        hasProfile: true,
        phase: 'practice',
      })
      // 修改返回的 savedAnswers 不应影响原数组
      result.action.savedAnswers.push({ id: 999 })
      expect(saved).toHaveLength(1)
    })

    it('shouldResetCurrentIndex / shouldReinitPractice 始终为 true', () => {
      const result = decideListPracticesTransition({
        newList: [{ id: 1 }],
        savedAnswers: [],
        isAdaptiveTransition: false,
        hasAdaptiveEngine: false,
        hasProfile: false,
        phase: 'idle',
      })
      expect(result.action.shouldResetCurrentIndex).toBe(true)
      expect(result.action.shouldReinitPractice).toBe(true)
    })
  })

  // ── COMPLETION 分支 ──

  describe('COMPLETION（题目空，防御性修复）', () => {
    it('有画像 + adaptiveEngine 未就绪 → START_ADAPTIVE', () => {
      const result = decideListPracticesTransition({
        newList: [],
        hasAdaptiveEngine: false,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('COMPLETION')
      expect(result.action.kind).toBe('START_ADAPTIVE')
    })

    it('练习模式 + 无画像 → RESTART_DIAGNOSTIC', () => {
      const result = decideListPracticesTransition({
        newList: [],
        hasAdaptiveEngine: false,
        hasProfile: false,
        phase: 'practice',
      })
      expect(result.type).toBe('COMPLETION')
      expect(result.action.kind).toBe('RESTART_DIAGNOSTIC')
    })

    it('adaptiveEngine 已就绪 + 题目空 → NOOP（避免覆盖运行中的 engine）', () => {
      const result = decideListPracticesTransition({
        newList: [],
        hasAdaptiveEngine: true,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('NOOP')
      expect(result.action).toBeNull()
    })

    it('无画像 + 非 practice 阶段（idle / assessment）→ NOOP', () => {
      const idle = decideListPracticesTransition({
        newList: [], hasAdaptiveEngine: false, hasProfile: false, phase: 'idle',
      })
      const assess = decideListPracticesTransition({
        newList: [], hasAdaptiveEngine: false, hasProfile: false, phase: 'assessment',
      })
      expect(idle.type).toBe('NOOP')
      expect(assess.type).toBe('NOOP')
    })
  })

  // ── 边界条件 ──

  describe('边界条件', () => {
    it('newList 为空数组（非 null/undefined）→ 走 COMPLETION 逻辑', () => {
      const result = decideListPracticesTransition({
        newList: [],
        hasAdaptiveEngine: false,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('COMPLETION')
    })

    it('newList 为单个题目 → GROUP_START', () => {
      const result = decideListPracticesTransition({
        newList: [{ id: 1 }],
        savedAnswers: [],
        hasAdaptiveEngine: false,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.type).toBe('GROUP_START')
    })

    it('savedAnswers 缺省时不影响 GROUP_START（应为空数组）', () => {
      const result = decideListPracticesTransition({
        newList: [{ id: 1 }],
        // savedAnswers 故意省略
        isAdaptiveTransition: false,
        hasAdaptiveEngine: false,
        hasProfile: true,
        phase: 'practice',
      })
      expect(result.action.savedAnswers).toEqual([])
      expect(result.action.offset).toBe(0)
    })
  })
})
