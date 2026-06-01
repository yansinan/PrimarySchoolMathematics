<!-- components/input/NumberKeypad.vue -->
<template>
  <el-row justify="center">
    <el-col :span="16" :md="16" :xs="20" class="keypad-shell">
      <!-- 9宫格数字区 (1-9) -->
      <div class="grid-container">
        <el-button
          v-for="num in 9"
          :key="num"
          type="primary"
          size="large"
          :disabled="disabled"
          @click="handleNumber(num)"
          class="grid-btn"
        >
          {{ num }}
        </el-button>
        <!-- 底部一行：退格、0、确认 -->
        <el-button
          size="large"
          :icon="Back"
          :disabled="disabled || !currentValue"
          @click="handleBackspace"
          class="grid-btn bnBack"
        >
          退格
        </el-button>
        
        <el-button
          type="primary"
          size="large"
          :disabled="disabled"
          @click="handleNumber(0)"
          class="grid-btn zero-btn"
        >
          0
        </el-button>
        
        <el-button
          type="success"
          size="large"
          :disabled="disabled || !currentValue"
          @click="$emit('submit')"
          class="grid-btn confirm-btn"
        >
          确认
        </el-button>

      </div>
      <!-- 当前输入显示（可选） -->
      <div v-if="showInput" class="display-area">
        <el-card shadow="hover" :body-style="{ padding: '16px', textAlign: 'center' }">
          <span class="display-label">当前输入:</span>
          <span class="display-value">{{ currentValue || '___' }}</span>
        </el-card>
      </div>
    </el-col>
  </el-row>
</template>

<script setup>
import { Back } from '@element-plus/icons-vue'

const props = defineProps({
  currentValue: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  showInput: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['input', 'backspace', 'submit'])

const handleNumber = (num) => {
  emit('input', (props.currentValue || '') + num)
}

const handleBackspace = () => {
  if (props.currentValue) {
    emit('input', props.currentValue.slice(0, -1))
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/input-ui.scss' as inputUi;

.keypad-shell {
  @include inputUi.input-panel-surface;
  padding: clamp(12px, 2vw, 20px);
}

.grid-container {
  @include inputUi.input-grid(3, 3, 12px);
  margin-bottom: 12px;
}

.grid-btn {
  @include inputUi.input-button-base;
  height: clamp(58px, 10vw, 84px) !important;
  font-size: clamp(22px, 4vw, 34px) !important;
  padding: 0 !important;
  margin: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.grid-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.grid-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(28, 176, 246, 0.2);
}

.bnBack {
  background-color: #f5f7fa !important;
  border-color: #dcdfe6 !important;
  color: #606266 !important;
  font-size: 24px !important;
}

.bnBack:hover:not(:disabled) {
  background-color: #ecf5ff !important;
  border-color: #c6e2ff !important;
  color: #409eff !important;
}

.zero-btn {
  background-color: #ecf5ff !important;
  border-color: #c6e2ff !important;
  color: #409eff !important;
  font-weight: bold !important;
}

.zero-btn:hover:not(:disabled) {
  background-color: #d9ecff !important;
}

.confirm-btn {
  font-weight: bold !important;
  background-color: #58cc71 !important;
  border-color: #45b05c !important;
  color: white !important;
}

.confirm-btn:hover:not(:disabled) {
  background-color: #45b05c !important;
}

.confirm-btn:disabled {
  opacity: 0.6;
}

.display-area {
  margin-top: 16px;
}

.display-label {
  font-size: 20px;
  color: #606266;
  margin-right: 8px;
}

.display-value {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
}

@media (max-width: 768px) {
  .keypad-shell {
    padding: 12px;
  }

  .grid-btn {
    height: 60px !important;
    font-size: 24px !important;
  }

  .display-value {
    font-size: 28px;
  }
}

@media (max-width: 480px) {
  .grid-container {
    gap: 10px;
  }

  .grid-btn {
    height: 56px !important;
    font-size: 22px !important;
  }

  .display-value {
    font-size: 26px;
  }
}

@media (max-width: 360px) {
  .grid-btn {
    height: 52px !important;
    font-size: 20px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .grid-btn {
    transition: none;
    transform: none !important;
  }
}
</style>