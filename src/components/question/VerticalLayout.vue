<!-- components/question/VerticalLayout.vue -->
<template>
  <div class="vertical-layout math-question-surface">
    <div class="vertical-equation" :style="equationStyle">
      <div class="eq-row first-row">
        <div class="op-cell"></div>
        <div class="digits-cell first-digits-cell">
          <DigitInput
            v-if="parsedEquation.blankPosition === 'leftOperand' && enableDirectInput"
            :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
            :max-digits="maxDigits"
            :initial-focus="-1"
            :show-result="showAnswer"
            @focus="(idx) => $emit('focus', idx)"
          />
          <template v-else>
            <span v-for="(d, idx) in String(parsedEquation.leftOperand).split('')" :key="idx" class="vertical-digit-slot">{{ d }}</span>
          </template>
        </div>
        <div></div>
      </div>

      <div class="eq-row second-row">
        <div class="op-cell">
          <span class="math-operator">{{ parsedEquation.operator }}</span>
        </div>
        <div class="digits-cell">
          <DigitInput
            v-if="parsedEquation.blankPosition === 'rightOperand' && enableDirectInput"
            :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
            :max-digits="maxDigits"
            :initial-focus="-1"
            :show-result="showAnswer"
            @focus="(idx) => $emit('focus', idx)"
          />
          <template v-else>
            <span v-for="(d, idx) in String(parsedEquation.rightOperand).split('')" :key="idx" class="vertical-digit-slot">{{ d }}</span>
          </template>
        </div>
        <div></div>
      </div>

      <div class="line-row">
        <div class="math-line"></div>
      </div>

      <div class="eq-row result-row">
        <div class="op-cell"></div>
        <div class="digits-cell result-content">
          <DigitInput
            ref="digitRef"
            v-if="isResultBlank && enableDirectInput"
            :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
            :max-digits="maxDigits"
            :initial-focus="-1"
            :show-result="showAnswer"
            @focus="(idx) => emit('focus', idx)"
          />
          <template v-else>
            <DigitInput
              v-if="showAnswer && isResultBlank"
              :model-value="String(answer ?? '')"
              :max-digits="maxDigits"
              :show-result="true"
            />
            <template v-else>
              <span v-for="(d, idx) in String(parsedEquation.resultValue).split('')" :key="idx" class="vertical-digit-slot">{{ d }}</span>
            </template>
          </template>
        </div>
        <div></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import DigitInput from '@/components/question/DigitInput.vue'
import { useQuestionEquation, questionLayoutProps, questionLayoutEmits } from '@/components/question/questionLayoutShared'

const props = defineProps(questionLayoutProps)

const emit = defineEmits(questionLayoutEmits)

const { parsedEquation, carryType } = useQuestionEquation(props)

/** 结果行当前是否为空白（待填）*/
const isResultBlank = computed(() => {
  const bp = parsedEquation.value.blankPosition
  return bp === 'result' || bp === ''
})

/** 最大位数：按答案（填空位置的真实值）位数显示方块 */
const maxDigits = computed(() => {
  return Math.max(String(props.answer ?? '').replace('-', '').length, 1)
})

const equationStyle = computed(() => ({
  '--digits-count': maxDigits.value
}))

/** 转发 DigitInput 的暴露方法给父组件 */
const digitRef = ref(null)
const acceptDigit = (digit) => digitRef.value?.acceptDigit(digit) ?? ''
const acceptBackspace = () => digitRef.value?.acceptBackspace() ?? ''

defineExpose({ acceptDigit, acceptBackspace })
</script>

<style lang="scss" scoped>
// 原 math-equation.scss 合并至此
.math-question-surface {
  padding: clamp(16px, 2.5vw, 24px);
  border: 1px solid #dbe7f4;
  border-radius: 24px;
  background: linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
  box-shadow: 0 10px 28px rgba(28, 176, 246, 0.08);
}

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
  align-items: flex-end;
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  --vertical-digit-size: clamp(1.7rem, 5.5vw, 6rem);
  --vertical-operator-size: clamp(1.3rem, 3.8vw, 2.1rem);
  --digit-cell-width: calc(var(--vertical-digit-size) * 1.05);
  --digits-width: calc(var(--digits-count) * var(--digit-cell-width) + (var(--digits-count) - 1) * 4px);
  --op-width: calc(var(--vertical-digit-size) * 0.34 + var(--digit-cell-width) * 1 + 4px);
  --col-gap: 0;
}

.eq-row {
  display: grid;
  grid-template-columns: var(--op-width) var(--digits-width) 1fr;
  column-gap: var(--col-gap);
  // align-items: end;
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
  gap: 4px;
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
  margin-left: calc(var(--vertical-digit-size) * 0.12);
  position: relative;
  z-index: 1;
  background: inherit;
}

.vertical-digit-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--digit-cell-width);
  height: calc(var(--vertical-digit-size) * 1.2);
  // font-family: 'Courier New', monospace;
  font-size: var(--vertical-digit-size);
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
  box-sizing: border-box;
}

.line-row {
  overflow: visible;
  display: flex;
  justify-content: flex-end;
  width: calc(var(--op-width) + var(--digits-width) + var(--col-gap));
}

.math-line {
  border-bottom: 4px solid #333;
  margin: 2px 0 10px 0;
  width: calc(var(--digits-width) + var(--digit-cell-width) * 2);
  border-bottom-width: 3px;
}



@media (max-width: 768px) {
  .math-question-surface {
    border-radius: 20px;
  }

  .vertical-equation {
    --vertical-digit-size: clamp(1.55rem, 5.5vw, 6rem);
  }

  .line-row {
    width: calc(var(--op-width) + var(--digits-width) + var(--col-gap));
    overflow: visible;
  }

  .math-line {
    border-bottom-width: 3px;
    width: calc(var(--digits-width) + var(--digit-cell-width) * 2);
  }
}

@media (max-width: 480px) {
  .math-question-surface {
    padding: 14px 12px;
    border-radius: 18px;
  }

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
