/**
 * 音效（Web Audio API 实时合成，不依赖任何音频文件）
 *
 * 设计原则：
 *  - 短：单个音效 60~260ms，不拖慢答题节奏
 *  - 轻：音量很低（主增益 0.06~0.1），避免打扰家长和同学
 *  - 悦耳：只用纯音/三角波 + 指数衰减包络，不用方波硬切（刺耳）
 *  - 可关：开关存 localStorage，静默时不创建 AudioContext
 *
 * 各音效语义：
 *   tap      按键（数字键、选项）
 *   correct  答对（上行两度）
 *   wrong    答错（低音下滑，短促不刺耳）
 *   group    完成一组（两音）
 *   complete 完成整轮（三音上行）
 *   start    开始练习（上行）
 *   fail     无
 */

const STORAGE_KEY = 'psm_sfx_enabled'

/** @type {AudioContext|null} */
let ctx = null
/** 用户开关（默认开） */
let enabled = readEnabled()

function readEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function isSfxEnabled() {
  return enabled
}

export function setSfxEnabled(on) {
  enabled = !!on
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0') } catch { /* 隐私模式忽略 */ }
  if (!enabled) {
    // 关掉时挂起上下文，彻底静音
    try { ctx?.suspend?.() } catch { /* ignore */ }
  }
}

function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try { ctx = new AC() } catch { return null }
  }
  // Chrome 自动播放策略：必须在用户手势里 resume
  if (ctx.state === 'suspended') {
    try { ctx.resume() } catch { /* ignore */ }
  }
  return ctx
}

/**
 * 播放一个音
 * @param {number} freq 频率 Hz
 * @param {number} dur 时长 秒
 * @param {object} [opts]
 * @param {number} [opts.delay=0] 相对开始的延迟 秒
 * @param {number} [opts.gain=0.08] 峰值音量
 * @param {OscillatorType} [opts.type='sine'] 波形
 * @param {number} [opts.slideTo] 结束频率（做滑音）
 */
function tone(freq, dur, opts = {}) {
  const ac = getCtx()
  if (!ac) return
  const { delay = 0, gain = 0.08, type = 'sine', slideTo } = opts
  const t0 = ac.currentTime + delay

  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur)

  // 快起慢落，模拟敲击感；指数衰减避免爆音（不能用 0，用 0.0001）
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.3))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const VOICE = {
  // 按键：极短极轻，像指尖敲一下
  tap() { tone(880, 0.045, { gain: 0.035, type: 'sine' }) },

  // 答对：C6 → E6（大三度上行），明亮但不尖
  correct() {
    tone(1046.5, 0.11, { gain: 0.075, type: 'sine' })
    tone(1318.5, 0.16, { gain: 0.065, type: 'sine', delay: 0.085 })
  },

  // 答错：A3 下滑到 F3，短促低沉，不用方波
  wrong() {
    tone(220, 0.16, { gain: 0.07, type: 'triangle', slideTo: 174 })
  },

  // 完成一组：G5 → C6
  group() {
    tone(784, 0.1, { gain: 0.06, type: 'sine' })
    tone(1046.5, 0.14, { gain: 0.06, type: 'sine', delay: 0.09 })
  },

  // 完成整轮：C6 → E6 → G6 上行琶音
  complete() {
    tone(1046.5, 0.12, { gain: 0.06, type: 'sine' })
    tone(1318.5, 0.12, { gain: 0.06, type: 'sine', delay: 0.1 })
    tone(1568, 0.26, { gain: 0.06, type: 'sine', delay: 0.2 })
  },

  // 开始练习：G5 → C6
  start() {
    tone(784, 0.1, { gain: 0.055, type: 'sine' })
    tone(1046.5, 0.18, { gain: 0.055, type: 'sine', delay: 0.08 })
  },
}

/** 各音效上次播放时间（节流用） */
const _lastPlay = Object.create(null)

/**
 * 播放音效
 * @param {'tap'|'correct'|'wrong'|'group'|'complete'|'start'} name
 */
export function playSfx(name) {
  if (!enabled) return
  const fn = VOICE[name]
  if (!fn) return
  // 节流：同一音效 70ms 内不重复叠加。
  // 连对时 correct 会连着响，波形叠加会变吵；节流后只留第一声。
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  if (_lastPlay[name] && now - _lastPlay[name] < 70) return
  _lastPlay[name] = now
  try { fn() } catch { /* 音效失败绝不能影响答题 */ }
}
