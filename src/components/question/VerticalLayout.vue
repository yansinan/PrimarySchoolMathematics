<!-- components/question/VerticalLayout.vue -->
<template>
  <div class="vertical-layout math-question-surface">
    <div class="vertical-equation" :style="equationStyle">
      <div class="eq-row first-row">
        <div class="op-cell"></div>
        <div class="digits-cell first-digits-cell">
          <QuestionValueCell
            :is-blank="parsedEquation.blankPosition === 'leftOperand'"
            :show-answer="showAnswer"
            :answer="answer"
            answer-display="text"
            :editable="enableDirectInput && parsedEquation.blankPosition === 'leftOperand'"
            :user-answer="userAnswer"
            :value="parsedEquation.leftOperand"
            number-class="math-number-vertical"
            @update:user-answer="$emit('update:userAnswer', $event)"
            @submit-answer="$emit('submitAnswer')"
          />
        </div>
      </div>

      <div class="eq-row second-row">
        <div class="op-cell">
          <span class="math-operator">{{ parsedEquation.operator }}</span>
        </div>
        <div class="digits-cell">
          <QuestionValueCell
            :is-blank="parsedEquation.blankPosition === 'rightOperand'"
            :show-answer="showAnswer"
            :answer="answer"
            answer-display="text"
            :editable="enableDirectInput && parsedEquation.blankPosition === 'rightOperand'"
            :user-answer="userAnswer"
            :value="parsedEquation.rightOperand"
            number-class="math-number-vertical"
            @update:user-answer="$emit('update:userAnswer', $event)"
            @submit-answer="$emit('submitAnswer')"
          />
        </div>
      </div>

      <div class="line-row">
        <div class="math-line"></div>
      </div>

      <div class="eq-row result-row">
        <div class="op-cell"></div>
        <div class="digits-cell result-content">
          <!-- 竖式逐位数字输入（输入/答案均保持方块样式） -->
          <DigitInput
            v-if="isResultBlank && digitMode"
            :pad-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
            :max-digits="maxDigits"
            :active-slot="focusSlot"
            :show-result="showAnswer"
            @focus="(idx) => $emit('focus', idx)"
          />
          <QuestionValueCell
            v-else
            :is-blank="parsedEquation.blankPosition === 'result'"
            :show-answer="showAnswer"
            :answer="answer"
            answer-display="text"
            :editable="enableDirectInput && parsedEquation.blankPosition === 'result' && !digitMode"
            :user-answer="userAnswer"
            :value="parsedEquation.resultValue"
            number-class="math-number-vertical"
            @update:user-answer="$emit('update:userAnswer', $event)"
            @submit-answer="$emit('submitAnswer')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import QuestionValueCell from '@/components/question/QuestionValueCell.vue'
import DigitInput from '@/components/question/DigitInput.vue'
import { useQuestionEquation, questionLayoutProps, questionLayoutEmits } from '@/components/question/questionLayoutShared'

const props = defineProps(questionLayoutProps)

defineEmits(questionLayoutEmits)

const { parsedEquation } = useQuestionEquation(props)

/** 结果行当前是否为空白（待填）*/
const isResultBlank = computed(() => {
  const bp = parsedEquation.value.blankPosition
  return bp === 'result' || bp === ''
})

const maxDigits = computed(() => {
  const answerValue = String(props.showAnswer ? (props.answer ?? '') : (props.userAnswer ?? ''))
  const values = [
    String(parsedEquation.value.leftOperand || ''),
    String(parsedEquation.value.rightOperand || ''),
    String(parsedEquation.value.resultValue || ''),
    answerValue
  ]
  const lens = values.map((v) => v.replace('-', '').length).filter(Boolean)
  return Math.max(...lens, 2)
})

const equationStyle = computed(() => ({
  '--digits-count': maxDigits.value
}))
</script>

<style lang="scss" scoped>
@import '@/styles/math-equation.scss';

.vertical-layout {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: clamp(10px, 2vw, 18px) 8px;
}

