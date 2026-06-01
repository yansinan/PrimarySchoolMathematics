<template>
  <div class="test-view">
    <h1>HorizontalLayout 组件测试</h1>
    <TestHorizontalLayout />
    
    <div class="instructions">
      <h3>测试说明：</h3>
      <ul>
        <li>点击每个测试用例的按钮来显示/隐藏答案</li>
        <li>观察不同题型格式的显示效果</li>
        <li>检查填空位置是否正确识别</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import TestHorizontalLayout from '@/components/TestHorizontalLayout.vue'
</script>

<style scoped>
.test-view {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.instructions {
  margin-top: 40px;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
  border-left: 4px solid #409eff;
}

.instructions h3 {
  margin-top: 0;
  color: #333;
}

.instructions ul {
  margin-bottom: 0;
}
</style>