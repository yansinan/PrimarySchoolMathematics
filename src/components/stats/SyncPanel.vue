<!--
  多设备同步面板（练习统计抽屉底部）
  - 未启用：首台设备一键启用（预置 projectId + 用户名）/ 第二台设备用配对码加入
  - 已启用：状态、立即同步、生成配对码、解绑
  凭据存 HttpOnly cookie；本机曾绑定但凭据失效时，不自动重开账号。
-->
<template>
  <div class="sync-panel">
    <div class="sync-panel__head">
      <span class="sync-panel__title">
        <el-icon><Connection /></el-icon>
        多设备同步
      </span>
      <el-tag size="small" :type="tagType" effect="plain">{{ label }}</el-tag>
    </div>

    <p class="sync-panel__hint">
      同一孩子的练习记录在多台设备间自动合并；同步失败不影响本机答题。
    </p>

    <!-- 未启用 -->
    <template v-if="!configured">
      <el-alert
        v-if="boundBefore"
        type="warning"
        :closable="false"
        show-icon
        class="sync-panel__alert"
        title="本机曾绑定过同步，但凭据已失效"
        description="请用仍能同步的设备生成配对码，在下方加入。直接「重新启用」会在云端新建一个空账号。"
      />
      <template v-else>
        <el-button type="primary" class="w-full" :loading="busy" @click="onEnable">
          启用同步
        </el-button>
        <p class="sync-panel__sub">首台设备点这里；其他设备用配对码加入。</p>
      </template>

      <el-input
        v-model="pairCode"
        class="sync-panel__input"
        placeholder="配对码，如 ABCD-EFGH"
        maxlength="9"
        clearable
        @keyup.enter="onPair"
      />
      <el-button class="w-full" :loading="busy" @click="onPair">用配对码加入</el-button>
    </template>

    <!-- 已启用 -->
    <template v-else>
      <div class="sync-panel__meta">
        <span>用户：{{ identity?.user?.name || '—' }}</span>
        <span>设备：{{ identity?.device?.name || '—' }}</span>
      </div>
      <div class="sync-panel__meta">
        <span>最后同步：{{ lastSyncText }}</span>
        <span v-if="pending">有改动待推送</span>
      </div>

      <el-button type="primary" class="w-full" :loading="busy" @click="onSyncNow">
        立即同步
      </el-button>

      <el-button class="w-full" @click="onCreatePairing">生成配对码（给第二台设备）</el-button>
      <el-alert
        v-if="pairing"
        type="success"
        :closable="false"
        class="sync-panel__alert"
      >
        配对码 <strong class="sync-panel__code">{{ pairing.code }}</strong>
        <span class="sync-panel__expire">{{ pairingExpireText }} 前有效</span>
      </el-alert>

      <el-button link type="danger" class="sync-panel__reset" @click="onReset">解绑本机</el-button>
    </template>

    <p v-if="errorText" class="sync-panel__error">{{ errorText }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection } from '@element-plus/icons-vue'
import { useSnapshotSync } from '@/composables/useSnapshotSync'

const sync = useSnapshotSync()
const { status, identity, configured, busy } = sync

const STATUS_LABELS = {
  idle: '待同步',
  syncing: '同步中…',
  synced: '已同步',
  offline: '离线，稍后重试',
  unauthorized: '需重新配对',
  unconfigured: '未启用',
  error: '同步失败',
  busy: '同步中…',
  locked: '其他标签页同步中',
}

const STATUS_TAGS = {
  synced: 'success',
  offline: 'warning',
  unauthorized: 'danger',
  error: 'danger',
  syncing: 'info',
  busy: 'info',
}

const label = computed(() => STATUS_LABELS[status.value?.state] || status.value?.state || '未启用')
const tagType = computed(() => STATUS_TAGS[status.value?.state] || 'info')
const errorText = computed(() => (status.value?.state === 'offline' || status.value?.state === 'error' ? status.value.error : ''))

const boundBefore = ref(false)
const pairCode = ref('')
const pairing = ref(null)
let pairingTimer = null

const lastSyncText = computed(() => {
  const at = status.value?.lastSyncAt
  return at ? new Date(at).toLocaleString('zh-CN', { hour12: false }) : '—'
})
const pairingExpireText = computed(() => {
  const at = pairing.value?.expiresAt
  return at ? new Date(at).toLocaleTimeString('zh-CN', { hour12: false }) : ''
})

function showError(e, fallback) {
  const msg = e?.body?.error || e?.message || fallback
  ElMessage.error(msg)
}

async function onEnable() {
  try {
    await sync.enrollFirstDevice()
    ElMessage.success('同步已启用')
  } catch (e) {
    showError(e, '启用同步失败')
  }
}

async function onPair() {
  const code = pairCode.value.trim().toUpperCase()
  if (!code) {
    ElMessage.warning('请输入配对码')
    return
  }
  try {
    await sync.enrollWithPairingCode(code)
    pairCode.value = ''
    ElMessage.success('已加入同步账号')
  } catch (e) {
    showError(e, '配对失败（可能已过期）')
  }
}

async function onSyncNow() {
  const result = await sync.syncNow()
  if (result.state === 'synced') ElMessage.success('已同步')
  else if (result.state !== 'busy' && result.state !== 'locked') {
    ElMessage.warning(STATUS_LABELS[result.state] || result.state)
  }
}

async function onCreatePairing() {
  try {
    pairing.value = await sync.createPairingCode(600)
    clearInterval(pairingTimer)
    pairingTimer = setInterval(() => {
      if (!pairing.value || Date.parse(pairing.value.expiresAt) <= Date.now()) {
        pairing.value = null
        clearInterval(pairingTimer)
      }
    }, 1000)
  } catch (e) {
    showError(e, '生成配对码失败')
  }
}

async function onReset() {
  try {
    await ElMessageBox.confirm(
      '解绑后本机不再同步。云端已上传的记录仍会保留；如果再用「启用同步」，会在云端新建一个空账号。',
      '解绑本机同步？',
      { type: 'warning', confirmButtonText: '解绑', cancelButtonText: '取消' },
    )
  } catch { return }
  sync.resetBinding()
  pairCode.value = ''
  pairing.value = null
  ElMessage.success('已解绑本机')
}

// 打开面板时读一次绑定标记（localStorage 不是响应式的）
boundBefore.value = sync.hasBoundBefore()

onBeforeUnmount(() => {
  clearInterval(pairingTimer)
})
</script>

<style scoped>
.sync-panel {
  margin-top: 4px;
}

.sync-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sync-panel__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
  color: #1e3c5c;
}

.sync-panel__hint {
  margin: 6px 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #8fa3b8;
}

.sync-panel__sub {
  margin: 6px 0 0;
  font-size: 12px;
  color: #a4b3c2;
}

.sync-panel__alert {
  margin: 8px 0;
}

.sync-panel__input {
  margin: 10px 0 8px;
}

.sync-panel__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #7f8c9b;
  margin: 4px 0;
}

.sync-panel__code {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  letter-spacing: 1px;
}

.sync-panel__expire {
  margin-left: 8px;
  font-size: 12px;
  color: #8fa3b8;
}

.sync-panel__reset {
  margin-top: 8px;
}

.sync-panel__error {
  margin-top: 8px;
  font-size: 12px;
  color: #f56c6c;
}

.sync-panel .w-full {
  width: 100%;
}
</style>
