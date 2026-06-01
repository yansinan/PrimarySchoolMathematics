<template>
  <div class="digit-input" :style="digitInputStyle">
    <div
      v-for="(slot, idx) in slots"
      :key="idx"
      class="digit-box"
      :class="{
        'digit-box--active': idx === activeIdx && !showResult,
        'digit-box--filled': slot !== null && !showResult,
        'digit-box--cursor': idx === activeIdx && !disabled && !showResult,
        'digit-box--result': showResult && slot !== null
      }"
      @click.stop="onBoxClick(idx)"
    >
      <span class="digit-value">{{ slot !== null ? slot : '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  /** 左对齐 slot 字符串，'_'=空位，如 "_35" */
  padValue: { type: String, default: '' },
  maxDigits: { type: Number, default: 3 },
  disabled: { type: Boolean, default: false },
  showResult: { type: Boolean, default: false },
  /** 外部焦点索引：由 Practice.vue 传入 digitFocusIdx，-1=自动 */
  activeSlot: { type: Number, default: -1 },
})

const emit = defineEmits(['update:padValue', 'submit', 'focus'])

/** 用户点选的格子索引（-1 = 自动）*/
const focusSlot = ref(-1)

// 监听外部 activeSlot 变化，同步内部焦点
watch(() => props.activeSlot, (val) => {
  if (val >= 0 && val < props.maxDigits) {
    focusSlot.value = val
  }
})

const digitCount = computed(() => Math.max(2, props.maxDigits))

/** padValue 展开为左对齐 slot 数组，_=null，如 "_3"=十位3 */
const slots = computed(() => {
  const chars = String(props.padValue || '').split('')
  const arr = new Array(digitCount.value).fill(null)
  for (let i = 0; i < chars.length && i < digitCount.value; i++) {
    arr[i] = chars[i] === '_' ? null : chars[i]
  }
  return arr
})

/** 当前活跃格子：用户点选格 > 从右向左第一个空格 */
const activeIdx = computed(() => {
  if (focusSlot.value >= 0 && focusSlot.value < digitCount.value) {
    return focusSlot.value
  }
  const s = slots.value
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === null) return i
  }
  return -1
})

function padFromSlots(arr) {
  return arr.map(c => c !== null ? c : '_').join('').replace(/_+$/, '')
}

function onBoxClick(idx) {
  if (props.disabled || props.showResult) return
  focusSlot.value = idx
  emit('focus', idx)
}

/**
 * 从键盘接收数字并填入正确格子。
 * 返回 pad 格式字符串（含 _）。
 */
function acceptDigit(digit) {
  const s = [...slots.value]
  const idx = focusSlot.value >= 0 ? focusSlot.value : activeIdx.value
  if (idx >= 0 && idx < s.length) s[idx] = String(digit)
  focusSlot.value = -1
  return padFromSlots(s)
}

/** 退格：返回 pad 格式字符串 */
function acceptBackspace() {
  const s = [...slots.value]
  if (focusSlot.value >= 0 && s[focusSlot.value] !== null) {
    s[focusSlot.value] = null
    focusSlot.value = -1
    return padFromSlots(s)
  }
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== null) { s[i] = null; focusSlot.value = -1; return padFromSlots(s) }
  }
  return padFromSlots(s)
}

function clearFocus() { focusSlot.value = -1 }
function setFocus(idx) {
  if (idx >= 0 && idx < digitCount.value) focusSlot.value = idx
}

defineExpose({ acceptDigit, acceptBackspace, clearFocus, setFocus, activeIdx })

const digitInputStyle = computed(() => ({ '--box-count': digitCount.value }))
</script>

<style scoped>
.digit-input {
  display: inline-flex;
  gap: 4px;
  direction: ltr;
  align-items: center;
}

.digit-box {
  width: calc(var(--vertical-digit-size, 2.8rem) * 0.92);
  height: calc(var(--vertical-digit-size, 2.8rem) * 1.15);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-size: var(--vertical-digit-size, 2.8rem);
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
