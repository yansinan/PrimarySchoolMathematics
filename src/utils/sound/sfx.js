/**
 * 音效（Web Audio API 实时合成，不依赖任何音频文件）
 *
 * 设计原则：
 *  - 短：单个音效 60~420ms，不拖慢答题节奏
 *  - 轻：音量很低（主增益 0.02~0.08），避免打扰家长和同学
 *  - 悦耳：只用纯音/三角波 + 指数衰减包络，不用方波硬切（刺耳）
 *  - 不评判：答错/跳题/成绩一般都用「温和提示」，不用下滑的悲伤音、不用蜂鸣
 *  - 可关：开关存 localStorage，静默时不创建 AudioContext
 *
 * 各音效语义（★ = 本次新增/增强）：
 *   tap       按键（数字键、选项）
 *   correct   答对 —— 基础两音（C6→E6）+ 一点高频闪光
 *   ★ 连对奖励：streak ≥3 加一音、≥5 再上一层、≥10 短琶音（同一 correct 音效）
 *   wrong     答错 —— 低音下滑，短促不刺耳
 *   ★ 再次答错：attempt ≥2 追加第二个更柔的低音（「再想想」而不是「你又错了」）
 *   ★ skip      错满重试上限强制跳题 —— 温和下行的两音
 *   group     完成一组 —— G5→C6
 *   ★ 满分一组：perfect=true 追加高音闪光
 *   ★ levelup    升档（自适应难度 +1）—— 四级上行琶音
 *   ★ complete   结束整轮，按成绩分三档：
 *        great     ≥95%（长琶音 + 闪光）
 *        good      其余（三音上行，原行为）
 *        encourage <60%（温暖的上行三音，不丧）
 *   ★ assess    能力评估完成 —— 柔和两音（比 complete 轻）
 *   start     开始练习 —— G5→C6
 */

import { writeSetting } from '@/utils/store/settingsRegistry'

const STORAGE_KEY = 'psm_sfx_enabled'

/** 同一音效的节流时间（毫秒）：连对时 correct 会连续触发，避免波形叠加变吵 */
const THROTTLE_MS = {
  tap: 60,
  keyBack: 60,
  keyConfirm: 90,
  correct: 70,
  wrong: 70,
  skip: 200,
  group: 300,
  levelup: 800,
  complete: 800,
  assess: 800,
  start: 1200,   // 开始练习：点击与「新一轮」两条路径都会调，1.2s 内只响一次
}

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

/**
 * 重新从存储读取开关（同步把 `psm_sfx_enabled` 写进来后调用）
 * 模块级 `enabled` 只在加载时读一次，不刷新的话界面会显示旧值。
 */
export function reloadSfxEnabled() {
  enabled = readEnabled()
  if (!enabled) {
    try { ctx?.suspend?.() } catch { /* ignore */ }
  }
  return enabled
}

