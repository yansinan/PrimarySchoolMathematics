<template>
  <div class="test-container">
    <!-- ──── Horizontal 测试 ──── -->
    <section class="test-section">
      <h2>HorizontalLayout 组件测试</h2>

      <div class="test-cases">
        <div v-for="(t, i) in horizontalCases" :key="'h'+i" class="test-case">
          <h3>{{ t.label }}</h3>
          <HorizontalLayout
            :equation="t.equation"
            :show-answer="t.show"
            :answer="t.answer"
            :user-answer="t.userAnswer || ''"
          />
          <div class="case-info">
            <code>equation="{{ t.equation }}"</code>
            <el-button size="small" @click="t.show = !t.show">
              {{ t.show ? '隐藏答案' : '显示答案' }}
            </el-button>
          </div>
        </div>
      </div>
    </section>

    <el-divider />

    <!-- ──── Vertical 测试 ──── -->
    <section class="test-section">
      <h2>VerticalLayout（竖式计算）组件测试</h2>

      <div class="test-cases vertical-cases">
        <div v-for="(t, i) in verticalCases" :key="'v'+i" class="test-case">
          <h3>{{ t.label }}</h3>
          <VerticalLayout
            :equation="t.equation"
            :show-answer="t.show"
            :answer="t.answer"
            :user-answer="t.userAnswer || ''"
          />
          <div class="case-info">
            <code>equation="{{ t.equation }}"</code>
            <el-button size="small" @click="t.show = !t.show">
              {{ t.show ? '隐藏答案' : '显示答案' }}
            </el-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import HorizontalLayout from './question/HorizontalLayout.vue'
import VerticalLayout from './question/VerticalLayout.vue'

const horizontalCases = reactive([
  { label: '1. 正常算式：3+4=__',    equation: '3+4=7',   answer: '7', show: false },
  { label: '2. 填空在左边：__+4=7',   equation: '__+4=7', answer: '3', show: false },
  { label: '3. 填空在右边：3+__=7',   equation: '3+__=7', answer: '4', show: false },
  { label: '4. 减法算式：8-3=__',     equation: '8-3=5',  answer: '5', show: false },
  { label: '5. 填空在左边的减法：__-3=5', equation: '__-3=5', answer: '8', show: false },
  { label: '6. 填空在右边的减法：8-__=5', equation: '8-__=5', answer: '3', show: false },
  { label: '7. 乘法算式：6×7=__',     equation: '6×7=42', answer: '42', show: false },
  { label: '8. 除法算式：12÷3=__',    equation: '12÷3=4', answer: '4', show: false },
  { label: '9. 两位数加法：25+18=__',  equation: '25+18=43', answer: '43', show: false, note: '进位' },
  { label: '10. 两位数减法：52-28=__', equation: '52-28=24', answer: '24', show: false, note: '退位' },
])

const verticalCases = reactive([
  { label: '1. 加法：32+25=__', equation: '32+25=57', answer: '57', show: false },
  { label: '2. 减法：68-23=__', equation: '68-23=45', answer: '45', show: false },
  { label: '3. 进位加法：47+35=__', equation: '47+35=82', answer: '82', show: false, note: '进位' },
  { label: '4. 退位减法：52-28=__', equation: '52-28=24', answer: '24', show: false, note: '退位' },
  { label: '5. 三位数加法：123+456=__', equation: '123+456=579', answer: '579', show: false },
  { label: '6. 三位数减法：876-543=__', equation: '876-543=333', answer: '333', show: false },
  { label: '7. 填空在左边：__+28=50', equation: '__+28=50', answer: '22', show: false },
  { label: '8. 填空在右边：95-__=47', equation: '95-__=47', answer: '48', show: false },
  { label: '9. 填空为结果：63+27=__', equation: '63+27=90', answer: '90', show: false },
  { label: '10. 连续进位：99+99=__', equation: '99+99=198', answer: '198', show: false, note: '连续进位' },
])
</script>

<style scoped>
.test-container {
  padding: 16px 20px;
  max-width: 960px;
  margin: 0 auto;
}

.test-section {
  margin-bottom: 24px;
}

.test-section h2 {
  font-size: 1.25rem;
  color: #1e3c5c;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #409eff;
}

.test-cases {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.vertical-cases {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.test-case {
  border: 1px solid #e8edf3;
  border-radius: 10px;
  padding: 16px;
  background: #fafcff;
  transition: box-shadow 0.2s;
}

.test-case:hover {
  box-shadow: 0 4px 16px rgba(23, 110, 191, 0.08);
}

.test-case h3 {
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  color: #333;
  font-weight: 600;
}

.case-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.case-info code {
  font-size: 0.82rem;
  background: #eef2f7;
  padding: 4px 10px;
  border-radius: 6px;
  color: #606266;
  word-break: break-all;
}

@media (max-width: 480px) {
  .test-container {
    padding: 10px 12px;
  }
  .vertical-cases {
    grid-template-columns: 1fr;
  }
  .test-case {
    padding: 12px;
  }
}
</style>