.vertical-equation {
  display: flex;
  flex-direction: column;
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  --vertical-digit-size: clamp(1.7rem, 4.6vw, 2.8rem);
  --vertical-operator-size: clamp(1.3rem, 3.8vw, 2.1rem);
  --digit-cell-width: calc(var(--vertical-digit-size) * 0.92);
  --digits-width: calc(var(--digits-count) * var(--digit-cell-width));
  --op-width: calc(var(--vertical-digit-size) * 0.34);
  --col-gap: 0;
}

.eq-row {
  display: grid;
  grid-template-columns: var(--op-width) var(--digits-width);
  column-gap: var(--col-gap);
  align-items: end;
  margin-bottom: 8px;
}

.result-row {
  margin-bottom: 0;
}

.op-cell,
.digits-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.op-cell {
  justify-content: flex-start;
  overflow: visible;
}

.first-digits-cell {
  position: relative;
  overflow: visible;
}

.math-operator {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: auto;
  min-width: 0;
  text-align: left;
  font-size: var(--vertical-operator-size);
  line-height: 1;
  color: #6d747a;
  margin-left: calc(var(--vertical-digit-size) * 0.08);
}

:deep(.math-number-vertical) {
  width: var(--digits-width);
  min-width: var(--digits-width);
  max-width: var(--digits-width);
  text-align: right;
  font-family: 'Courier New', 'SFMono-Regular', monospace;
  font-size: var(--vertical-digit-size);
  line-height: 1.05;
  letter-spacing: 0;
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  font-variant-numeric: tabular-nums;
}

.line-row {
  width: calc(var(--op-width) + var(--digits-width) + var(--col-gap));
  display: flex;
  justify-content: flex-end;
}

.math-line {
  margin: 2px 0 10px 0;
  width: calc(var(--digits-width) + (var(--digit-cell-width) * 0.52));
  max-width: calc(var(--op-width) + var(--digits-width));
  border-bottom-width: 3px;
}

.result-content :deep(.math-answer-input),
.result-content :deep(.math-answer-placeholder),
.result-content :deep(.math-answer-display) {
  width: var(--digits-width);
  min-width: var(--digits-width);
  max-width: var(--digits-width);
  height: var(--vertical-digit-size);
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  display: inline-block;
  vertical-align: bottom;
  font-family: 'Courier New', 'SFMono-Regular', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 1;
  text-align: right;
  justify-content: flex-end;
}

.result-content :deep(.math-answer-input) {
  appearance: none;
  -webkit-appearance: none;
  width: min(100%, var(--digits-width));
}

.result-content :deep(.math-answer-placeholder) {
  border-bottom-width: 3px;
}

:deep(.math-number-vertical),
:deep(.math-answer-input),
:deep(.math-answer-display),
:deep(.math-answer-placeholder) {
  text-align: right;
  font-size: var(--vertical-digit-size);
  line-height: 1.04;
}

.first-row :deep(.math-answer-display),
.second-row :deep(.math-answer-display) {
  width: var(--digits-width);
  min-width: var(--digits-width);
  max-width: var(--digits-width);
  padding: 0;
  border-bottom: 3px solid #27ae60;
  color: #27ae60;
  font-weight: 700;
  font-family: 'Courier New', 'SFMono-Regular', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
}

.first-row :deep(.math-answer-input),
.second-row :deep(.math-answer-input),
.first-row :deep(.math-answer-placeholder),
.second-row :deep(.math-answer-placeholder) {
  width: var(--digits-width);
  min-width: var(--digits-width);
  max-width: var(--digits-width);
  padding: 0;
  font-family: 'Courier New', 'SFMono-Regular', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

@media (max-width: 768px) {
  .vertical-equation {
    --vertical-digit-size: clamp(1.55rem, 5vw, 2.1rem);
  }

  .line-row {
    width: calc(var(--op-width) + var(--digits-width) + var(--col-gap));
  }
}

@media (max-width: 480px) {
  .vertical-layout {
    padding: 8px 4px;
  }

  .eq-row {
    margin-bottom: 5px;
  }

  .math-line {
    margin: 2px 0 8px 0;
  }

}
</style>