export function setSfxEnabled(on) {
  enabled = !!on
  // 走配置注册表：音效开关也参与多设备同步
  writeSetting(STORAGE_KEY, enabled ? '1' : '0')
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

// 音名 → 频率（只列用到的，避免引入音阶表）
const N = {
  A3: 220, D4: 293.66, F4: 349.23, G4: 392, A4: 440, C5: 523.25, E5: 659.25,
  F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.5,
  G6: 1567.98, A6: 1760, C7: 2093, E7: 2637,
}

const VOICE = {
  // 数字键 / 选项：短促的「塑料按键」感（主音 + 一点高频头，像指尖敲键帽）
  tap() {
    tone(660, 0.042, { gain: 0.045, type: 'sine' })
    tone(N.E6, 0.016, { gain: 0.012, type: 'sine', delay: 0.004 })
  },

  // 退格：比数字键低一点、带一点下滑，区分「删掉一位」
  keyBack() {
    tone(N.A4, 0.038, { gain: 0.04, type: 'sine', slideTo: 330 })
  },

  // 确认 / 提交：两音快速上行（很短，不和随后的对/错音抢戏）
  keyConfirm() {
    tone(660, 0.03, { gain: 0.04, type: 'sine' })
    tone(N.A5, 0.045, { gain: 0.035, type: 'sine', delay: 0.028 })
  },

  /**
   * 答对：C6 → E6，再补一点高频闪光。
   * 连对越多，追加的音越高（不给文字，孩子也能听出「连击」）。
   */
  correct({ streak = 0 } = {}) {
    tone(N.C6, 0.1, { gain: 0.07, type: 'sine' })
    tone(N.E6, 0.14, { gain: 0.06, type: 'sine', delay: 0.08 })
    tone(N.C7, 0.05, { gain: 0.018, type: 'sine', delay: 0.02 })   // 闪光
    if (streak >= 3) tone(N.G6, 0.12, { gain: 0.055, type: 'sine', delay: 0.17 })
    if (streak >= 5) tone(N.C7, 0.14, { gain: 0.05, type: 'sine', delay: 0.27 })
    if (streak >= 10) tone(N.E7, 0.12, { gain: 0.04, type: 'sine', delay: 0.36 })
  },

  /**
   * 答错：A3 下滑到 F3，短促低沉。
   * 同一题再次答错时追加一个更柔的下行音（attempt 从 1 开始）。
   */
  wrong({ attempt = 1 } = {}) {
    tone(N.A3, 0.16, { gain: 0.065, type: 'triangle', slideTo: 174 })
    if (attempt >= 2) {
      tone(174, 0.18, { gain: 0.045, type: 'triangle', delay: 0.14, slideTo: 146.83 })
    }
  },

  // 错满重试上限、强制跳题：温和的下行两音（不是惩罚音）
  skip() {
    tone(N.D4, 0.1, { gain: 0.05, type: 'sine' })
    tone(N.A3, 0.16, { gain: 0.045, type: 'sine', delay: 0.1 })
  },

  // 完成一组：G5 → C6；满分再补一个明亮的上行
  group({ perfect = false } = {}) {
    tone(N.G5, 0.1, { gain: 0.055, type: 'sine' })
    tone(N.C6, 0.14, { gain: 0.055, type: 'sine', delay: 0.09 })
    if (perfect) {
      tone(N.E6, 0.1, { gain: 0.045, type: 'sine', delay: 0.2 })
      tone(N.G6, 0.16, { gain: 0.04, type: 'sine', delay: 0.28 })
    }
  },

  // 升档：C6 → E6 → G6 → C7 四级上行（和「完成整轮」区分开：更短、更轻快）
  levelup() {
    tone(N.C6, 0.08, { gain: 0.05, type: 'sine' })
    tone(N.E6, 0.08, { gain: 0.05, type: 'sine', delay: 0.07 })
    tone(N.G6, 0.08, { gain: 0.05, type: 'sine', delay: 0.14 })
    tone(N.C7, 0.18, { gain: 0.045, type: 'sine', delay: 0.21 })
    tone(N.E7, 0.06, { gain: 0.02, type: 'sine', delay: 0.22 })
  },

  /**
   * 结束整轮：按成绩分三档，短促、不拖沓
   *  great     ≥95%：五音长琶音 + 高频闪光
   *  good      其余：三音上行（原行为）
   *  encourage <60%：温暖的上行三音（不丧，也不敷衍）
   */
  complete({ tier = 'good' } = {}) {
    if (tier === 'great') {
      tone(N.C6, 0.1, { gain: 0.06, type: 'sine' })
      tone(N.E6, 0.1, { gain: 0.06, type: 'sine', delay: 0.09 })
      tone(N.G6, 0.1, { gain: 0.06, type: 'sine', delay: 0.18 })
      tone(N.C7, 0.22, { gain: 0.055, type: 'sine', delay: 0.27 })
      tone(N.E7, 0.26, { gain: 0.03, type: 'sine', delay: 0.3 })
    } else if (tier === 'encourage') {
      tone(N.G4, 0.14, { gain: 0.05, type: 'sine' })
      tone(N.C5, 0.14, { gain: 0.05, type: 'sine', delay: 0.13 })
      tone(N.E5, 0.2, { gain: 0.05, type: 'sine', delay: 0.26 })
    } else {
      tone(N.C6, 0.12, { gain: 0.06, type: 'sine' })
      tone(N.E6, 0.12, { gain: 0.06, type: 'sine', delay: 0.1 })
      tone(N.G6, 0.24, { gain: 0.06, type: 'sine', delay: 0.2 })
    }
  },

  // 能力评估完成：比「完成整轮」更轻 —— 只是「评估好了，可以开始了」
  assess() {
    tone(N.E5, 0.1, { gain: 0.05, type: 'sine' })
    tone(N.A5, 0.12, { gain: 0.05, type: 'sine', delay: 0.1 })
    tone(N.C6, 0.16, { gain: 0.04, type: 'sine', delay: 0.2 })
  },

  // 开始练习：G5 → C6
  start() {
    tone(N.G5, 0.1, { gain: 0.055, type: 'sine' })
    tone(N.C6, 0.18, { gain: 0.055, type: 'sine', delay: 0.08 })
  },
}

/** 各音效上次播放时间（节流用） */
const _lastPlay = Object.create(null)

/**
 * 按正确率给「结束整轮」音效分档（阈值与 constants/practice 的评语分档一致：
 * ≥95 优秀 / ≥60 一般 / <60 鼓励）
 * @param {number} rate 正确率百分比 0~100
 * @returns {'great'|'good'|'encourage'}
 */
export function tierForRate(rate) {
  const r = Number(rate) || 0
  if (r >= 95) return 'great'
  if (r < 60) return 'encourage'
  return 'good'
}

/**
 * 播放音效
 * @param {string} name - 'tap'|'correct'|'wrong'|'skip'|'group'|'levelup'|'complete'|'assess'|'start'
 * @param {object} [payload] - 供音效微调的上下文
 *   correct: { streak }  连对数
 *   wrong:   { attempt } 第几次答错（从 1 开始）
 *   group:   { perfect } 是否满分一组
 *   complete:{ tier }    'great' | 'good' | 'encourage'
 */
export function playSfx(name, payload) {
  if (!enabled) return
  const fn = VOICE[name]
  if (!fn) return
  // 节流：同一音效短时间内不重复叠加（连对时 correct 会连着响，叠加会吵）
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const throttle = THROTTLE_MS[name] ?? 70
  if (_lastPlay[name] && now - _lastPlay[name] < throttle) return
  _lastPlay[name] = now
  try { fn(payload || {}) } catch { /* 音效失败绝不能影响答题 */ }
}
