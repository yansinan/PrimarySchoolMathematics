<template>
  <el-drawer v-model="currentVisible" size="50%" class="options-drawer" :before-close="handleClose">
  <template #header>
    <span class="text-base font-semibold">其他程序参数设置</span>
  </template>
    <ElForm ref="refForm" :model="formData" :rules="formRules">
      <ElFormItem label="题型设置">
        <el-radio-group v-model="formData.whereIsResult">
          <el-radio-button v-for="o in whereIsResultOptions" :label="o.key" :disabled="o.disabled">{{ o.label
          }}</el-radio-button>
        </el-radio-group>
      </ElFormItem>

      <ElFormItem label="启用括号()">
        <ElCheckbox v-model="formData.enableBrackets" />
      </ElFormItem>

      <ElFormItem label="加法设置">
        <el-radio-group v-model="formData.carry">
          <el-radio-button label="1">随机进位</el-radio-button>
          <el-radio-button label="2">加法进位</el-radio-button>
          <el-radio-button label="3">没有进位</el-radio-button>
        </el-radio-group>
      </ElFormItem>

      <el-form-item label="减法设置">
        <el-radio-group v-model="formData.abdication">
          <el-radio-button label="1">随机退位</el-radio-button>
          <el-radio-button label="2">减法退位</el-radio-button>
          <el-radio-button label="3">没有退位</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="除法设置">
        <el-radio-group v-model="formData.remainder">
          <el-radio-button v-for="o in remainderOptions" :label="o.key" :disabled="o.disabled">{{ o.label
          }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="解题方式">
        <el-radio-group v-model="formData.solution">
          <el-radio-button label="0">用口算解题</el-radio-button>
          <el-radio-button label="1">用竖式解题</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- 卷子数量 / 每行列数 / 文件名规则 / 标题 / 副标题 → 已搬到「生成卷子」对话框（仅卷子需要） -->


      <!-- ════════════════════════════════════════════════════════════════
           2026-11-26 隐藏（观察期一个月，2026-12-30 无回滚需求即整块删除）
           练习档位区：起点档位 / 挑战题 / 自动升档 / 升一档
           为什么：这些入口已迁到「准备开始」页的「本次练习设置」（默认折叠）。
                   出题抽屉再留一份就是两个入口改同一个设置，容易互相矛盾。
           恢复：把本注释整体去掉即可（块内原本的两行小注释已并入本说明）。
           删除时一并清掉：
             script：levelOpen / levelDraft / groupedLevels / currentLevelText /
                     overrideActive / applyLevelOverride / resetLevelOverride /
                     promoteOneLevel / nextLevel / challengeEnabled /
                     setChallengeEnabled / autoAdvanceOn / setAutoAdvance
             样式： 「练习档位（起点档位手动指定）」与
                    「练习档位：起点档位下拉 + 操作按钮」两段
             依赖： constants/difficulty 与
                    utils/store/{levelOverride,challengeSetting,autoAdvance}
                    （确认别处不再引用后再删 import）
           ════════════════════════════════════════════════════════════════
      <el-form-item>
        <el-collapse v-model="levelOpen" class="level-ratio">
          <el-collapse-item name="level">
            <template #title>
              <span class="level-ratio__title">
                练习档位
                <el-tag v-if="overrideActive" size="small" type="warning" effect="plain">
                  已手动指定
                </el-tag>
              </span>
            </template>
            <p class="level-ratio__hint">
              自适应练习默认按答题记录自动升档。孩子进度被跳过时（例如口诀没练完就到了多位数乘法），
              在这里把起点拉回指定档位即可。只改「从哪一档开始练」，不删答题史、不影响统计，
              之后仍按教材顺序逐档推进。改完在<strong>下次开始练习</strong>时生效。
            </p>
            <div class="level-ratio__row">
              <span class="level-ratio__label">当前实际档位</span>
              <el-tag size="small" effect="plain" class="level-pick__current">{{ currentLevelText }}</el-tag>
            </div>
            <div class="level-ratio__row">
              <span class="level-ratio__label">起点档位</span>
              <el-select
                v-model="levelDraft"
                clearable
                placeholder="自动（按练习记录计算）"
                size="small"
                class="level-pick"
                popper-class="level-pick__popper"
              >
                <el-option-group v-for="group in groupedLevels" :key="group.grade" :label="group.grade">
                  <el-option
                    v-for="lv in group.levels"
                    :key="lv.idx"
                    :label="`Lv.${lv.idx + 1} ${lv.label}`"
                    :value="lv.idx"
                  />
                </el-option-group>
              </el-select>
            </div>
            <div class="level-ratio__actions">
              <el-button size="small" type="primary" :disabled="levelDraft == null" @click="applyLevelOverride">
                应用起点档位
              </el-button>
              <el-button size="small" :disabled="!overrideActive" @click="resetLevelOverride">
                恢复自动
              </el-button>
            </div>

            <div class="level-ratio__row level-ratio__row--switch">
              <span class="level-ratio__label">挑战题（下一档）</span>
              <el-switch
                :model-value="challengeEnabled"
                size="small"
                @update:model-value="setChallengeEnabled"
              />
            </div>
            <p class="level-ratio__hint">
              默认关闭：本轮只出当前档位及以下的题。有些档位的前置知识孩子还没学到，
              上一档的题不是努力就能做出来的 —— 想加难度再在这里手动打开（每组约 15% 的下一档题）。
            </p>

            <div class="level-ratio__row level-ratio__row--switch">
              <span class="level-ratio__label">自动升档</span>
              <el-switch
                :model-value="autoAdvanceOn"
                size="small"
                @update:model-value="setAutoAdvance"
              />
            </div>
            <p class="level-ratio__hint">
              默认手动：练得再好也停在当前档位，孩子可以多练几轮；什么时候进下一档由你点下面的按钮决定。
              打开自动后恢复原行为（练够量 + 正确率达标就自动进下一档）。
            </p>
            <div class="level-ratio__actions">
              <el-button
                size="small"
                type="success"
                :disabled="nextLevel == null || autoAdvanceOn"
                @click="promoteOneLevel"
              >
                {{ nextLevel == null ? '已是最后一档' : `升一档：Lv.${nextLevel.idx + 1} ${nextLevel.label}` }}
              </el-button>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-form-item>

      -->

      <!-- 档位配比已搬到「准备开始」页的「本次练习设置 → 档位配比」 -->

    </ElForm>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { fileNameGeneratedRuleEnum } from '@/utils/enum.js';
import { DIFFICULTY_LEVELS } from '@/constants/difficulty';
import { usePracticeStore } from '@/stores/practice';
import {
  loadLevelCoefficients,
  saveLevelCoefficients,
  clearLevelCoefficients,
  COEF_MIN,
  COEF_MAX,
} from '@/utils/store/levelCoefficients';
import {
  loadLevelOverride,
  saveLevelOverride,
  clearLevelOverride,
} from '@/utils/store/levelOverride';
import {
  loadChallengeEnabled,
  saveChallengeEnabled,
} from '@/utils/store/challengeSetting';
import {
  loadAutoAdvance,
  saveAutoAdvance,
} from '@/utils/store/autoAdvance';
import { playSfx } from '@/utils/sound/sfx';

const fileNameGeneratedRuleOptions = computed(() => {
  return Object.entries(fileNameGeneratedRuleEnum).map(([, { key, text }]) => {
    return { key, label: text }
  })
})

const props = defineProps({
  visible: {
    type: Boolean
  },
  formulasFormData: {
    type: Object
  }
})

const emit = defineEmits(['update:visible', 'update:formulasFormData'])

const currentVisible = computed({
  get() {
    return props.visible
  },
  set(val) {
    emit('update:visible', val)
  }
})

const formData = computed({
  get() {
    return props.formulasFormData
  },
  set(val) {
    emit('update:formulasFormData', val)
  }
})

const formRules = ref({
  numberOfPapers: [
    { required: true, message: '请填写卷子数量' },
    { type: 'number', message: '请填写数字' }
  ],
  numberOfPagerColumns: [
    { required: true, message: '请填写卷子列数' },
    { type: 'number', message: '请填写数字' }
  ],
  paperTitle: [
    { required: true, message: '请填写卷子标题' }
  ],
  paperSubTitle: [
    { required: true, message: '请填写卷子副标题' }
  ]
})

const refForm = ref(null)

const whereIsResultOptions = computed(() => {
  // 题型设置为求算数项时不能有余数
  const disabled = formData.value.remainder == '3'
  return [
    { key: '0', label: "求结果", disabled: false },
    { key: '1', label: "求算数项", disabled }
  ]
})

const remainderOptions = computed(() => {
  // 题型设置为求算数项时不能有余数
  // 多步运算时不能有余数
  const disabled = formData.value.whereIsResult == '1' || formData.value.step > 1
  return [
    // 除法暂时只支持整除（答题键盘只能输一个数，有余数需要「商+余数」双输入）
    { key: '1', label: "随机余数（暂不支持）", disabled: true },
    { key: '2', label: "结果整除", disabled: false },
    { key: '3', label: "结果余数（暂不支持）", disabled: true }
  ]
})

/* ─── 档位配比 ───────────────────────────────────────────────
 * 系数表只存「非 1」的项，未配置的档位沿用引擎里的基准权重
 * (Math.pow(1.5, i))，所以默认空表时选题行为与改动前一致。
 */
const coefficients = ref(loadLevelCoefficients())
const ratioOpen = ref([])           // 默认收起，24 行不占屏

const groupedLevels = computed(() => {
  const groups = []
  DIFFICULTY_LEVELS.forEach((lv, idx) => {
    const grade = lv.grade || '未分组'
    let g = groups.find(x => x.grade === grade)
    if (!g) { g = { grade, levels: [] }; groups.push(g) }
    g.levels.push({ idx, label: lv.label })
  })
  return groups
})

const customCount = computed(() => Object.keys(coefficients.value).length)

/** 展示值：未配置显示 1.0 */
const coefOf = (idx) => {
  const v = coefficients.value[idx]
  return typeof v === 'number' ? v : 1
}

function setCoef(idx, val) {
  const num = Number(val)
  const next = { ...coefficients.value }
  if (!Number.isFinite(num)) return
  if (num === 1) delete next[idx]              // 回到默认 → 不留条目
  else next[idx] = Math.min(COEF_MAX, Math.max(COEF_MIN, num))
  coefficients.value = next
  saveLevelCoefficients(next)
}

function resetCoef() {
  clearLevelCoefficients()
  coefficients.value = {}
}

/* ─── 练习档位（起点档位手动指定）─────────────────────────────
 * 语义见 utils/store/levelOverride.js + services/abilityProfile.js#computeDifficultyIdx：
 * 只钉「从哪一档开始练」，不删答题史；应用后旧轮次不再参与升档阶梯。
 */
const practiceStore = usePracticeStore()
const levelOpen = ref([])
const levelOverride = ref(loadLevelOverride())          // 已保存的覆盖（null = 自动）
const overrideActive = computed(() => levelOverride.value != null)
const levelDraft = ref(levelOverride.value?.levelIdx ?? null)
const currentLevelIdx = ref(null)
const currentLevelText = computed(() => {
  if (currentLevelIdx.value == null) return '—'
  const lv = DIFFICULTY_LEVELS[currentLevelIdx.value]
  return lv ? `Lv.${currentLevelIdx.value + 1} ${lv.label}` : '—'
})

/** 读 DB 画像，显示「当前实际档位」（手动指定后就是指定档位） */
async function refreshCurrentLevel() {
  try {
    const { Profile } = await import('@/services/abilityProfile')
    const profile = await Profile.load()
    currentLevelIdx.value = profile.difficultyIdx
  } catch {
    currentLevelIdx.value = null
  }
}

// 每次打开设置抽屉同步一次：别处清过数据 / 改过档位时不会显示旧值
watch(() => props.visible, (visible) => {
  if (!visible) return
  levelOverride.value = loadLevelOverride()
  levelDraft.value = levelOverride.value?.levelIdx ?? null
  refreshCurrentLevel()
})

/** 应用手动起点档位 */
function applyLevelOverride() {
  const saved = saveLevelOverride(levelDraft.value)
  if (!saved) return
  levelOverride.value = saved
  practiceStore.bumpLevelOverride()
  refreshCurrentLevel()
  ElMessage.success(`起点档位已设为 Lv.${saved.levelIdx + 1} ${DIFFICULTY_LEVELS[saved.levelIdx].label}，下次开始练习生效`)
}

/** 清除手动指定，恢复自动升档 */
function resetLevelOverride() {
  clearLevelOverride()
  levelOverride.value = null
  levelDraft.value = null
  practiceStore.bumpLevelOverride()
  refreshCurrentLevel()
  ElMessage.info('已恢复自动升档（按练习记录计算）')
}

/* ─── 挑战题开关 ─────────────────────────────────────────────
 * 默认关闭：本轮只出当前档位及以下。家长按孩子学到哪一档手动决定是否加难度。
 */
const challengeEnabled = ref(loadChallengeEnabled())

function setChallengeEnabled(value) {
  const next = saveChallengeEnabled(!!value)
  challengeEnabled.value = next
  // 复用同一个刷新信号：准备界面「这次练什么」里的挑战题提示要跟着变
  practiceStore.bumpLevelOverride()
  ElMessage.info(next ? '已开启挑战题（每组约 15% 的下一档题）' : '已关闭挑战题（只出当前档及以下）')
}

/** 打开抽屉时同步一次挑战题设置 */
watch(() => props.visible, (visible) => {
  if (!visible) return
  challengeEnabled.value = loadChallengeEnabled()
})

/* ─── 升档方式（默认手动）──────────────────────────────────────
 * 手动：练得再好也停在当前档，家长点「升一档」才推进（= 改起点档位）。
 * 自动：恢复原行为（练够量 + 正确率达标 → 下一档）。
 */
const autoAdvanceOn = ref(loadAutoAdvance())

/** 下一档（用于「升一档」按钮文案；已到最后一档时为 null） */
const nextLevel = computed(() => {
  const from = currentLevelIdx.value
  if (from == null) return null
  const idx = Math.min(from + 1, DIFFICULTY_LEVELS.length - 1)
  if (idx <= from) return null
  return { idx, label: DIFFICULTY_LEVELS[idx].label }
})

function setAutoAdvance(value) {
  const next = saveAutoAdvance(!!value)
  autoAdvanceOn.value = next
  practiceStore.bumpLevelOverride()
  ElMessage.info(next
    ? '已改为自动升档：练够量且正确率达标就进下一档'
    : '已改为手动升档：练得再好也停在当前档，由你点「升一档」')
}

/** 手动升一档：把起点档位改成下一档（旧轮次不再参与阶梯，避免又被拉回去） */
function promoteOneLevel() {
  const target = nextLevel.value
  if (!target) return
  const saved = saveLevelOverride(target.idx)
  if (!saved) return
  levelOverride.value = saved
  levelDraft.value = target.idx
  practiceStore.bumpLevelOverride()
  refreshCurrentLevel()
  playSfx('levelup')
  ElMessage.success(`已升到 Lv.${target.idx + 1} ${target.label}，下次开始练习生效`)
}

/** 打开抽屉时同步一次升档方式 */
watch(() => props.visible, (visible) => {
  if (!visible) return
  autoAdvanceOn.value = loadAutoAdvance()
})

/** 多设备同步把配置写进来后，开着的设置抽屉也要刷新（档位 / 配比 / 挑战题） */
function handleSettingsApplied() {
  if (!props.visible) return
  levelOverride.value = loadLevelOverride()
  levelDraft.value = levelOverride.value?.levelIdx ?? null
  challengeEnabled.value = loadChallengeEnabled()
  refreshCurrentLevel()
}
onMounted(() => window.addEventListener('psm:settings-applied', handleSettingsApplied))
onUnmounted(() => window.removeEventListener('psm:settings-applied', handleSettingsApplied))

/**
 * 
 * @param {Function} done 
 */
const handleClose = (done) => {
  refForm?.value?.validate((valid) => {
    if (!valid) return

    done()
  })

}
</script>

<style lang="scss">
/*
 * 手机端：size="50%" 在窄屏只剩 ~195px，表单全被挤压 → 铺到几乎全宽。
 * 注意 el-drawer 把传入的 class 加在 .el-drawer 元素本身（不是 overlay），
 * 且该元素被 teleport，scoped 的 data-v 属性落不到它上面，所以这里必须用
 * 非 scoped 样式 + `.el-drawer.options-drawer` 双类定位。
 */
/* ─── 档位配比 ─────────────────────────────────── */
.level-ratio {
  width: 100%;
  border-top: none;
}

.level-ratio__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #303133;
}

