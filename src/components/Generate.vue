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
        <!-- ── Form ── -->
        <ElForm ref="refForm" :model="formData" label-position="top" size="default">
          <ElFormItem label="题目来源">
            <el-radio-group v-model="formData.generateMode" class="mode-radio-group">
              <el-radio-button label="3">错题库</el-radio-button>
              <el-radio-button label="1">自动生成</el-radio-button>
              <el-radio-button label="2">手动添加</el-radio-button>
            </el-radio-group>
          </ElFormItem>

          <!-- 自动生成 -->
          <template v-if="formData.generateMode == '1'">
            <!-- 「已保存的配置」是自动生成这套参数的快照，只在这一页显示 -->
            <section class="block-card config-section">
              <header class="block-card__head">已保存的配置</header>
              <div class="block-card__body config-section__body">
                <ConfigurationList v-model:active-index="activeConfigurationId" :configurations="configurations"
                  @removed="refreshConfiguration" @selected="selectedConfiguration" />
              </div>
            </section>
            <AutoGenerateFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm"
              :configurations="configurations" @add-configuration="addConfiguration" @valid-change="(v) => formValid = v" />
          </template>
          <!-- 错题库 -->
          <template v-if="formData.generateMode == '3'">
            <WrongBookTab @add-to-practice="addWrongBookPaper" @clear-papers="clearAllPapers" />
          </template>
          <!-- 手动输入 -->
          <template v-if="formData.generateMode == '2'">
            <CustomFormulas v-model:formulas-form-data="formData" v-model:papers="paperList" :ref-form="refForm" />
          </template>

          <template v-if="paperDescriptionList && paperDescriptionList.length">
            <ElFormItem label="当前口算题包含的内容">
              <div class="paper-tags">
                <ElTag
                  v-for="(desc, i) in paperDescriptionList"
                  :key="`paper-${i}`"
                  class="paper-tag"
                  closable
                  :title="`删除第 ${i + 1} 个题组`"
                  @close="removePaper(i)"
                >{{ desc }}</ElTag>
              </div>
            </ElFormItem>
          </template>
        </ElForm>

        <div class="drawer-actions-wrap">
          <div class="drawer-actions">
          <el-button :disabled="!paperList.length" size="large" :loading="buttonLoading"
            @click="openPaperDialog" class="action-btn">
            <el-icon><Document /></el-icon> 打印练习卷
          </el-button>
          <!-- 开始练习需要能力评估画像；做题/打印卷子不受此限制 -->
          <el-button v-if="practiceStore.hasRealProfile" :disabled="!paperList.length || !formValid" type="primary" size="large" :loading="buttonLoading"
            @click="generateFormulas" class="action-btn action-btn--primary">
            <el-icon><CaretRight /></el-icon> 开始互动练习
          </el-button>
            <span v-else class="practice-locked-hint">先做完能力评估才能这里开练（出题和打印卷子可以直接用）</span>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 生成卷子：卷子独有的配置只在这里出现，抽屉里全是「自定义练习 + 卷子」共用项 -->
    <el-dialog v-model="paperDialogVisible" title="生成卷子" width="min(520px, calc(100vw - 32px))"
      append-to-body class="paper-dialog">
      <el-form label-width="96px" class="paper-dialog__form" @submit.prevent>
        <el-form-item label="每行列数">
          <el-input-number v-model="formData.numberOfPagerColumns" :min="1" :max="6" :step="1"
            controls-position="right" class="paper-dialog__num" />
          <span class="paper-dialog__hint">一行放几道题</span>
        </el-form-item>
        <el-form-item label="文件名规则">
          <el-radio-group v-model="formData.fileNameGeneratedRule">
            <el-radio-button v-for="o in fileNameRuleOptions" :key="o.key" :label="o.key">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="卷子标题">
          <el-input v-model="formData.paperTitle" placeholder="留空则不打印标题" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="formData.paperSubTitle" placeholder="例如：2026-11-26 · 二年级上" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="paperDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="buttonLoading" @click="confirmGeneratePaper">生成卷子</el-button>
      </template>
    </el-dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted, unref, toRaw, getCurrentInstance, computed, watch } from 'vue';
