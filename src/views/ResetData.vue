<template>
  <div class="reset-view">
    <el-card class="reset-card">
      <h1>清空练习记录</h1>
      <p class="warning-text">此操作将永久删除所有练习记录、统计数据及能力评估结果，不可恢复。</p>
      
      <div v-if="!done" class="confirm-area">
        <!-- 阶段一同步「只增不删」：不断开同步的话，清空后云端记录会被拉回来 -->
        <template v-if="syncConfigured">
          <el-checkbox v-model="disconnectSync">同时断开本机同步（推荐）</el-checkbox>
          <p v-if="disconnectSync" class="sync-hint">
            断开后本机不再同步，云端已上传的记录仍保留；想继续同步需重新启用或配对。
          </p>
          <p v-else class="sync-hint sync-hint--warn">
            未断开同步：清空后，云端记录会在下次同步时重新下载回来。
          </p>
        </template>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElCard, ElCheckbox, ElButton, ElResult, ElIcon, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { clearAllData } from '@/services/databaseInit'
import { usePracticeStore } from '@/stores/practice'
import { useSnapshotSync } from '@/composables/useSnapshotSync'

const router = useRouter()
const practiceStore = usePracticeStore()
const snapshotSync = useSnapshotSync()
const confirmed = ref(false)
const done = ref(false)
/** 清空前是否同时断开本机同步（默认断开：否则云端记录会被拉回来） */
const disconnectSync = ref(true)
const syncConfigured = computed(() => snapshotSync.configured.value)

// 恢复同步身份，确认这台设备是否绑定了同步
onMounted(() => { void snapshotSync.init() })

const handleReset = async () => {
  try {
    if (syncConfigured.value) {
      if (disconnectSync.value) {
        snapshotSync.resetBinding()
      } else {
        try {
          await ElMessageBox.confirm(
            '未断开同步：清空后，云端记录会在下次同步时重新下载回来。确定继续？',
            '确认清空？',
            { type: 'warning', confirmButtonText: '继续清空', cancelButtonText: '取消' },
          )
        } catch { return }
      }
    }
    await clearAllData()
    // 数据库已清空 → 画像不存在了，必须同步重置内存态
    // 否则抽屉门禁仍认为「已评估完成」，且残留题目会继续显示
    practiceStore.$reset()
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

.sync-hint {
  margin: 4px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #8fa3b8;
  text-align: left;
}

.sync-hint--warn {
  color: #e6a23c;
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
