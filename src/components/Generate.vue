<template>
    <!-- 生成测试菜单：常显（出题/打印不依赖能力评估，只有「开始练习」需要画像） -->
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
          <!-- 开始练习需要能力评估画像；做题/打印卷子不受此限制 -->
          <el-button v-if="practiceStore.hasRealProfile" :disabled="!paperList.length || !formValid" type="primary" size="large" :loading="buttonLoading"
            @click="generateFormulas" class="action-btn action-btn--primary">
            <el-icon><CaretRight /></el-icon> 开始练习
          </el-button>
          <span v-else class="practice-locked-hint">先做完能力评估才能这里开练（出题和打印卷子可以直接用）</span>
        </div>
      </div>
    </el-drawer>
</template>

<script setup>
import { ref, onMounted, onUnmounted, unref, toRaw, getCurrentInstance, computed, watch } from 'vue';
import { useRouter } from "vue-router";
import { CustomFormulas, AutoGenerateFormulas, ConfigurationList } from "@/components/generate";
import ConfigStorage from "@/utils/store/configStorage";
import { fileNameGeneratedRuleEnum } from '@/utils/enum';
import { usePracticeStore } from '@/stores/practice';
import { createFormulasGenerator } from '@/utils/paperGenerator';
// 表单默认值（17 字段统一来源）
import { DEFAULT_FORM_DATA, applyConfigToFormData, buildPaperDescriptionList } from '@/utils/form/formDefaults';
import { loadFormState, saveFormState } from '@/utils/store/formPersistence';
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

// 上次保存的出题设置（题数、练习量、进位/退位、题型…）
const savedFormState = loadFormState()

const formData = ref(savedFormState
  ? { ...DEFAULT_FORM_DATA, ...savedFormState.formData }
  : { ...DEFAULT_FORM_DATA })

const configurations = ref([])

onMounted(async () => {
  if (import.meta.env.DEV) console.log('少年，我看你骨骼精奇，是万中无一的编程奇才，有个程序员大佬qq群[217840699]你加下吧!维护世界和平就靠你了')
  document.title = '小学数学口算题 | Primary School Mathematics'

  refreshConfiguration()

  // 只在「没有保存过设置」时才套用默认配置行。
  // 否则会把用户上次改的题数/练习量覆盖回默认值 —— 这正是「设置没保存」的直接原因。
  if (!savedFormState) {
    const { data: config } = configurations.value[0] // todo
    // 用 applyConfigToFormData 替代 19 行手写赋值（含 targetMin/Max）
    applyConfigToFormData(formData.value, config, { includeAdaptive: true })
  }
})

// 题组里每组的题数存在 paperList 里，只存 formData 修不好「题组题数不保存」
const paperList = ref(
  savedFormState?.paperList?.length
    ? savedFormState.paperList.map(p => ({ ...p }))
    : []
)
const paperDescriptionList = computed(() => buildPaperDescriptionList(paperList.value))

/**
 * 表单任何改动都自动落盘（debounce 在 saveFormState 内部）。
 * 用户改完设置不需要点「保存配置」，刷新/重开浏览器后仍是他自己的设置。
 */
watch(
  [formData, paperList],
  () => saveFormState(toRaw(unref(formData)), toRaw(unref(paperList))),
  { deep: true }
)

/**
 * 多设备同步把配置写进 localStorage 后（psm:settings-applied），
 * 若出题抽屉没开着，就把表单换成最新配置；开着时不打断正在编辑的内容
 * （下次打开抽屉会读到新值）。
 */
function handleSettingsApplied() {
  if (practiceStore.generateDrawerVisible) return
  const state = loadFormState()
  if (!state) return
  formData.value = { ...DEFAULT_FORM_DATA, ...state.formData }
  paperList.value = state.paperList.map(p => ({ ...p }))
}
onMounted(() => window.addEventListener('psm:settings-applied', handleSettingsApplied))
onUnmounted(() => window.removeEventListener('psm:settings-applied', handleSettingsApplied))

const activeConfigurationId = ref('1')
const refreshConfiguration = () => {
  configurations.value = new ConfigStorage().loadAll()
}
const addConfiguration = (newId) => {
  activeConfigurationId.value = newId
  refreshConfiguration()
}
const selectedConfiguration = (configuration) => {
  if (import.meta.env.DEV) console.log(configuration);

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
}

const buttonLoading = ref(false)

// 生成卷子：生成试卷数据并跳转 /print 打印页
const generate = () => {
  const numberOfFormulas = paperList.value.reduce((prev, cur) => prev + parseInt(cur.numberOfFormulas), 0)
  if (numberOfFormulas * formData.value.numberOfPapers > 1000) {
    proxy.$message.error('题目总数不能超过1000题!')
    return
  }
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

  // 守卫：题数为 0 会让生成器空转（psm.js generate 里曾是 while(true)），直接挡在入口
  if (!(numberOfFormulas >= 1)) {
    proxy.$message.error('请先添加至少 1 道口算题')
    return
  }
  if (paperList.value.some(p => !(parseInt(p.numberOfFormulas, 10) >= 1))) {
    proxy.$message.error('存在题数为 0 的题组，请修改后再开始练习')
    return
  }

  const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
  const listFormulas = papers.reduce((prev, cur) => {
    prev.push(...cur.formulas)
    return prev
  }, []);

  // 配置合法但生成不出题（范围与进位/退位要求互斥）：必须明确报错，
  // 否则题单为空 → 页面停在「正在生成…」加载态，用户完全不知道发生了什么
  if (listFormulas.length === 0) {
    proxy.$message.error('当前设置有冲突，一题也生成不出来。请放宽数字范围，或改掉「必须进位/必须退位」这类限制')
    return
  }
  
  // 测试计算结果
  const listResult = listFormulas.reduce((prev, cur) => {
    const result = EquationSolver.solve(cur);
    prev.push({
      equation: cur,
      solution: result,
    })
    return prev;
  }, []);  

  // 新一轮手动练习：清上一轮状态并换新的 practiceSessionId（见 stores/practice.js#resetPracticeSession）。
  // 必须在 setConfigSnapshot 之前 —— resetPracticeSession 会把 configSnapshot 清空。
  practiceStore.resetPracticeSession()
  // Capture config snapshot for stats tracking
  practiceStore.setConfigSnapshot(toRaw(unref(formData)))

  // Manual generation → switch to practice mode
  practiceStore.setPhase('practice')
  // 标记题单来源：手动题单在答题过程中不允许被自适应引擎改写
  practiceStore.setListSource('manual')
  // 手动出题直接进题，不展示「准备开始」界面
  practiceStore.setReadyToStart(false)

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
  if (import.meta.env.DEV) console.log("关闭生成菜单")
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

  .practice-locked-hint {
    align-self: center;
    font-size: 13px;
    line-height: 1.4;
    color: #909399;
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
  // 手机：按钮竖排并吸底，不必滚到底部才能点到「生成卷子」
  .drawer-actions {
    flex-direction: column;
    position: sticky;
    bottom: 0;
    padding: 8px 0 0;
    background: var(--el-bg-color, #fff);
  }

  // 屏幕窄，收一点内边距把宽度还给内容
  :deep(.generate-drawer) {
    .el-drawer__body {
      padding: 16px;
    }

    .el-drawer__close-btn {
      padding: 8px;
    }
  }
}
</style>