import { useRouter } from "vue-router";
import { CustomFormulas, AutoGenerateFormulas, ConfigurationList, WrongBookTab } from "@/components/generate";
import ConfigStorage from "@/utils/store/configStorage";
import { fileNameGeneratedRuleEnum } from '@/utils/enum';
import { usePracticeStore } from '@/stores/practice';
import { createFormulasGenerator } from '@/utils/paperGenerator';
// 表单默认值（17 字段统一来源）
import { DEFAULT_FORM_DATA, applyConfigToFormData, buildPaperDescriptionList } from '@/utils/form/formDefaults';
import { loadFormState, saveFormState } from '@/utils/store/formPersistence';
import { useSnapshotSync } from '@/composables/useSnapshotSync';
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
  // 「已保存的配置」也在同步白名单里：远端应用后要刷新列表，
  // 否则界面上还是旧的几条（配置本身已写进 localStorage）
  refreshConfiguration()
  if (practiceStore.generateDrawerVisible) return
  const state = loadFormState()
  if (!state) return
  formData.value = { ...DEFAULT_FORM_DATA, ...state.formData }
  paperList.value = state.paperList.map(p => ({ ...p }))
}
onMounted(() => window.addEventListener('psm:settings-applied', handleSettingsApplied))
onUnmounted(() => window.removeEventListener('psm:settings-applied', handleSettingsApplied))

/**
 * 准备开始页也能改「练习量」。抽屉打开时把 targetMin/Max 同步成已保存的值，
 * 否则抽屉里还拿着挂载时的旧值，用户改别的设置时会把准备页的改动覆盖掉。
 */
watch(
  () => practiceStore.generateDrawerVisible,
  (visible) => {
    if (!visible) return
    const state = loadFormState()
    const saved = state?.formData
    if (!saved) return
    if (saved.targetMin != null) formData.value.targetMin = saved.targetMin
    if (saved.targetMax != null) formData.value.targetMax = saved.targetMax
  }
)

const activeConfigurationId = ref('1')
const refreshConfiguration = () => {
  configurations.value = new ConfigStorage().loadAll()
}
const addConfiguration = (newId) => {
  activeConfigurationId.value = newId
  refreshConfiguration()
  // 配置已写进 localStorage（customer-config），这里立刻标记待同步，
  // 不必等 2 分钟的定时快照
  useSnapshotSync().markDirty(0)
}
const selectedConfiguration = (configuration) => {
  const { data: config } = configuration || {}
  if (!config) return
  // 配置里存的是「自动生成」那一套参数：应用前先切回该分页，
  // 否则停在错题库 / 手动添加页时，用户看不到参数被载入（dr 反馈）
  formData.value.generateMode = '1'
  applyConfigToFormData(formData.value, config, { includeAdaptive: true })
  proxy.$message.success(`已载入配置「${configuration.name || ''}」`)
}

const buttonLoading = ref(false)

/** 「生成卷子」对话框：卷子独有配置（数量/列数/文件名规则/标题/副标题）都在这里 */
const paperDialogVisible = ref(false)
const fileNameRuleOptions = computed(() =>
  Object.entries(fileNameGeneratedRuleEnum).map(([, { key, text }]) => ({ key, label: text }))
)

/** 打开对话框前先挡掉明显的非法输入 */
function openPaperDialog() {
  const numberOfFormulas = paperList.value.reduce((prev, cur) => prev + parseInt(cur.numberOfFormulas, 10), 0)
  if (!(numberOfFormulas >= 1)) {
    proxy.$message.error('请先添加至少 1 道口算题')
    return
  }
  if (numberOfFormulas * (formData.value.numberOfPapers || 1) > 1000) {
    proxy.$message.error('题目总数不能超过1000题!')
    return
  }
  paperDialogVisible.value = true
}

/** 对话框确认：关掉对话框再走原有生成流程（校验与报错都在 generate 里） */
function confirmGeneratePaper() {
  paperDialogVisible.value = false
  generate()
}

