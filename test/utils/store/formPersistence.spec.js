/**
 * 表单状态局部更新 —— 准备开始页改「练习量」用
 *
 * 关键约束：只合并指定字段，不能把出题抽屉里的其它设置冲掉。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadFormState,
  saveFormState,
  patchFormState,
} from '@/utils/store/formPersistence'

/** 内存版 localStorage（vitest 环境是 node） */
function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
  return map
}

/** saveFormState 有 400ms debounce —— 假定时器要**先**启用，才能接管那次 setTimeout */
function flushDebounce() {
  vi.runAllTimers()
}

const BASE_FORM = {
  step: '1',
  numberOfFormulas: 30,
  targetMin: 10,
  targetMax: 30,
  carry: '1',
  abdication: '1',
  remainder: '3',
}

beforeEach(() => {
  installLocalStorage()
  vi.useFakeTimers()          // 必须早于 saveFormState，否则真定时器不受控
})
afterEach(() => {
  vi.useRealTimers()
  delete globalThis.localStorage
})

describe('patchFormState', () => {
  it('只覆盖指定字段，其它设置保留', async () => {
    saveFormState({ ...BASE_FORM }, [])
    flushDebounce()

    expect(patchFormState({ targetMin: 20, targetMax: 40 })).toBe(true)
    flushDebounce()

    const state = loadFormState()
    expect(state.formData.targetMin).toBe(20)
    expect(state.formData.targetMax).toBe(40)
    // 其它字段没被动
    expect(state.formData.numberOfFormulas).toBe(30)
    expect(state.formData.carry).toBe('1')
  })

  it('没有旧状态时返回 false，不创建半份表单', async () => {
    expect(patchFormState({ targetMin: 20 })).toBe(false)
    flushDebounce()
    expect(loadFormState()).toBeNull()
  })

  it('非法入参不写盘', () => {
    saveFormState({ ...BASE_FORM }, [])
    expect(patchFormState(null)).toBe(false)
    expect(patchFormState('x')).toBe(false)
  })
})
