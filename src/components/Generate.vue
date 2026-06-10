<template>
    <!-- 生成测试菜单 -->
    <el-tooltip
        class="box-item"
        content="生成测试"
        placement="top"    >
      <el-button type="success" :icon="List" size="large" circle @click="practiceStore.setGenerateDrawerVisible(true)" class="coffee-me"/>
    </el-tooltip>

    <el-drawer
      v-model="practiceStore.generateDrawerVisible"
      size="min(520px, calc(100vw - 32px))"
      direction="ltr"
      :before-close="handleClose"
      wrapper-closable
      class="generate-drawer"
    >
      <template #header>
        <span class="drawer-header">
          <el-icon :size="20" style="margin-right: 6px;"><List /></el-icon>
          测试生成
        </span>
      </template>

      <div class="drawer-scroll">
        <!-- ── Configuration list (top, for quick reuse) ── -->
        <div class="config-section">
          <ConfigurationList v-model:active-index="activeConfigurationId" :configurations="configurations"
            @removed="refreshConfiguration" @selected="selectedConfiguration" />
        </div>

        <el-divider />

        <!-- ── Form ── -->
        <ElForm ref="refForm" :model="formData" label-position="top" size="default">
          <ElFormItem label="生成模式">
            <el-radio-group v-model="formData.generateMode" class="mode-radio-group">
              <el-radio-button label="1">自动生成</el-radio-button>
              <el-radio-button label="2">手动添加</el-radio-button>
            </el-radio-group>
          </ElFormItem>

          <!-- 自动生成 -->
          <template v-if="formData.generateMode == '1'">
            <AutoGenerateFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm"
              :configurations="configurations" @add-configuration="addConfiguration" @valid-change="(v) => formValid = v" />
          </template>
          <!-- 手动输入 -->
          <template v-if="formData.generateMode == '2'">
            <CustomFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm" />
          </template>

          <template v-if="paperDescriptionList && paperDescriptionList.length">
            <ElFormItem label="当前口算题包含的内容">
              <div class="paper-tags">
                <ElTag v-for="p in paperDescriptionList" :key="p" class="paper-tag">{{ p }}</ElTag>
              </div>
            </ElFormItem>
          </template>
        </ElForm>

        <div class="drawer-actions">
          <el-button :disabled="!paperList.length" size="large" :loading="buttonLoading"
            @click="generate" class="action-btn">
            <el-icon><Document /></el-icon> 生成卷子
          </el-button>
          <el-button :disabled="!paperList.length || !formValid" type="primary" size="large" :loading="buttonLoading"
            @click="generateFormulas" class="action-btn action-btn--primary">
            <el-icon><CaretRight /></el-icon> 开始练习
          </el-button>
        </div>
      </div>
    </el-drawer>
</template>

<script setup>
import { ref, onMounted, unref, toRaw, getCurrentInstance, computed } from 'vue';
import { useRouter } from "vue-router";
import { CustomFormulas, AutoGenerateFormulas, ConfigurationList } from "@/components/generate";
import ConfigStorage from "@/utils/store/configStorage";
import { fileNameGeneratedRuleEnum } from '@/utils/enum';
import { usePracticeStore } from '@/stores/practice';
import { createFormulasGenerator } from '@/utils/paperGenerator';
// 表单默认值（17 字段统一来源）
import { DEFAULT_FORM_DATA, applyConfigToFormData, buildPaperDescriptionList } from '@/utils/form/formDefaults';
// 解算式
import { EquationSolver } from '@/utils/algorithm/EquationSolver';
const { proxy } = getCurrentInstance()

// 界面操作参数
import {
  List,
  Document,
  CaretRight
} from '@element-plus/icons-vue'
// 界面操作参数
const practiceStore = usePracticeStore()
// E3: 内联 navigateToPrint 需 router (修复 pre-existing bug: router 之前 import 但未声明)
const router = useRouter()