// 生成卷子：生成试卷数据并跳转 /print 打印页
const generate = () => {
  const numberOfFormulas = paperList.value.reduce((prev, cur) => prev + parseInt(cur.numberOfFormulas), 0)
  if (numberOfFormulas * formData.value.numberOfPapers > 1000) {
    proxy.$message.error('题目总数不能超过1000题!')
    return
  }
  const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
  const fileName = formData.value.fileNameGeneratedRule == fileNameGeneratedRuleEnum.baseOnTitleAndIndex.key
    ? formData.value.paperTitle
    : ""
  const key = `print_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // 数据走 localStorage：新窗口与当前标签页共享，sessionStorage 不行（按标签页隔离）
  try { localStorage.setItem(key, JSON.stringify(papers)) } catch { /* 存不下 → 回退下面的同页跳转 */ }

  const target = router.resolve({ path: '/print', query: { fileName, key } }).href

  /**
   * 打印页开在新窗口里，当前页保持在配置界面（生成后想再调参数不用退回来）。
   *
   * 为什么不用 noopener：带 noopener 时 window.open 返回 null，无法区分
   * 「被拦截」和「已成功打开」，会误触发同页回退。这里改为打开后手动清 opener。
   */
  let win = null
  try {
    win = window.open(target, '_blank')
  } catch { /* 被拦截 / 环境不允许 → 走同页 */ }

  if (win) {
    try { win.opener = null } catch { /* 跨源限制，忽略 */ }
    paperList.value = []
  } else {
    // 弹窗被拦截（常见于移动端浏览器）→ 退回原来的同页跳转
    proxy.$message.info('浏览器拦截了新窗口，改为当前页打开打印预览')
    router.push({ path: '/print', query: { fileName, key } })
    paperList.value = []
  }
}

/** 清空所有题组（错题库页的「清空口算题」按钮） */
function clearAllPapers() {
  if (!paperList.value.length) {
    proxy.$message.info('当前还没有题组')
    return
  }
  paperList.value = []
  proxy.$message.success('已清空全部题组')
}

/**
 * 错题库「加入练习」：把选中的题变成一条题组，和自动生成/手输的题组混排
 * 数据结构与「手动添加」一致（customFormulaList），打印与练习都走同一条链路。
 * @param {{ kind: string, customFormulaList: Array<{formula:string}>, numberOfFormulas: number }} paper
 */
function addWrongBookPaper(paper) {
  if (!paper?.customFormulaList?.length) return
  paperList.value = [...paperList.value, { ...paper }]
  proxy.$message.success(`已加入 ${paper.numberOfFormulas} 道错题，可继续添加其它题组`)
}

/**
 * 删除单个题组
 * 题组与题目列表一一对应，删掉后其余题组的描述会重新编号（索引即来源）。
 * @param {number} index
 */
function removePaper(index) {
  if (index < 0 || index >= paperList.value.length) return
  const next = paperList.value.slice()
  next.splice(index, 1)
  paperList.value = next
  // 删到空 → 提示一下，避免误以为还有题组
  if (!next.length) proxy.$message.info('题组已清空，请重新添加口算题')
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
  // mode:'manual' 是统计口径的显式标记：自定义练习分组后会写 evaluations，
  // 没有这个标记的话 PracticeSession 会把该轮误判成「自适应」（见 18-PLAN R1）。
  practiceStore.setConfigSnapshot({ ...toRaw(unref(formData)), mode: 'manual' })

  // Manual generation → switch to practice mode
  practiceStore.setPhase('practice')
  // 标记题单来源：手动题单在答题过程中不允许被自适应引擎改写
  practiceStore.setListSource('manual')
  // 手动出题直接进题，不展示「准备开始」界面
  practiceStore.setReadyToStart(false)

  // 一张卷子 = 一组练习：把每张卷子的题数交给练习页做组边界
  practiceStore.setManualGroupPlan(papers.map(p => p.formulas?.length || 0))
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

// ── 已保存的配置：与出题抽屉其它区块同一套卡片样式 ──
.block-card {
  border: 1px solid #e6eef6;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  margin-bottom: 12px;
}

.block-card__head {
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #1e3c5c;
  background: #f8fbfe;
  border-bottom: 1px solid #eef3f8;
}

.block-card__body {
  padding: 12px;
}

.config-section__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// ── Mode selector ──
.mode-radio-group {
  display: flex;
  width: 100%;
  gap: 0;

  /* 两个选项做成一个整体分段控件：无间隙、首尾圆角 */
  .el-radio-button {
    flex: 1 1 0;
    min-width: 0;
  }

  /* __inner 在子组件内部，scoped 样式够不到，必须 :deep() */
  :deep(.el-radio-button__inner) {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0;
    margin-left: -1px;      /* 边框重叠，避免 1px 缝 */
  }

  :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-radius: 8px 0 0 8px;
    margin-left: 0;
  }

  :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 0 8px 8px 0;
  }
}

// ── Action buttons（与上方配置区分开：分隔线 + 浅底 + 同一左右边界）──
.drawer-actions-wrap {
  margin-top: 14px;
  padding: 12px 0 2px;
  border-top: 1px solid #dbe7f4;
  background: linear-gradient(180deg, #fbfdff 0%, #f5faff 100%);
  border-radius: 0 0 10px 10px;
}

.drawer-actions {
  display: flex;
  gap: 12px;

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

/* ── 生成卷子对话框：卷子独有配置 ── */
.paper-dialog__form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.paper-dialog__num {
  width: 108px;
}

.paper-dialog__hint {
  margin-left: 10px;
  font-size: 12px;
  color: #9aa7b4;
}
</style>