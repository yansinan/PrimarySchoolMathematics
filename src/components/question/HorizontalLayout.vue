<!-- components/question/HorizontalLayout.vue -->
<template>
  <div class="math-question-surface">
    <!-- 使用el-row进行整体布局 -->
    <el-row :gutter="20" justify="space-around" align="middle" class="equation-row">
      <!-- 左边数字或填空（DigitInput 统一替换） -->
      <el-col :span="4" class="number-col">
        <DigitInput
          v-if="parsedEquation.blankPosition === 'leftOperand' && enableDirectInput"
          :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
          :max-digits="maxDigits"
          :initial-focus="0"
          :show-result="showAnswer"
          @focus="(idx) => $emit('focus', idx)"
        />
        <template v-else>
          <DigitInput
            v-if="showAnswer && parsedEquation.blankPosition === 'leftOperand'"
            :model-value="String(answer ?? '')"
            :max-digits="maxDigits"
            :show-result="true"
          />
          <span v-else class="math-number">{{ parsedEquation.leftOperand }}</span>
        </template>
      </el-col>
      
      <!-- 运算符 -->
      <el-col :span="2" class="operator-col">
        <el-text class="math-operator">{{ parsedEquation.operator }}</el-text>
      </el-col>
      
      <!-- 右边数字或填空（DigitInput 统一替换） -->
      <el-col :span="5" class="number-col">
        <DigitInput
          v-if="parsedEquation.blankPosition === 'rightOperand' && enableDirectInput"
          :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
          :max-digits="maxDigits"
          :initial-focus="0"
          :show-result="showAnswer"
          @focus="(idx) => $emit('focus', idx)"
        />
        <template v-else>
          <DigitInput
            v-if="showAnswer && parsedEquation.blankPosition === 'rightOperand'"
            :model-value="String(answer ?? '')"
            :max-digits="maxDigits"
            :show-result="true"
          />
          <span v-else class="math-number">{{ parsedEquation.rightOperand }}</span>
        </template>
      </el-col>
      
      <!-- 等号 -->
      <el-col :span="2" class="equals-col">
        <el-text class="math-equals">=</el-text>
      </el-col>
      
      <!-- 答案区域（DigitInput 统一替换） -->
      <el-col :span="6" class="answer-col">
        <DigitInput
          ref="digitRef"
          v-if="parsedEquation.blankPosition === 'result' && enableDirectInput"
          :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
          :max-digits="maxDigits"
          :initial-focus="0"
          :show-result="showAnswer"
          @focus="(idx) => $emit('focus', idx)"
        />
        <template v-else>
          <DigitInput
            v-if="showAnswer && parsedEquation.blankPosition === 'result'"
            :model-value="String(answer ?? '')"
            :max-digits="maxDigits"
            :show-result="true"
          />
          <span v-else class="math-number">{{ parsedEquation.resultValue }}</span>
        </template>
      </el-col>
    </el-row>
    
    <!-- 进位/退位提示 -->
    <el-row v-if="carryHint" justify="center" class="hint-row">
      <el-col :span="24">
        <el-alert
          :title="carryHint"
          type="warning"
          :closable="false"
          show-icon
          class="carry-alert"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElRow, ElCol, ElText, ElAlert } from 'element-plus'
import DigitInput from '@/components/question/DigitInput.vue'
import { useQuestionEquation, questionLayoutProps, questionLayoutEmits } from '@/components/question/questionLayoutShared'

const props = defineProps(questionLayoutProps)

defineEmits(questionLayoutEmits)

/** 暴露 DigitInput 方法给 Practice.vue */
const digitRef = ref(null)
const acceptDigit = (d) => digitRef.value?.acceptDigit(d) ?? ''
const acceptBackspace = () => digitRef.value?.acceptBackspace() ?? ''

defineExpose({ acceptDigit, acceptBackspace })

const { parsedEquation, carryType } = useQuestionEquation(props)

/** 最大位数：按答案（填空位置的真实值）位数显示方块 */
const maxDigits = computed(() => {
  return Math.max(String(props.answer ?? '').replace('-', '').length, 1)
})

const carryHint = computed(() => {
  if (carryType.value === 'carry') {
    return '进位'
  }
  if (carryType.value === 'borrow') {
    return '退位'
  }
  return ''
})
</script>

<style lang="scss" scoped>
// 字体变量（原 math-equation.scss）
$math-font-size-large: clamp(3rem, 8vw, 8rem);
$math-font-size-medium: clamp(2.4rem, 6vw, 6rem);

.math-question-surface {
  padding: clamp(16px, 2.5vw, 24px);
  border: 1px solid #dbe7f4;
  border-radius: 24px;
  background: linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
  box-shadow: 0 10px 28px rgba(28, 176, 246, 0.08);
}

/* DigitInput 字号与 .math-number 统一 */
:deep(.digit-input) {
  font-size: $math-font-size-large;
}

.math-number {
  font-weight: 700;
  color: #2c3e50;
  min-width: 2em;
  text-align: center;
  font-size: $math-font-size-large;
  line-height: 1;
  white-space: nowrap;
  align-items: center;
}

.math-operator {
  font-weight: 500;
  color: #7f8c8d;
  min-width: 1.5em;
  text-align: center;
  font-size: $math-font-size-medium;
}

.math-equals {
  font-weight: 500;
  color: #7f8c8d;
  font-size: $math-font-size-medium;
}

.equation-row {
  width: 100%;
  margin-bottom: 12px;
  align-items: center;
}

.number-col, .operator-col, .equals-col, .answer-col {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 0;
}

.number-col,
.answer-col {
  min-width: 0;
}

.answer-col {
  align-items: flex-end;
}

.operator-col,
.equals-col {
  flex: 0 0 auto;
}

.hint-row {
  margin-top: 12px;
}

.carry-alert {
  max-width: 300px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .math-question-surface {
    border-radius: 20px;
  }

  .equation-row {
    margin-bottom: 10px;
  }

  .equation-row :deep(.el-col) {
    padding: 0 2px;
  }

  .math-number,
  .math-operator,
  .math-equals {
    transform: scale(0.92);
    transform-origin: center;
  }
}

@media (max-width: 480px) {
  .math-question-surface {
    padding: 14px 12px;
    border-radius: 18px;
  }

  .equation-row {
    margin-bottom: 8px;
  }

  .hint-row {
    margin-top: 8px;
  }

  .math-number,
  .math-operator,
  .math-equals {
    transform: scale(0.84);
  }
}
</style>