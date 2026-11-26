/**
 * 练习类型判定 —— 显式 mode 优先于「有 evaluations 就是自适应」的旧推断
 *
 * 背景：自定义练习分多组后会写 evaluations（每组一条自评），
 * 若沿用旧推断，这些轮次会被误标成「自适应」，历史列表与统计都会错。
 */
import { describe, it, expect } from 'vitest'
import { PracticeSession } from '@/services/PracticeSession'

/** 造一条最简 session 记录 */
/** computeSessionStats 读的是 session.config（快照 JSON 字符串） */
function makeSession({ evaluations = null, config = null, completed = true } = {}) {
  return {
    id: 1,
    practiceSessionId: 'ps_test',
    config: config ? JSON.stringify(config) : null,
    evaluations,
    completed,
    createdAt: '2026-11-26T10:00:00.000Z',
  }
}

const evalJson = JSON.stringify([{ group: 1, score: 4, count: 12 }])

describe('PracticeSession.computeSessionStats — 练习类型', () => {
  it('自适应：mode=adaptive', () => {
    const s = PracticeSession.computeSessionStats(
      makeSession({ config: { mode: 'adaptive' } }),
      []
    )
    expect(s.practiceType).toBe('自适应')
  })

  it('旧数据：只有 evaluations、没有 mode → 仍判自适应', () => {
    const s = PracticeSession.computeSessionStats(makeSession({ evaluations: evalJson }), [])
    expect(s.practiceType).toBe('自适应')
  })

  it('自定义练习有自评：mode=manual 时判「自定义」而不是「自适应」', () => {
    const s = PracticeSession.computeSessionStats(
      makeSession({ evaluations: evalJson, config: { mode: 'manual' } }),
      []
    )
    expect(s.practiceType).toBe('自定义')
  })

  it('诊断：mode 缺失但 diagnostic=true', () => {
    const s = PracticeSession.computeSessionStats(
      makeSession({ config: { diagnostic: true } }),
      []
    )
    expect(s.practiceType).toBe('诊断')
  })

  it('普通练习：无 evaluations、无标记', () => {
    const s = PracticeSession.computeSessionStats(makeSession({}), [])
    expect(s.practiceType).toBe('普通')
  })
})
