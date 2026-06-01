<!-- components/question/VerticalLayout.vue -->
<template>
  <div class="vertical-layout math-question-surface">
    <div class="vertical-equation">
      <!-- 第一行：被减数/被乘数/第一个加数 -->
      <el-row class="v-row first-row" justify="center">
        <!-- 
        <el-col :span="10" class="operator-col">
          <span class="operator-spacer"></span>
        </el-col>        
        -->
        <el-col :span="width" class="value-col">
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
        </el-col>
      </el-row>

      <!-- 第二行：运算符和第二行数字 -->
      <el-row class="v-row second-row">
        <el-col :span="4" class="operator-col">
          <!-- <span class="operator-spacer"></span> -->
        </el-col>  
        <el-col :span="((24-width)/2)-4" class="operator-col">
          <span class="math-operator">{{ parsedEquation.operator }}</span>
        </el-col>
        <el-col :span="width" class="value-col">
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
        </el-col>
        <el-col :span="(24-width)/2" class="operator-col">
          <!-- <span class="operator-spacer"></span> -->
        </el-col>
      </el-row>

      <!-- 横线 -->
      <el-row class="line-row" justify="center">
        <el-col :span="19" class="value-col">
          <div class="math-line"></div>
        </el-col>
      </el-row>

      <!-- 结果行（答案区域） -->
      <el-row class="v-row result-row" justify="center">
        <!-- 
        <el-col :span="10" class="operator-col">
          <span class="result-label"></span>
        </el-col>
         -->
        <el-col :span="width" class="value-col result-content">
          <QuestionValueCell
            :is-blank="parsedEquation.blankPosition === 'result'"
            :show-answer="showAnswer"
            :answer="answer"
            answer-display="text"
            :editable="enableDirectInput && parsedEquation.blankPosition === 'result'"
            :user-answer="userAnswer"
            :value="parsedEquation.resultValue"
            number-class="math-number-vertical"
            @update:user-answer="$emit('update:userAnswer', $event)"
            @submit-answer="$emit('submitAnswer')"
          />
        </el-col>
      </el-row>
      
      <!-- 进位/退位小标记（如果需要） -->
      <div v-if="carryMark" class="math-carry-mark">{{ carryMark }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElRow, ElCol } from 'element-plus'
import QuestionValueCell from '@/components/question/QuestionValueCell.vue'
import { useQuestionEquation, questionLayoutProps, questionLayoutEmits } from '@/components/question/questionLayoutShared'
const width = 12;
defineProps(questionLayoutProps)

defineEmits(questionLayoutEmits)

const { parsedEquation, carryType } = useQuestionEquation()

const carryMark = computed(() => {
  if (carryType.value === 'carry') {
    return '①'
  }
  if (carryType.value === 'borrow') {
    return '·'
  }
  return ''
})
</script>

<style lang="scss" scoped>
@import '@/styles/math-equation.scss';

.vertical-layout {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 20px 10px;
}

.vertical-equation {
  display:flex;
  flex-direction: column;
  // font-family: 'Courier New', monospace;
  position: relative;
  width: min(100%, 420px);
  margin: 0 auto;
  --vertical-digit-size: clamp(1.9rem, 5.2vw, 3.1rem);
  --vertical-operator-size: clamp(1.5rem, 4.2vw, 2.3rem);
}

.v-row {
  width: 100%;
  align-items: center;
  margin-bottom: 10px;
}

.result-row {
  margin-bottom: 0;
}

.operator-col,
.value-col {
  display: flex;
  align-items: center;
}

.operator-col {
  justify-content: flex-end;
  padding-right: 6px;
}
.second-row .operator-col {
  justify-content: flex-end;
  padding-right: 0px;
}
.value-col {
  justify-content: flex-end;
}

.math-operator {
  width: 1.5em;
  text-align: right;
  font-size: var(--vertical-operator-size);
  line-height: 1;
}

.operator-spacer,
.result-label {
  width: 1.5em;
  display: inline-block;
}

/* 使用共享样式，这里只需要定义字体大小 */
:deep(.math-number-vertical) {
  min-width: 2.8em;
  text-align: right;
  font-family: 'Courier New', monospace;
  font-size: var(--vertical-digit-size);
  line-height: 1.1;
}

/* 使用共享样式，这里只需要定义边距 */
.math-line {
  margin: 2px 0 12px 0;
  width: 100%;
  border-bottom-width: 3px;
}

.result-content {
  text-align: right;
}

:deep(.math-number-vertical),
:deep(.math-answer-input),
:deep(.math-answer-display),
:deep(.math-answer-placeholder) {
  text-align: right;
  font-size: var(--vertical-digit-size);
  line-height: 1.1;
}

:deep(.math-answer-input) {
  width: min(100%, 2.6em);
}

.math-carry-mark {
  position: absolute;
  top: 20px;
  right: 30px;
  font-weight: bold;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .vertical-equation {
    width: min(100%, 360px);
  }

  .math-carry-mark {
    top: 15px;
    right: 20px;
  }
}
</style>