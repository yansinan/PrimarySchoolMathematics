<template>
  <el-container>
    <el-header height="64px">
      <Header />
    </el-header>
    <el-main>
      <Generate />
      <!-- <ProgressSteps /> -->
      <!-- <NumberKeypad /> -->
      <!-- <OptionButtons /> -->
      <Practice />
    </el-main>
    <el-footer>
      <Footer />
    </el-footer>
  </el-container>
</template>

<script setup>
import { Header, Footer, Menu } from "@/components";
import Home from "./Home.vue";
// 解算式
import {Generate} from '@/components';
// import {NumberKeypad,OptionButtons,ProgressSteps} from '@/components';

import {Practice} from '@/components';
 
</script>

<style lang="scss" scoped></style>