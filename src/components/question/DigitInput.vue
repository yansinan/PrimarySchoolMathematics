<template>
  <div class="digit-input" :style="digitInputStyle">
    <div
      v-for="(slot, idx) in slots"
      :key="idx"
      class="digit-box"
      :class="{
        'digit-box--active': idx === realActiveIdx && !showResult,
        'digit-box--filled': slot !== null && !showResult,
        'digit-box--cursor': idx === realActiveIdx && !disabled && !showResult,
        'digit-box--result': showResult && slot !== null
      }"
      @click.stop="onBoxClick(idx)"
    >
      <span class="digit-value">{{ slot !== null ? slot : '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'

const props = defineProps({
  /** v-model: 数字字符串。自由模式右对齐含 _，点击模式固定宽度含 _ */
  modelValue: { type: String, default: '' },
  /** 最大位数 */
  maxDigits: { type: Number, default: 3 },
  /** 禁用 */
  disabled: { type: Boolean, default: false },
  /** 显示答案（绿色方块） */
  showResult: { type: Boolean, default: false },
  /** 外部焦点索引：-1=自动（自由模式），>=0=点击模式 */
  activeSlot: { type: Number, default: -1 },
  /** 初始焦点方向：-1=默认最右侧（个位），0=最左侧（高位） */
  initialFocus: { type: Number, default: -1 },
})

const emit = defineEmits(['update:modelValue', 'focus'])

/* ============================================================
   内部状态
   ============================================================ */
const focusSlot = ref(-1)

watch(() => props.activeSlot, (val) => {
  if (val >= 0 && val < props.maxDigits) {
    focusSlot.value = val
  } else {
    focusSlot.value = -1
  }
})

/* ============================================================
   工具函数
   ============================================================ */
function rightPad(v, maxD) {
  const digits = String(v || '').replace(/_/g, '').slice(-maxD)
  if (!digits) return ''
  return digits.length >= maxD ? digits : '_'.repeat(maxD - digits.length) + digits
}
function fullPad(v, maxD) {
  const s = String(v || '')
  if (!s) return '_'.repeat(maxD)
  return s.length >= maxD ? s.slice(0, maxD) : s + '_'.repeat(maxD - s.length)
}
function toSlots(padded, maxD) {
  const s = padded || ''
  if (!s) return new Array(maxD).fill(null)
  return s.split('').map(ch => ch === '_' ? null : ch)
}
function fromSlots(arr) {
  return arr.map(c => c !== null ? c : '_').join('')
}

const digitCount = computed(() => Math.max(2, props.maxDigits))

/* ============================================================
   显示
   ============================================================ */
const slots = computed(() => toSlots(props.modelValue, digitCount.value))

const realActiveIdx = computed(() => {
  if (focusSlot.value >= 0 && focusSlot.value < digitCount.value) return focusSlot.value
  const s = slots.value
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === null) return i
  }
  return -1
})

/* ============================================================
   交互
   ============================================================ */
/** 首次挂载 / 内容清空时重置焦点到初始方向 */
onMounted(() => {
  // 只在组件刚挂载、值为空时设置初始焦点
  if (!props.modelValue || !props.modelValue.replace(/_/g, '')) {
    focusSlot.value = props.initialFocus
    if (props.initialFocus >= 0) emit('focus', props.initialFocus)
  }
})

function onBoxClick(idx) {
  if (props.disabled || props.showResult) return
  focusSlot.value = idx
  emit('focus', idx)
}

/**
 * 接收键盘输入的数字。由外部键盘组件调用。
 * @param {string|number} digit
 * @returns {string} 新的 modelValue
 */
