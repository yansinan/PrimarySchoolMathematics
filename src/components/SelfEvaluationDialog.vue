<!--
  自我评价弹窗组件
  替代 Practice.vue 中的内联 HTML + ElMessageBox + window.__evalSelect 全局桥
  使用 v-model:visible 控制显示，emit 'select' 传递 1-5 分
-->
<template>
  <el-dialog
    :model-value="visible"
    title="💬 给这组题点个评"
    width="400px"
    :show-close="true"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    custom-class="eval-dialog"
    @update:model-value="handleUpdate"
  >
    <div class="eval-content">
      <div class="eval-meta">
        第{{ groupIndex }}组 · {{ correctCount }}/{{ totalCount }} 正确 · {{ timeText }}
      </div>
      <div class="eval-prompt">{{ comment }} · 感觉怎么样？选一个表情吧</div>

      <div class="eval-faces">
        <div
          v-for="face in faces"
          :key="face.score"
          class="eval-face"
          :class="{ 'eval-face--selected': selectedScore === face.score }"
          @click="selectScore(face.score)"
          @mouseover="hoveredScore = face.score"
          @mouseleave="hoveredScore = null"
        >
          {{ face.emoji }}
        </div>
      </div>

      <div class="eval-hint">
        <template v-if="selectedScore">
          已选「{{ scoreLabels[selectedScore] }}」
        </template>
        <template v-else>
          点击表情打分 · 单击即继续
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
/**
 * Props:
 *  - visible: boolean
 *  - groupIndex: number
 *  - correctCount: number
 *  - totalCount: number
 *  - timeText: string (格式化后的时间，如 '01:23')
 *  - comment: string (本组评语，如 '又快又准！👍')
 *
 * Emits:
 *  - update:visible
 *  - select (score: 1|2|3|4|5)
 */
import { ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  groupIndex: { type: Number, default: 1 },
  correctCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  timeText: { type: String, default: '00:00' },
  comment: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'select'])

const selectedScore = ref(3)  // 默认 3 = 刚刚好
const hoveredScore = ref(null)

// 弹窗打开时重置
watch(() => props.visible, (v) => {
  if (v) {
    selectedScore.value = 3
    hoveredScore.value = null
  }
})

// 5 个表情（Unicode 表情字符，直接渲染）
const faces = [
  { score: 1, emoji: '😩' },
  { score: 2, emoji: '😟' },
  { score: 3, emoji: '🙂' },
  { score: 4, emoji: '😄' },
  { score: 5, emoji: '😌' },
]

const scoreLabels = {
  1: '有点难…',
  2: '不太轻松',
  3: '刚刚好',
  4: '挺容易',
  5: '太简单',
}

function selectScore(score) {
  selectedScore.value = score
  // 不再自动关闭，让用户看清楚选择的分数后手动关闭（点外部或按 ESC）
  // 之前 400ms 自动关闭太快，用户来不及看就被跳走
  // 选择后通过 @update:model-value → handleUpdate 在关闭时触发 select
}

function handleUpdate(val) {
  // 弹窗关闭时（点击外部或按 ESC）才 emit select
  // 避免 selectScore 和 handleUpdate 双重 emit 导致的 promise 二次解析
  if (!val) emit('select', selectedScore.value)
}
</script>

<style scoped>
.eval-content {
  text-align: center;
}

.eval-meta {
  font-size: 13px;
  color: #909399;
  margin-bottom: 2px;
}

.eval-prompt {
  font-size: 14px;
  font-weight: 600;
  color: #1e3c5c;
  margin: 10px 0 14px;
}

.eval-faces {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.eval-face {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  cursor: pointer;
  border-radius: 16px;
  border: 2px solid transparent;
  background: #f7fbff;
  box-shadow: 0 2px 8px rgba(23, 110, 191, 0.06);
  transition: all 0.2s ease;
}

.eval-face:hover {
  background: #e9f4ff;
  border-color: #409eff;
  transform: scale(1.1);
}

.eval-face--selected {
  background: #d9ecff !important;
  border-color: #409eff !important;
}

.eval-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}
</style>
