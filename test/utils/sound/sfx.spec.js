/**
 * 音效模块 — 用假的 AudioContext 数「发了几个音」来锁音效丰富度
 *
 * 不能断言音高（听感是主观的），但可以锁：
 *  - 连对越多音越多（correct 的连击奖励）
 *  - 再次答错比第一次多一个柔和的音（wrong 的 attempt）
 *  - 结束整轮按成绩分档（great / good / encourage）
 *  - 升档、评估完成、满分一组各有独立音效
 *  - 关掉开关 / 无 AudioContext 时安全静音
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  playSfx,
  tierForRate,
  setSfxEnabled,
  isSfxEnabled,
} from '@/utils/sound/sfx'

/** 统计本次测试里「启动了多少个振荡器」 */
let stat
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeOscillator {
  constructor() {
    this.type = 'sine'
    this.frequency = {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    }
  }
  connect() {}
  start() { stat.notes++ }
  stop() {}
}

class FakeGain {
  constructor() {
    this.gain = {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    }
  }
  connect() {}
}

class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.currentTime = 0
    this.destination = {}
  }
  resume() {}
  createOscillator() { return new FakeOscillator() }
  createGain() { return new FakeGain() }
}

/** 播放并返回本次新增的音数 */
async function countNotes(name, payload, gapMs = 0) {
  if (gapMs) await wait(gapMs)
  const before = stat.notes
  playSfx(name, payload)
  return stat.notes - before
}

beforeEach(() => {
  stat = { notes: 0 }
  globalThis.window = { AudioContext: FakeAudioContext }
  setSfxEnabled(true)
})

afterEach(() => {
  delete globalThis.window
})

describe('音效 — 按键音', () => {
  it('数字键 / 退格 / 确认各自有声，且能区分', async () => {
    const tap = await countNotes('tap')
    const back = await countNotes('keyBack', undefined, 80)
    const confirm = await countNotes('keyConfirm', undefined, 80)
    expect(tap).toBeGreaterThan(0)
    expect(back).toBeGreaterThan(0)
    expect(confirm).toBeGreaterThan(0)
    // 三种按键音不是同一个音（音数/音高不同）：确认键是两音上行
    expect(confirm).toBeGreaterThan(back)
  })
})

describe('音效 — 结束整轮的成绩分档', () => {
  it('tierForRate：95 以上优秀、60~94 一般、60 以下鼓励', () => {
    expect(tierForRate(100)).toBe('great')
    expect(tierForRate(95)).toBe('great')
    expect(tierForRate(94)).toBe('good')
    expect(tierForRate(60)).toBe('good')
    expect(tierForRate(59)).toBe('encourage')
    expect(tierForRate(0)).toBe('encourage')
  })

  it('优秀档的音最多，一般与鼓励档更短', async () => {
    const great = await countNotes('complete', { tier: 'great' })
    const good = await countNotes('complete', { tier: 'good' }, 900)
    const encourage = await countNotes('complete', { tier: 'encourage' }, 900)
    expect(great).toBeGreaterThan(good)
    expect(good).toBeGreaterThan(0)
    expect(encourage).toBeGreaterThan(0)
  })
})

describe('音效 — 答对/连对', () => {
  it('基础答对有声，连对 3 / 5 / 10 逐级更长', async () => {
    const base = await countNotes('correct', { streak: 1 })
    const streak3 = await countNotes('correct', { streak: 3 }, 90)
    const streak5 = await countNotes('correct', { streak: 5 }, 90)
    const streak10 = await countNotes('correct', { streak: 10 }, 90)
    expect(base).toBeGreaterThan(1)
    expect(streak3).toBeGreaterThan(base)
    expect(streak5).toBeGreaterThan(streak3)
    expect(streak10).toBeGreaterThan(streak5)
  })
})

describe('音效 — 答错/跳题', () => {
  it('第一次答错一个音，再次答错多一个更柔和的音', async () => {
    const first = await countNotes('wrong', { attempt: 1 })
    const second = await countNotes('wrong', { attempt: 2 }, 90)
    expect(second).toBeGreaterThan(first)
  })

  it('强制跳题有独立的温和提示音', async () => {
    expect(await countNotes('skip')).toBeGreaterThan(1)
  })
})

describe('音效 — 各组收尾 / 升档', () => {
  it('满分一组比普通一组更长', async () => {
    const normal = await countNotes('group', { perfect: false })
    const perfect = await countNotes('group', { perfect: true }, 400)
    expect(perfect).toBeGreaterThan(normal)
  })

  it('升档有独立的琶音', async () => {
    expect(await countNotes('levelup')).toBeGreaterThan(3)
  })

  it('评估完成比整轮完成更轻', async () => {
    const assess = await countNotes('assess')
    const completeGood = await countNotes('complete', { tier: 'good' }, 900)
    expect(assess).toBeGreaterThan(0)
    expect(assess).toBeLessThanOrEqual(completeGood)
  })
})

describe('音效 — 安全边界', () => {
  it('未知音效名不抛错也不发声', async () => {
    expect(await countNotes('not-exist')).toBe(0)
  })

  it('关闭开关后完全静音', async () => {
    setSfxEnabled(false)
    expect(isSfxEnabled()).toBe(false)
    expect(await countNotes('correct', { streak: 5 })).toBe(0)
  })

  it('没有 AudioContext / window 时不抛错', async () => {
    delete globalThis.window
    expect(() => playSfx('correct', { streak: 3 })).not.toThrow()
    expect(() => playSfx('complete', { tier: 'great' })).not.toThrow()
  })
})
