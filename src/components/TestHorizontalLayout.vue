<template>
  <div class="test-container">
    <h2>HorizontalLayout 组件测试</h2>
    
    <div class="test-cases">
      <div class="test-case">
        <h3>1. 正常算式：3+4=__</h3>
        <HorizontalLayout 
          :show-answer="showAnswer1"
          answer="7"
        />
        <el-button @click="showAnswer1 = !showAnswer1">
          {{ showAnswer1 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="test-case">
        <h3>2. 填空在左边：__+4=7</h3>
        <HorizontalLayout 
          :show-answer="showAnswer2"
          answer="3"
        />
        <el-button @click="showAnswer2 = !showAnswer2">
          {{ showAnswer2 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="test-case">
        <h3>3. 填空在右边：3+__=7</h3>
        <HorizontalLayout 
          :show-answer="showAnswer3"
          answer="4"
        />
        <el-button @click="showAnswer3 = !showAnswer3">
          {{ showAnswer3 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="test-case">
        <h3>4. 减法算式：8-3=__</h3>
        <HorizontalLayout 
          :show-answer="showAnswer4"
          answer="5"
        />
        <el-button @click="showAnswer4 = !showAnswer4">
          {{ showAnswer4 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="test-case">
        <h3>5. 填空在左边的减法：__-3=5</h3>
        <HorizontalLayout 
          :show-answer="showAnswer5"
          answer="8"
        />
        <el-button @click="showAnswer5 = !showAnswer5">
          {{ showAnswer5 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="test-case">
        <h3>6. 填空在右边的减法：8-__=5</h3>
        <HorizontalLayout 
          :show-answer="showAnswer6"
          answer="3"
        />
        <el-button @click="showAnswer6 = !showAnswer6">
          {{ showAnswer6 ? '隐藏答案' : '显示答案' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import HorizontalLayout from './question/HorizontalLayout.vue'

const showAnswer1 = ref(false)
const showAnswer2 = ref(false)
const showAnswer3 = ref(false)
const showAnswer4 = ref(false)
const showAnswer5 = ref(false)
const showAnswer6 = ref(false)
</script>

<style scoped>
.test-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.test-cases {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.test-case {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  background-color: #f9f9f9;
}

.test-case h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #333;
}

.test-case .el-button {
  margin-top: 15px;
}
</style>