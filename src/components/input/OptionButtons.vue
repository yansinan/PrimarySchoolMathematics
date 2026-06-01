<!-- components/input/OptionButtons.vue -->
<template>
  <div class="option-buttons">
    <div class="options-grid">
      <el-button
        v-for="(option, index) in options"
        :key="index"
        :type="getButtonType(option)"
        size="large"
        :disabled="disabled || hasAnswered"
        @click="handleSelect(option)"
        class="option-btn"
        :class="{
          'correct-option': showResult && option === correctAnswer,
          'wrong-option': showResult && selectedOption === option && option !== correctAnswer
        }"
      >
        {{ option }}
      </el-button>
    </div>
    
    <!-- 选项模式下，确认后自动进入下一题，不显示额外按钮 -->
    <div v-if="showResult" class="next-hint">
      <el-button 
        type="primary" 
        size="large" 
        @click="$emit('next')"
        plain
      >
        下一题
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  options: Array,
  correctAnswer: Number,
  disabled: Boolean,
  showResult: Boolean,
  selectedOption: Number
})

const emit = defineEmits(['select', 'next'])

const hasAnswered = computed(() => props.showResult)

const getButtonType = (option) => {
  if (!props.showResult) return 'default'
  if (option === props.correctAnswer) return 'success'
  if (props.selectedOption === option && option !== props.correctAnswer) return 'danger'
  return 'default'
}

const handleSelect = (option) => {
  if (props.disabled || props.showResult) return
  emit('select', option)
}
</script>

<style scoped lang="scss">
@use '@/styles/input-ui.scss' as inputUi;

.option-buttons {
  @include inputUi.input-panel-surface;
}

.options-grid {
  @include inputUi.input-grid(2, 4, 16px);
  margin: 20px 0;
}

.option-btn {
  @include inputUi.input-button-base;
  height: clamp(72px, 12vw, 100px) !important;
  font-size: clamp(24px, 4.2vw, 36px) !important;
}

.option-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(28, 176, 246, 0.2);
}

.correct-option {
  animation: psm-pulse 0.5s;
}

.wrong-option {
  animation: psm-shake 0.5s;
}

.next-hint {
  text-align: center;
  margin-top: 14px;
}

@include inputUi.feedback-animations;

@media (prefers-reduced-motion: reduce) {
  .option-btn,
  .correct-option,
  .wrong-option {
    animation: none !important;
    transition: none;
    transform: none !important;
  }
}
</style>