.level-ratio__hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.level-ratio__group {
  margin-bottom: 10px;
}

.level-ratio__group-title {
  font-size: 12px;
  font-weight: 600;
  color: #176ebf;
  margin-bottom: 4px;
}

.level-ratio__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}

.level-ratio__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #4b5563;
  min-width: 0;
  flex: 1 1 auto;
}

.level-ratio__idx {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #eef4fb;
  color: #7f8c9b;
  font-size: 11px;
  flex: 0 0 auto;
}

.level-ratio__input {
  flex: 0 0 96px;
  width: 96px;
}

/* 练习档位：起点档位下拉 + 操作按钮 */
.level-pick {
  flex: 0 0 210px;
  width: 210px;
}

.level-pick__current {
  flex: 0 0 auto;
}

.level-ratio__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* 下拉是 teleport 到 body 的，popper 类要写非 scoped（见文件说明） */
.level-pick__popper {
  min-width: 240px;
}

.level-ratio__reset {
  margin-top: 4px;
}

@media (max-width: 480px) {
  .el-drawer.options-drawer {
    width: calc(100vw - 32px) !important;
  }

  .el-drawer.options-drawer .el-drawer__body {
    padding: 16px;
  }

  /*
   * 「生成的卷子数量 / 口算题列数」用 span=9 / span=8 并排，
   * 窄屏每列只有 ~120px，前置文字（7 个汉字）就把它撑爆 → 各占整行。
   * gutter 的负 margin 一并归零，否则整块仍会横向溢出。
   */
  .el-drawer.options-drawer .el-row {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .el-drawer.options-drawer .el-row > .el-col {
    flex: 0 0 100% !important;
    max-width: 100%;
    padding-left: 0 !important;
    padding-right: 0 !important;
  }

  .el-drawer.options-drawer .el-row > .el-col + .el-col {
    margin-top: 8px;
  }
}
</style>