// P4-2: targetMin/Max 校验状态（从 AutoGenerateFormulas 接收）
const formValid = ref(true)

const refForm = ref(null)

const formData = ref({ ...DEFAULT_FORM_DATA })

const configurations = ref([])

onMounted(async () => {
  console.log('少年，我看你骨骼精奇，是万中无一的编程奇才，有个程序员大佬qq群[217840699]你加下吧!维护世界和平就靠你了')
  document.title = '小学数学口算题 | Primary School Mathematics'

  refreshConfiguration()
  const { data: config } = configurations.value[0] // todo

  // 用 applyConfigToFormData 替代 19 行手写赋值（含 targetMin/Max）
  applyConfigToFormData(formData.value, config, { includeAdaptive: true })
})

const paperList = ref([])
const paperDescriptionList = computed(() => buildPaperDescriptionList(paperList.value))

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
  formData.value.step = config.step
  formData.value.numberOfFormulas = config.numberOfFormulas
  formData.value.whereIsResult = config.whereIsResult
  formData.value.enableBrackets = config.enableBrackets
  formData.value.carry = config.carry
  formData.value.abdication = config.abdication
  formData.value.remainder = config.remainder
  formData.value.solution = config.solution
  formData.value.numberOfPapers = config.numberOfPapers
  formData.value.numberOfPagerColumns = config.numberOfPagerColumns
  formData.value.paperTitle = config.paperTitle
  formData.value.paperSubTitle = config.paperSubTitle
  formData.value.formulaList = config.formulaList
  formData.value.resultMinValue = config.resultMinValue
  formData.value.resultMaxValue = config.resultMaxValue
  formData.value.targetMin = config.targetMin ?? 10
  // 用 applyConfigToFormData 替代 19 行手写赋值（含 targetMin/Max）
  applyConfigToFormData(formData.value, config, { includeAdaptive: true })

  const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
  // E3: sessionStorage + key in query 替代原 stores/app.js 跨页面 state
  // (路径 4 — papers 大小无限制, URL 短, 刷新/前进后退恢复)
  const fileName = formData.value.fileNameGeneratedRule == fileNameGeneratedRuleEnum.baseOnTitleAndIndex.key
    ? formData.value.paperTitle
    : ""
  const key = `print_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try { sessionStorage.setItem(key, JSON.stringify(papers)) } catch {}
  router.push({ path: '/print', query: { fileName, key } })
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

  // Capture config snapshot for stats tracking
  practiceStore.setConfigSnapshot(toRaw(unref(formData)))

  // Manual generation → switch to practice mode
  practiceStore.setPhase('practice')

  practiceStore.setGenerateDrawerVisible(false);
  practiceStore.setListPractices(listResult);
}

/**
 * Called when the drawer tries to close. Validates the form first.
 * @param {Function} done 
 */
const handleClose = (done) => {
  refForm?.value?.validate((valid) => {
    if (!valid) return
    done()
  })
  console.log("关闭生成菜单")
}
</script>

<style lang="scss" scoped>
.coffee-me {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 9999;
}

@media (max-width: 768px) {
  .coffee-me {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }
}

// ── Drawer ──
:deep(.generate-drawer) {
  .el-drawer {
    max-width: calc(100vw - 32px);
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 18px;
}

.drawer-scroll {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// ── Config section (top) ──
.config-section {
  // Minimal wrapper
}

// ── Mode selector ──
.mode-radio-group {
  display: flex;
  width: 100%;

  .el-radio-button {
    flex: 1;
  }

  .el-radio-button__inner {
    width: 100%;
    justify-content: center;
  }
}

// ── Action buttons ──
.drawer-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;

  .action-btn {
    flex: 1;

    &--primary {
      font-weight: 600;
    }
  }
}

// ── Paper tags ──
.paper-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.paper-tag {
  margin: 0 !important;
}

// ── Responsive ──
@media (max-width: 480px) {
  .drawer-actions {
    flex-direction: column;
  }
}
</style>