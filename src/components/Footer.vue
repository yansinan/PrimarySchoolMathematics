<template>
  <footer v-if="false" class="app-footer">
    <template v-for="bind in bands">
      <p class="h-7">
        <a v-if="bind.link" :href="bind.link" target="_blank">
          <img :alt="bind.imageAlt" :src="bind.imageSrc" class="mr-2"/>
        </a>
        <img v-else :alt="bind.imageAlt" :src="bind.imageSrc" class="mr-2"/>
      </p>
    </template>
  </footer>
</template>

<script setup>
import { ref } from 'vue'

const bands = ref([
  { imageAlt: 'Vue-3.2.41', imageSrc: 'https://img.shields.io/badge/Vue-3.2.41-blue' },
  { imageAlt: 'license-Apache--2.0', imageSrc: 'https://img.shields.io/badge/license-Apache--2.0-green' },
  {
    imageAlt: '',
    imageSrc: 'https://img.shields.io/badge/Gitee--PrimarySchoolMathematics-red?logo=gitee',
    link: 'https://gitee.com/J_Sky/PrimarySchoolMathematics'
  },
  {
    imageAlt: '',
    imageSrc: 'https://img.shields.io/badge/Github--PrimarySchoolMathematics-green?logo=github',
    link: 'https://github.com/bosichong/PrimarySchoolMathematics'
  }
])
</script>

<style lang="scss" scoped>
.app-footer {
  display: none;
}
</style>