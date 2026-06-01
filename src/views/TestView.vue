<template>
  <div class="test-view">
    <h1>组件渲染测试</h1>
    <TestComponentView />

    <div class="instructions">
      <h3>测试说明：</h3>
      <ul>
        <li>点击每个测试用例的按钮来显示/隐藏答案</li>
        <li>观察水平布局和竖式布局的显示效果</li>
        <li>检查填空位置是否正确识别</li>
        <li>验证进退位标记是否正常显示</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import TestComponentView from '@/components/TestComponentView.vue'
</script>

<style scoped>
.test-view {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100dvh;
}

.test-view h1 {
  font-size: 1.4rem;
  color: #1e3c5c;
  margin: 0 0 20px 0;
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