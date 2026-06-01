<!-- components/question/HorizontalLayout.vue -->
<template>
  <div class="math-question-surface">
    <!-- 使用el-row进行整体布局 -->
    <el-row :gutter="20" justify="space-around" align="middle" class="equation-row">
      <!-- 左边数字或填空 -->
      <el-col :span="6" class="number-col">
        <QuestionValueCell
          :is-blank="parsedEquation.blankPosition === 'leftOperand'"
          :show-answer="showAnswer"
          :answer="answer"
          :editable="enableDirectInput && parsedEquation.blankPosition === 'leftOperand'"
          :user-answer="userAnswer"
          :value="parsedEquation.leftOperand"
          @update:user-answer="$emit('update:userAnswer', $event)"
          @submit-answer="$emit('submitAnswer')"
        />
      </el-col>
      
      <!-- 运算符 -->
      <el-col :span="2" class="operator-col">
        <el-text class="math-operator">{{ parsedEquation.operator }}</el-text>
      </el-col>
      
      <!-- 右边数字或填空 -->
      <el-col :span="6" class="number-col">
        <QuestionValueCell
          :is-blank="parsedEquation.blankPosition === 'rightOperand'"
          :show-answer="showAnswer"
          :answer="answer"
          :editable="enableDirectInput && parsedEquation.blankPosition === 'rightOperand'"
          :user-answer="userAnswer"
          :value="parsedEquation.rightOperand"
          @update:user-answer="$emit('update:userAnswer', $event)"
          @submit-answer="$emit('submitAnswer')"
        />
      </el-col>
      
      <!-- 等号 -->
      <el-col :span="2" class="equals-col">
        <el-text class="math-equals">=</el-text>
      </el-col>
      
      <!-- 答案区域 -->
      <el-col :span="6" class="answer-col">
        <QuestionValueCell
          :is-blank="parsedEquation.blankPosition === 'result'"
          :show-answer="showAnswer"
          :answer="answer"
          :editable="enableDirectInput && parsedEquation.blankPosition === 'result'"
          :user-answer="userAnswer"
          :value="parsedEquation.resultValue"
          @update:user-answer="$emit('update:userAnswer', $event)"
          @submit-answer="$emit('submitAnswer')"
        />
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
import { computed } from 'vue'
import { ElRow, ElCol, ElText, ElAlert } from 'element-plus'
import QuestionValueCell from '@/components/question/QuestionValueCell.vue'
import { useQuestionEquation, questionLayoutProps, questionLayoutEmits } from '@/components/question/questionLayoutShared'

const props = defineProps(questionLayoutProps)

defineEmits(questionLayoutEmits)

const { parsedEquation, carryType } = useQuestionEquation(props)
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
@import '@/styles/math-equation.scss';

.equation-row {
  width: 100%;
  margin-bottom: 12px;
  align-items: center;
}

.number-col, .operator-col, .equals-col, .answer-col {
  display: flex;
  justify-content: center;
  align-items: center;
}

.number-col,
.answer-col {
  min-width: 0;
  padding-bottom: 2px;
}

.answer-col {
  align-items: flex-end;
  align-self: flex-end;
  padding-bottom: 8px;
}

.operator-col,
.equals-col {
  flex: 0 0 auto;
}

.math-number {
  line-height: 1.05;
  white-space: nowrap;
}

.hint-row {
  margin-top: 12px;
}

.carry-alert {
  max-width: 300px;
  margin: 0 auto;
}

@media (max-width: 768px) {
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

  .answer-col {
    align-items: flex-end;
    align-self: flex-end;
    padding-bottom: 8px;
  }
}

@media (max-width: 480px) {
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

  .answer-col {
    align-items: flex-end;
    align-self: flex-end;
    padding-bottom: 8px;
  }
}
</style>