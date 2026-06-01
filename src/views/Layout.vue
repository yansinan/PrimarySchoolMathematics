<template>
  <el-container class="practice-layout">
    <Generate />
    <el-main class="practice-layout__main">
      <Practice />
    </el-main>
  </el-container>
</template>

<script setup>
import { Generate, Practice } from '@/components'
</script>

<style lang="scss" scoped>
.practice-layout {
  min-height: 100dvh;
  background: linear-gradient(180deg, #f7fbff 0%, #eef6ff 100%);
  overflow: hidden;
}

.practice-layout__main {
  width: 100%;
  padding: clamp(8px, 1.8vw, 18px);
  overflow: hidden;
}

:global(html),
:global(body),
:global(#app) {
  height: 100%;
  overflow: hidden;
}
</style>