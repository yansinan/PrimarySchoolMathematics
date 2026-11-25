<!--
  页头同步状态点（只在已绑定同步时显示）
  - 颜色：绿=已同步 / 蓝=同步中 / 橙=离线或待推送 / 红=需重新配对
  - 点击打开练习统计抽屉（同步面板在那里）
-->
<template>
  <el-tooltip v-if="visible" :content="label" placement="bottom" :show-after="200">
    <button
      type="button"
      class="sync-indicator"
      :class="`sync-indicator--${tone}`"
      :aria-label="label"
      @click="$emit('open')"
    >
      <el-icon :size="16"><Connection /></el-icon>
      <span class="sync-indicator__badge" />
    </button>
  </el-tooltip>
</template>

<script setup>
import { computed } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import { useSnapshotSync } from '@/composables/useSnapshotSync'
import { syncStatusLabel, syncStatusTone } from '@/sync/labels.js'

defineEmits(['open'])

const { status, configured, syncAvailable } = useSnapshotSync()

const visible = computed(() => syncAvailable && configured.value)
const label = computed(() => syncStatusLabel(status.value?.state))
const tone = computed(() => syncStatusTone(status.value?.state, status.value?.pending))
</script>

<style scoped>
.sync-indicator {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(23, 110, 191, 0.08);
  color: #4a6a85;
  cursor: pointer;
  transition: background 0.2s;
}

.sync-indicator:hover {
  background: rgba(23, 110, 191, 0.16);
}

.sync-indicator__badge {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  background: #a4b3c2;
}

.sync-indicator--ok .sync-indicator__badge { background: #58cc71; }
.sync-indicator--busy .sync-indicator__badge { background: #409eff; animation: sync-pulse 1s ease-in-out infinite; }
.sync-indicator--warn .sync-indicator__badge { background: #e6a23c; }
.sync-indicator--bad .sync-indicator__badge { background: #f56c6c; }

@keyframes sync-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
