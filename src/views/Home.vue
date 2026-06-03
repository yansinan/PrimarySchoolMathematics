<template>
  <div class="page-container">
    <ElRow :gutter="20">
      <ElCol :xs="24" :sm="16" :md="16" :lg="12" :xl="8">
        <ElForm ref="refForm" :model="formData" label-position="top">
          <ElFormItem label="生成模式">
            <el-radio-group v-model="formData.generateMode">
              <el-radio-button label="1">自动生成</el-radio-button>
              <el-radio-button label="2">手动添加</el-radio-button>
            </el-radio-group>
          </ElFormItem>

          <template v-if="formData.generateMode == '1'">
            <AutoGenerateFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm"
              :configurations="configurations" @add-configuration="addConfiguration" />
          </template>

          <template v-if="formData.generateMode == '2'">
            <CustomFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm" />
          </template>

          <template v-if="paperDescriptionList && paperDescriptionList.length">
            <ElFormItem label="当前口算题包含的内容">
              <div v-for="p in paperDescriptionList">
                <ElTag style="margin-right: 8px;">{{ p }}</ElTag>
              </div>
            </ElFormItem>
          </template>
        </ElForm>

        <el-button :disabled="!paperList.length" type="primary" size="large" :loading="buttonLoading"
          @click="generate">点此生成口算题卷子</el-button>
        <el-button :disabled="!paperList.length" type="primary" size="large" :loading="buttonLoading"
          @click="generateFormulas">点此生成口算题数组</el-button>
      </ElCol>
      <ElCol :xs="24" :sm="8" :md="8" :lg="8" :xl="8">
        <ConfigurationList v-model:active-index="activeConfigurationId" :configurations="configurations"
          @removed="refreshConfiguration" @selected="selectedConfiguration" @reset="refreshConfiguration" />
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup>
import { ref, onMounted, unref, toRaw, getCurrentInstance, computed } from 'vue';
import { useRouter } from "vue-router";
import { CustomFormulas, AutoGenerateFormulas, ConfigurationList } from "@/components/home";
import ConfigStorage from "@/utils/configStorage";
import { fileNameGeneratedRuleEnum, httpContentTypeExtensionsMappingEnum } from '@/utils/enum';
import { download } from "@/utils/download";
import { generatePaper } from '@/apis/paper';
import { useAppStore } from '@/stores/app';
import { createFormulasGenerator } from '@/utils/paperGenerator';
// 表单默认值（17 字段统一来源）
import { DEFAULT_FORM_DATA, applyConfigToFormData } from '@/utils/formDefaults';
// 解算式
import { EquationSolver } from '@/utils/EquationSolver';

const { proxy } = getCurrentInstance()

const refForm = ref(null)

const formData = ref({ ...DEFAULT_FORM_DATA })

const configurations = ref([])

onMounted(async () => {
  console.log('少年，我看你骨骼精奇，是万中无一的编程奇才，有个程序员大佬qq群[217840699]你加下吧!维护世界和平就靠你了')
  document.title = '小学数学口算题 | Primary School Mathematics'

  refreshConfiguration()
  const { data: config } = configurations.value[0] // todo

  // 用 applyConfigToFormData 替代 17 行手写赋值
  // Home.vue 旧版不应用自适应阈值（targetMin/Max）
  applyConfigToFormData(formData.value, config, { includeAdaptive: false })
})

const paperList = ref([])
const paperDescriptionList = computed(() => {
  return paperList.value.map(p => {
    return p.customFormulaList && p.customFormulaList.length ? `自定义口算题${p.numberOfFormulas}道` : `${p.step}步计算题口算题${p.numberOfFormulas}道`
  })
})

const activeConfigurationId = ref('1')
const refreshConfiguration = () => {
  configurations.value = new ConfigStorage().loadAll()
}
const addConfiguration = (newId) => {
  activeConfigurationId.value = newId
  refreshConfiguration()
}
const selectedConfiguration = (configuration) => {
  console.log(configuration);

  const { data: config } = configuration
  // 不含自适应阈值（Home.vue 旧版就没 targetMin/Max）
  applyConfigToFormData(formData.value, config, { includeAdaptive: false })
}

const buttonLoading = ref(false)
const appStore = useAppStore()
const router = useRouter()
const generate = () => {
  // 生成试卷数量不能过多
  const numberOfFormulas = paperList.value.reduce((prev, cur) => {
    prev += parseInt(cur.numberOfFormulas)
    return prev
  }, 0)

  if (numberOfFormulas * formData.value.numberOfPapers > 1000) {
    proxy.$message.error('题目总数不能超过1000题!')
    return
  }

  const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
  appStore.navigateToPrint(router, formData.value.fileNameGeneratedRule == fileNameGeneratedRuleEnum.baseOnTitleAndIndex.key ? formData.value.paperTitle : "", papers)
  paperList.value = []
}
const generateFormulas = () => {
  // 生成试卷数量不能过多
  const numberOfFormulas = paperList.value.reduce((prev, cur) => {
    prev += parseInt(cur.numberOfFormulas)
    return prev
  }, 0)

  if (numberOfFormulas * formData.value.numberOfPapers > 1000) {
    proxy.$message.error('题目总数不能超过1000题!')
    return
  }

  const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
  const listFormulas = papers.reduce((prev, cur) => {
    prev.push(...cur.formulas)
    return prev
  }, []);
  
  // 测试计算结果
  const listResult = listFormulas.reduce((prev, cur) => {
    const result = EquationSolver.solve(cur);
    prev.push({
      equation: cur,
      solution: result,
    })
    return prev;
  }, []);  
  debugger
}
</script>

<style lang="scss" scoped></style>