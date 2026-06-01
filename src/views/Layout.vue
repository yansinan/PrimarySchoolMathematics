<template>
  <el-container class="practice-layout">
    <Generate />
    <el-main class="practice-layout__main">
      <Practice />
    </el-main>
    <StatsDrawer />
  </el-container>
</template>

<script setup>
import { Generate, Practice } from '@/components'
import StatsDrawer from '@/components/stats/StatsDrawer.vue'
</script>

<style lang="scss" scoped>
.practice-layout {
  height: 100dvh;
  background: linear-gradient(180deg, #f7fbff 0%, #eef6ff 100%);
}

.practice-layout__main {
  width: 100%;
  height: 100%;
  padding: clamp(8px, 1.8vw, 18px);
  overflow-y: auto;
  overflow-x: hidden;
}

:global(html),
:global(body),
:global(#app) {
  height: 100%;
  overflow: hidden;
}
</style>