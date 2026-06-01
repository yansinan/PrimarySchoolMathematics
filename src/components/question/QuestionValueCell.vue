<template>
  <template v-if="isBlank">
    <input
      v-if="!showAnswer && editable"
      :value="displayInputValue"
      class="math-answer-input"
      inputmode="numeric"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown.enter.prevent="handleSubmit"
    />
    <span v-else-if="!showAnswer" class="math-answer-placeholder">{{ placeholder }}</span>
    <el-tag v-else-if="answerDisplay === 'tag'" :type="answerTagType" size="large" effect="dark" class="math-answer-tag">
      {{ answer }}
    </el-tag>
    <span v-else class="math-answer-display">{{ answer }}</span>
  </template>
  <template v-else>
    <span :class="['math-number', numberClass]">{{ value }}</span>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { ElTag } from 'element-plus'

const props = defineProps({
  isBlank: {
    type: Boolean,
    default: false
  },
  showAnswer: {
    type: Boolean,
    default: false
  },
  answer: {
    type: [String, Number],
    default: ''
  },
  answerDisplay: {
    type: String,
    default: 'tag'
  },
  editable: {
    type: Boolean,
    default: false
  },
  userAnswer: {
    type: [String, Number],
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  value: {
    type: [String, Number],
    default: ''
  },
  numberClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:userAnswer', 'submitAnswer'])

const answerTagType = computed(() => (props.showAnswer ? 'success' : 'info'))
const displayInputValue = computed(() => String(props.userAnswer ?? ''))

const handleInput = (event) => {
  const rawValue = event.target.value ?? ''
  const normalized = rawValue.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '')
  emit('update:userAnswer', normalized)
}

const handleSubmit = () => {
  emit('submitAnswer')
}
</script>

<style lang="scss" scoped>
@import '@/styles/math-equation.scss';

.math-answer-input {
  font-size: clamp(2.4rem, 6vw, 6rem);
  font-weight: 700;
  color: #2c3e50;
  display: block;
  width: min(100%, 3.2em);
  max-width: 100%;
  text-align: center;
  border: none;
  border-bottom: 4px solid #93c5fd;
  background: transparent;
  line-height: 1.1;
  outline: none;
  box-sizing: border-box;
}

.math-answer-input:focus {
  border-bottom-color: #1cb0f6;
}

.math-answer-placeholder {
  font-weight: 500;
  color: #bdc3c7;
  letter-spacing: 5px;
  border-bottom: 4px solid #bdc3c7;
  display: inline-block;
  line-height: 0.72;
  min-width: 2em;
  padding: 0.1em 0.1em 0.62em 0.1em;
  vertical-align: baseline;
  text-align: center;
  font-size: $math-font-size-medium;
}
</style>