<template>
  <div class="reset-view">
    <el-card class="reset-card">
      <h1>清空练习记录</h1>
      <p class="warning-text">此操作将永久删除所有练习记录、统计数据及能力评估结果，不可恢复。</p>
      
      <div v-if="!done" class="confirm-area">
        <el-checkbox v-model="confirmed">我确认要清空所有数据</el-checkbox>
        <div class="actions">
          <el-button type="danger" :disabled="!confirmed" @click="handleReset">
            <el-icon><Delete /></el-icon> 清空所有记录
          </el-button>
          <el-button @click="$router.push('/home')">取消</el-button>
        </div>
      </div>
      <div v-else class="done-area">
        <el-result icon="success" title="已清空" sub-title="所有练习记录已删除">
          <template #extra>
            <el-button type="primary" @click="$router.push('/home')">返回首页</el-button>
          </template>
        </el-result>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElCard, ElCheckbox, ElButton, ElResult, ElIcon } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { clearAllData } from '@/utils/store/database'

const router = useRouter()
const confirmed = ref(false)
const done = ref(false)

const handleReset = async () => {
  try {
    await clearAllData()
    done.value = true
  } catch (e) {
    console.error('清空数据失败', e)
  }
}
</script>

<style scoped>
.reset-view {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #f5f7fa;
}

.reset-card {
  max-width: 480px;
  width: 100%;
  text-align: center;
}

.warning-text {
  color: #e74c3c;
  font-size: 1rem;
  margin: 16px 0;
}

.confirm-area {
  margin-top: 24px;
}

.actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: center;
}

.done-area {
  margin-top: 20px;
}
</style>
