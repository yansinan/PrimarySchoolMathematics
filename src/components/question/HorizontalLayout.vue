<!-- components/question/HorizontalLayout.vue -->
<template>
  <div class="math-question-surface">
    <!-- 使用el-row进行整体布局 -->
    <el-row :gutter="0" justify="center" align="middle" class="equation-row">
      <!-- 左边数字或填空（DigitInput 统一替换） -->
      <el-col :span="4" class="number-col">
        <DigitInput
          v-if="parsedEquation.blankPosition === 'leftOperand' && enableDirectInput"
          :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
          :max-digits="maxDigits"
          :initial-focus="initialFocus"
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
        <el-text class="math-operator">{{ parsedEquation.displayOperator }}</el-text>
      </el-col>
      
      <!-- 右边数字或填空（DigitInput 统一替换） -->
      <el-col :span="5" class="number-col">
        <DigitInput
          v-if="parsedEquation.blankPosition === 'rightOperand' && enableDirectInput"
          :model-value="showAnswer ? String(answer ?? '') : String(userAnswer ?? '')"
          :max-digits="maxDigits"
          :initial-focus="initialFocus"
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
          :initial-focus="initialFocus"
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

/**
 * 横式输入方向
 *  - 乘除（心算/口诀）：从左向右，符合「先读高位再读低位」的口算顺序
 *  - 加减（笔算思维）：从右向左，先算个位、照顾进位退位
 * 注意 DigitInput 里 focusSlot >= 0 走「点击模式」（左对齐 + 逐格右移），
 * focusSlot = -1 走「自由模式」（右对齐、从个位累积），所以这里传 0 / -1 即可。
 */
const initialFocus = computed(() => {
  const op = parsedEquation.value?.operator || ''
  return /[×÷*\/]/.test(op) ? 0 : -1
})

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

/*
 * 字号按「容器宽度」而不是「视口宽度」算。
 * 原来 clamp(3rem, 8vw, 8rem) 在 1440px 屏上是 115px，
 * 一个三位数就占 200px 宽，四个数字格再加运算符直接撑爆 710px 的算式行，
 * 溢出部分压到相邻元素上 —— 就是「数字和符号重叠」。窄屏 vw 小一点但也一样会挤。
 * container-type: inline-size 之后用 cqw，字号随容器宽度等比缩放。
 */
.math-question-surface {
  container-type: inline-size;
  --math-font: clamp(1rem, 7cqw, 2.7rem);
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
  /* 不设死 min-width：3 位数时 2em 会把整行撑出容器 */
  text-align: center;
  font-size: var(--math-font);
  line-height: 1;
  white-space: nowrap;
  align-items: center;
}

.math-operator {
  font-weight: 500;
  color: #7f8c8d;
  padding: 0 0.1em;
  text-align: center;
  font-size: var(--math-font);
}

.math-equals {
  font-weight: 500;
  color: #7f8c8d;
  font-size: var(--math-font);
}

/*
 * 横式算式自适应排版
 *
 * 原来用固定栅格 el-col :span="4 / 2 / 5 / 2 / 6"，每列宽度被写死成百分比。
 * 三位数以上（如 946-243、答案 1189）时每段要放 3~4 个数字格，
 * 格子按 1.05em 固定宽，很快就超出列宽，溢出压到相邻列的运算符上 ——
 * 表现为「数字和符号重叠」，屏幕越窄越明显。
 *
 * 改成按内容撑开（flex: 0 1 auto + width: auto），整行放不下时由 gap 收紧，
 * 数字格仍保持 1.05em 的可读宽度，不会互相覆盖。
 */
.equation-row {
  width: 100%;
  margin-bottom: 12px;
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: clamp(1px, 0.6cqw, 6px);
}

.equation-row :deep(.el-col) {
  flex: 0 1 auto !important;
  width: auto !important;
  max-width: none !important;
  min-width: 0;
  padding: 0 !important;
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