function acceptDigit(digit) {
  const maxD = digitCount.value
  if (focusSlot.value >= 0) {
    // 点击模式：精确填入焦点格
    const cur = fullPad(props.modelValue, maxD)
    const s = toSlots(cur, maxD)
    const fi = Math.min(focusSlot.value, maxD - 1)
    s[fi] = String(digit)
    // 自动跳转：左空→左移，左满右空→右移，都满→不动
    const leftEmpty = fi > 0 && s[fi - 1] === null
    const rightEmpty = fi < maxD - 1 && s[fi + 1] === null
    const nextFocus = leftEmpty ? fi - 1 : (rightEmpty ? fi + 1 : fi)
    focusSlot.value = nextFocus
    emit('focus', nextFocus)
    return fromSlots(s)
  }
  // 自由模式：value = oldValue + newDigit。在旧值中找最右空格填入
  focusSlot.value = -1
  emit('focus', -1)
  const oldValue = String(props.modelValue || '')
  const newDigit = String(digit)
  const cur = fullPad(oldValue, maxD)
  const s = toSlots(cur, maxD)
  // 有空格 → 填最右空格；无空格 → calculator 式右对齐（放弃最左一位）
  let filled = false
  for (let i = maxD - 1; i >= 0; i--) {
    if (s[i] === null) {
      s[i] = newDigit
      filled = true
      break
    }
  }
  if (!filled) {
    // 全部已满 → 整体左移一位（丢弃最高位），新数字填个位
    return rightPad(oldValue.replace(/_/g, '') + newDigit, maxD)
  }
  return fromSlots(s)
}

/**
 * 退格操作。
 * @returns {string} 新的 modelValue
 */
function acceptBackspace() {
  const maxD = digitCount.value
  const cur = fullPad(props.modelValue, maxD)
  const s = toSlots(cur, maxD)

  // 确定要清除的格子
  let clearIdx = -1
  if (focusSlot.value >= 0) {
    // 点击模式：清除焦点格。若已空则找最右侧非空
    clearIdx = Math.min(focusSlot.value, maxD - 1)
    if (s[clearIdx] === null) {
      for (let i = maxD - 1; i >= 0; i--) {
        if (s[i] !== null) { clearIdx = i; break }
      }
    }
  } else {
    // 自由模式：清除最右侧非空格
    for (let i = maxD - 1; i >= 0; i--) {
      if (s[i] !== null) { clearIdx = i; break }
    }
  }

  if (clearIdx < 0) {
    // 全空
    focusSlot.value = -1
    emit('focus', -1)
    return ''
  }

  s[clearIdx] = null

  // 全空则返回空字符串（让 confirm 按钮禁用）
  const allEmpty = s.every(ch => ch === null)
  if (allEmpty) {
    focusSlot.value = -1
    emit('focus', -1)
    return ''
  }

  // 跳转：左空→左，左满右空→右，都满→停
  const leftEmpty = clearIdx > 0 && s[clearIdx - 1] === null
  const rightEmpty = clearIdx < maxD - 1 && s[clearIdx + 1] === null
  focusSlot.value = leftEmpty ? clearIdx - 1 : (rightEmpty ? clearIdx + 1 : clearIdx)
  emit('focus', focusSlot.value)

  return fromSlots(s)
}

function setFocus(idx) {
  if (idx >= 0 && idx < digitCount.value) focusSlot.value = idx
}
function clearFocus() { focusSlot.value = -1 }

defineExpose({ acceptDigit, acceptBackspace, setFocus, clearFocus, realActiveIdx })

const digitInputStyle = computed(() => ({ '--box-count': digitCount.value }))
</script>

<style scoped>
.digit-input {
  display: inline-flex;
  gap: 4px;
  direction: ltr;
  align-items: center;
  font-size: clamp(1.7rem, 5.5vw, 6rem);
}

.digit-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 1.05em;
  height: 1.2em;
  font-family: 'Courier New', monospace;
  font-weight: 700;
  color: #2c3e50;
  background: #fff;
  border: 2px solid #c8d6e5;
  border-radius: 6px;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.15s;
  cursor: default;
  user-select: none;
}

.digit-box--filled {
  border-color: #94a3b8;
  background: #fafcff;
}

.digit-box--active {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.digit-box--cursor {
  border-color: #3b82f6;
  border-style: dashed;
}

.digit-box--result {
  border-color: #58cc71;
  background: #f0fdf4;
  color: #166534;
  font-weight: 800;
}

.digit-box:hover:not(.digit-box--active):not(.digit-box--result) {
  border-color: #93c5fd;
  background: #f8faff;
}

.digit-value {
  line-height: 1;
}
</style>
