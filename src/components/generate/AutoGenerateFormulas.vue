<template>
  <div>
    <ElFormItem label="几步运算?" class="step-row">
      <el-radio-group v-model="formData.step" @change="changeStep">
        <el-radio-button v-for="o in stepOptions" :label="o.key" :disabled="o.disabled">{{ o.label }}</el-radio-button>
      </el-radio-group>
    </ElFormItem>

    <!-- 运算符号：每一步一行（必须至少选一个） -->
    <template v-for="item, index in formData.formulaList" :key="`ops-${index}`">
      <ElFormItem v-if="item.operators" :label="`第${index}步运算符号选择`" :prop="`formulaList.${index}.operators`"
        :rules="requiredRule">
        <el-checkbox-group v-model="item.operators">
          <el-checkbox v-for="o in operatorOptions" :label="o.key">{{ o.label }}</el-checkbox>
        </el-checkbox-group>
      </ElFormItem>
    </template>

    <!-- 数字范围：算数项 1/2… 与运算结果共用一列表头，紧凑成 3 行 -->
    <ElFormItem class="range-table-item">
      <div class="range-table">
        <div class="range-table__head">
          <span class="range-table__col-name">数字范围</span>
          <span class="range-table__col">最小值</span>
          <span class="range-table__col">最大值</span>
        </div>
        <div v-for="item, index in formData.formulaList" :key="`range-${index}`" class="range-table__line">
          <span class="range-table__name">算数项 {{ index + 1 }}</span>
          <ElFormItem :prop="`formulaList.${index}.min`" :rules="requiredNumberRule" class="range-table__cell">
            <ElInput v-model.number="item.min" class="range-table__input" />
          </ElFormItem>
          <ElFormItem :prop="`formulaList.${index}.max`" :rules="requiredNumberRule" class="range-table__cell">
            <ElInput v-model.number="item.max" class="range-table__input" />
          </ElFormItem>
        </div>
        <div class="range-table__line">
          <span class="range-table__name">运算结果</span>
          <ElFormItem prop="resultMinValue"
            :rules="[{ required: true, message: '请填写运算结果最小值' }, { type: 'number', message: '请填写数字' }]"
            class="range-table__cell">
            <ElInput v-model.number="formData.resultMinValue" class="range-table__input" />
          </ElFormItem>
          <ElFormItem prop="resultMaxValue"
            :rules="[{ required: true, message: '请填写运算结果最大值' }, { type: 'number', message: '请填写数字' }]"
            class="range-table__cell">
            <ElInput v-model.number="formData.resultMaxValue" class="range-table__input" />
          </ElFormItem>
        </div>
      </div>
    </ElFormItem>

    <ElFormItem prop="numberOfFormulas"
      :rules="[{ required: true, message: '请填写口算题数量' }, { type: 'number', message: '请填写数字' }]">
      <ElRow :gutter="12">
        <ElCol :xs="24" :sm="14">
          <ElInput v-model.number="formData.numberOfFormulas">
            <template #prepend>口算题数量</template>
          </ElInput>
        </ElCol>
      </ElRow>
    </ElFormItem>

    <!-- 卷子数量 = 练习组数：打印是几份卷子，练习就是几组（每组结束自评一次） -->
    <ElFormItem prop="numberOfPapers"
      :rules="[{ required: true, message: '请填写卷子数量' }, { type: 'number', message: '请填写数字' }]">
      <ElRow :gutter="12">
        <ElCol :xs="24" :sm="14">
          <ElInput v-model.number="formData.numberOfPapers">
            <template #prepend>卷子数量</template>
            <template #append>份 / 组</template>
          </ElInput>
        </ElCol>
        <ElCol :xs="24" :sm="10" class="papers-hint-col">
          <span class="papers-hint">练习按卷子分组，每组结束做一次自评</span>
        </ElCol>
      </ElRow>
    </ElFormItem>

    <!-- ════════════════════════════════════════════════════════════════
         2026-11-26 隐藏（观察期一个月，2026-12-30 无回滚需求即整块删除）
         自适应练习量 targetMin / targetMax
         为什么：准备开始页的「本次练习设置 → 题量」已是同一个设置，这里再留一份就是
                 两个入口改同一份数据（psm_form_state + practiceStore.adaptiveTarget）。
         恢复：把本注释整体去掉即可。
         删除时一并清掉：targetRangeError / targetMinError / targetMaxError 相关的
                         computed、rules、以及 target-hint 样式。
         ════════════════════════════════════════════════════════════════
    <ElFormItem label="自适应练习量" :error="targetRangeError" class="practice-amount-row">
      <ElRow :gutter="12">
        <ElCol :xs="12" :sm="12">
          <ElFormItem
            prop="targetMin"
            :rules="targetMinRule"
            :error="targetMinError"
          >
            <ElInput
              v-model.number="formData.targetMin"
              size="default"
              placeholder="最少"
              :class="{ 'is-error': !!targetMinError }"
              @blur="runValidation"
            >
              <template #prepend>最少</template>
              <template #append>题</template>
            </ElInput>
          </ElFormItem>
        </ElCol>
        <ElCol :xs="12" :sm="12">
          <ElFormItem
            prop="targetMax"
            :rules="targetMaxRule"
            :error="targetMaxError"
          >
            <ElInput
              v-model.number="formData.targetMax"
              size="default"
              placeholder="最多"
              :class="{ 'is-error': !!targetMaxError }"
              @blur="runValidation"
            >
              <template #prepend>最多</template>
              <template #append>题</template>
            </ElInput>
          </ElFormItem>
        </ElCol>
        <ElCol :xs="24" :sm="24" class="target-hint-col">
          <span class="target-hint" :class="{ 'target-hint--error': !!targetRangeError }">
            {{ targetRangeError || '答好可提前结束' }}
          </span>
        </ElCol>
      </ElRow>
    </ElFormItem>
    -->

    <!-- 出题规则（原「其他设置」二级抽屉，现内联折叠；折叠时用 badge 显示当前选择） -->
    <ElFormItem class="rules-item">
      <div class="rules-card">
        <div class="rules-card__head" @click="rulesOpen = !rulesOpen">
          <svg class="rules-card__caret" :class="{ 'rules-card__caret--open': rulesOpen }" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span class="rules-card__title">出题规则</span>
          <span v-if="!rulesOpen" class="rules-card__badges">
            <span v-for="b in ruleBadges" :key="b" class="rules-badge">{{ b }}</span>
          </span>
        </div>

        <div v-if="rulesOpen" class="rules-card__body">
          <div class="rules-row">
            <span class="rules-row__label">题型</span>
            <el-radio-group v-model="formData.whereIsResult">
              <el-radio-button v-for="o in whereIsResultOptions" :label="o.key" :disabled="o.disabled">
                {{ o.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div class="rules-row">
            <span class="rules-row__label">括号</span>
            <el-checkbox v-model="formData.enableBrackets">启用括号 ( )</el-checkbox>
          </div>
          <div class="rules-row">
            <span class="rules-row__label">加法进位</span>
            <el-radio-group v-model="formData.carry">
              <el-radio-button label="1">随机进位</el-radio-button>
              <el-radio-button label="2">必须进位</el-radio-button>
              <el-radio-button label="3">不进位</el-radio-button>
            </el-radio-group>
          </div>
          <div class="rules-row">
            <span class="rules-row__label">减法退位</span>
            <el-radio-group v-model="formData.abdication">
              <el-radio-button label="1">随机退位</el-radio-button>
              <el-radio-button label="2">必须退位</el-radio-button>
              <el-radio-button label="3">不退位</el-radio-button>
            </el-radio-group>
          </div>
          <div class="rules-row">
            <span class="rules-row__label">除法</span>
            <el-radio-group v-model="formData.remainder">
              <el-radio-button v-for="o in remainderOptions" :label="o.key" :disabled="o.disabled">
                {{ o.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div class="rules-row">
            <span class="rules-row__label">解题方式</span>
            <el-radio-group v-model="formData.solution">
              <el-radio-button label="0">口算</el-radio-button>
              <el-radio-button label="1">竖式</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>
    </ElFormItem>

    <ElFormItem>
      <ElButton type="primary" @click="append">添加口算题</ElButton>
      <ElButton @click="clear">清空口算题</ElButton>
      <el-button type="success" @click="addConfiguration">将当前参数保存为配置</el-button>
    </ElFormItem>
  </div>
</template>

<script setup>
import { computed, ref, unref, toRaw, getCurrentInstance, watch } from 'vue';
import { v4 as uuidv4 } from "uuid";
import { cloneDeep } from "lodash";
import ConfigStorage from '@/utils/store/configStorage';
import { validateTargetRange, TARGET_LIMITS } from '@/utils/form/formDefaults';
import { usePracticeStore } from '@/stores/practice';

const { proxy } = getCurrentInstance()
const practiceStore = usePracticeStore()

/**
 * 自适应练习量一改就同步到 store。
 * 原来这个值只在诊断完成那一刻被 configSnapshot 快照一次，
 * 之后在抽屉里改了完全不生效（开始界面和引擎都还用旧值）。
 * 这里做成实时同步，开始界面 watch 到变化会立刻刷新。
 */
watch(
  () => [props.formulasFormData?.targetMin, props.formulasFormData?.targetMax],
  ([min, max]) => {
    practiceStore.setAdaptiveTarget(min, max)
  },
  { immediate: true }
)

const props = defineProps({
  formulasFormData: {
    type: Object
  },
  papers: {
    type: Array
  },
  refForm: {
    type: Object
  },
  configurations: Array
})

const emit = defineEmits(['update:formulasFormData', 'update:papers', 'add-configuration', 'valid-change'])

const formData = computed({
  get() {
    return props.formulasFormData
  },
  set(val) {
    emit('update:formulasFormData', val)
  }
})

const paperList = computed({
  get() {
    return props.papers
  },
  set(val) {
    emit('update:papers', val)
  }
})

const operatorOptions = [
  { key: 1, label: '+(加法)' },
  { key: 2, label: '-(减法)' },
  { key: 3, label: '×(乘法)' },
  { key: 4, label: '÷(除法)' }
]

const requiredRule = [
  { required: true, message: '此项为必填项' }
]
const requiredNumberRule = [
  { required: true, message: '此项为必填项' }, { type: 'number', message: '此项必须为数字' }
]

/* ============================================================
   targetMin/Max 实时校验（P4-2: 配置面板校验）
   ============================================================ */
// 校验失败时分别显示在 targetMin / targetMax 输入框下方
const targetMinError = ref('')
const targetMaxError = ref('')
const targetRangeError = ref('')  // 整体错误（区间关系）

/**
 * Element Plus rules 校验器：targetMin >= 1 且为整数
 */
const targetMinRule = [
  { required: true, message: '请填写最少答题数', trigger: 'blur' },
  { type: 'number', message: '请填写数字', trigger: 'blur' },
  {
    validator: (rule, value, callback) => {
      if (value < TARGET_LIMITS.min) {
        callback(new Error(`不能少于 ${TARGET_LIMITS.min} 题`))
      } else if (!Number.isInteger(value)) {
        callback(new Error('请填写整数'))
      } else {
        callback()
      }
    },
    trigger: 'blur',
  },
]

/**
 * Element Plus rules 校验器：targetMax <= 100 且为整数
 */
const targetMaxRule = [
  { required: true, message: '请填写最多答题数', trigger: 'blur' },
  { type: 'number', message: '请填写数字', trigger: 'blur' },
  {
    validator: (rule, value, callback) => {
      if (value > TARGET_LIMITS.max) {
        callback(new Error(`不能多于 ${TARGET_LIMITS.max} 题`))
      } else if (!Number.isInteger(value)) {
        callback(new Error('请填写整数'))
      } else {
        callback()
      }
    },
    trigger: 'blur',
  },
]

/**
 * 实时校验（focus/blur/输入时）— 复用 utils/formDefaults.validateTargetRange
 * 同时设置 targetMinError / targetMaxError / targetRangeError
 * 重命名为 runValidation 以避免与 import 的 validateTargetRange 同名
 */
function runValidation() {
  const result = validateTargetRange(formData.value.targetMin, formData.value.targetMax)
  if (result.valid) {
    targetMinError.value = ''
    targetMaxError.value = ''
    targetRangeError.value = ''
  } else {
    // 字段级错误优先显示在对应输入框
    if (result.field === 'targetMin' || result.field === 'both') {
      targetMinError.value = (formData.value.targetMin < TARGET_LIMITS.min) ? result.message : ''
    }
    if (result.field === 'targetMax' || result.field === 'both') {
      targetMaxError.value = (formData.value.targetMax > TARGET_LIMITS.max) ? result.message : ''
    }
    // 区间关系错误显示在提示栏
    if (result.field === 'both' && formData.value.targetMin >= TARGET_LIMITS.min && formData.value.targetMax <= TARGET_LIMITS.max) {
      targetRangeError.value = result.message
    } else {
      targetRangeError.value = ''
    }
  }
}

// 监听输入实时校验（输入完失焦时也通过 @blur 触发）
// 同时向上 emit valid-change 事件，让父组件禁用"生成"按钮
watch(
  () => [formData.value.targetMin, formData.value.targetMax],
  () => {
    runValidation()
    emit('valid-change', !targetMinError.value && !targetMaxError.value && !targetRangeError.value)
  },
  { immediate: true }
)


const stepOptions = computed(() => {
  // 多步运算时不能有余数
  const disabled = formData.value.remainder == '3'
  return [
    { key: '1', label: "一步运算", disabled: false },
    { key: '2', label: "两步运算", disabled },
    { key: '3', label: "三步运算", disabled }
  ]
})
const changeStep = (val) => {
  // 选择了新的几步运算后, 计算新值与旧值的差
  const difference = parseInt(val) - formData.value.formulaList.length + 1

  // 如果差是正数说明需要增加新的算数项,如果差是负数说明需要减去旧的算数项
  if (difference > 0) {
    for (let i = 1; i <= difference; i++) {
      formData.value.formulaList.push({ min: 1, max: 9, operators: [1] })
    }
  } else if (difference < 0) {
    formData.value.formulaList.splice(difference, Math.abs(difference))
  }
}

/** 出题规则折叠状态（原「其他设置」二级抽屉，现在内联） */
const rulesOpen = ref(false)

/** 折叠时用 badge 显示当前选择，不点开也知道配了什么 */
const ruleBadges = computed(() => {
  const f = formData.value || {}
  const whereIsResultText = f.whereIsResult == '1' ? '求算数项' : '求结果'
  const carryMap = { '1': '随机进位', '2': '必须进位', '3': '不进位' }
  const abdicationMap = { '1': '随机退位', '2': '必须退位', '3': '不退位' }
  const out = [whereIsResultText]
  if (f.enableBrackets) out.push('带括号')
  out.push(carryMap[f.carry] || '随机进位')
  out.push(abdicationMap[f.abdication] || '随机退位')
  out.push(f.solution == '1' ? '竖式解题' : '口算解题')
  return out
})

/** 题型选项：求算数项时不能有余数（沿用原 OptionsDrawer 规则） */
const whereIsResultOptions = computed(() => {
  const disabled = formData.value.remainder == '3'
  return [
    { key: '0', label: '求结果', disabled: false },
    { key: '1', label: '求算数项', disabled },
  ]
})

/** 除法选项：求算数项或多步运算时不能有余数（沿用原规则，当前只支持整除） */
const remainderOptions = computed(() => {
  const disabled = formData.value.whereIsResult == '1' || formData.value.step > 1
  return [
    { key: '1', label: '随机余数（暂不支持）', disabled: true },
    { key: '2', label: '结果整除', disabled },
    { key: '3', label: '结果余数（暂不支持）', disabled: true },
  ]
})

const append = () => {
  props.refForm?.validate((valid) => {
    if (!valid) return

    // 数量与范围守卫：题数不足 1 会让生成器空转/返回空，
    // 最小值大于最大值则根本无解（psm.js 现在是尝试上限兜底，但仍应在这里挡住）。
    const count = parseInt(formData.value.numberOfFormulas, 10)
    if (!Number.isFinite(count) || count < 1) {
      proxy.$message.error('口算题数量至少为 1')
      return
    }
    const badRange = (formData.value.formulaList || []).find(
      f => !Number.isFinite(+f.min) || !Number.isFinite(+f.max) || +f.min < 1 || +f.min > +f.max
    )
    if (badRange) {
      proxy.$message.error('算数项范围无效：最小值需 ≥ 1 且不能大于最大值')
      return
    }

    // 携带本组的 4 个「其他设置」字段（进位/退位/余数/括号），
    // 让不同题组可以有各自的进位要求 —— 试卷逻辑里这些本就是每题组独立的
    const {
      step, numberOfFormulas, whereIsResult, formulaList,
      resultMinValue, resultMaxValue,
      carry, abdication, remainder, enableBrackets,
    } = cloneDeep(toRaw(formData.value))
    paperList.value.push({
      step, numberOfFormulas, whereIsResult, formulaList,
      resultMinValue, resultMaxValue,
      carry, abdication, remainder, enableBrackets,
    })
  })
}

const clear = () => {
  paperList.value = []
}

const addConfiguration = () => {
  props.refForm?.validate((valid) => {
    if (!valid) return

    proxy.$messageBox.prompt('请给配置起个名字', '提示', {
      inputPattern: /^\S{1,10}$/,
      inputPlaceholder: '不能多于10个字符',
      inputErrorMessage: '配置名字不能为空且不能多于10个字符'
    }).then(({ value }) => {
      if (props.configurations?.length >= 10) {
        proxy.$message.error('最多只能保存10份配置！')
        return
      }

      const newId = uuidv4()
      new ConfigStorage().save(newId, value, toRaw(unref(formData)))
      proxy.$message.success('保存成功!')
      emit('add-configuration', newId)
    })
  })
}
</script>

<style lang="scss" scoped>
.target-hint-col {
  display: flex;
  align-items: center;
}

.target-hint {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  display: inline-block;
  padding: 0 0 0 4px;
}

@media (max-width: 768px) {
  .target-hint-col {
    margin-top: 6px;
    padding-left: 4px;
  }
  .target-hint {
    font-size: 11px;
  }
}

@media (max-width: 768px) {
  .target-hint-col {
    margin-top: 4px;
  }
}

// ── 手机端（窄屏）排版修正 ──
@media (max-width: 480px) {
  // ElRow 的 gutter 会生成左右 -6px 负 margin，窄屏下把抽屉撑出 6px 横向滚动
  :deep(.el-row) {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  // 几步运算：选项均分一行，「其他设置」整行独占
  .step-row :deep(.el-form-item__content) {
    display: block;
  }

  .step-row :deep(.el-radio-group) {
    display: flex;
    width: 100%;
  }

  .step-row :deep(.el-radio-button) {
    flex: 1;
  }

  .step-row :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 8px 2px;
  }

  .step-row :deep(.el-button) {
    margin: 8px 0 0 !important;
    width: 100%;
  }

  // 自适应练习量：两个「最少/最多」输入框原本并排（各 153px），
  // 前置文字吃掉 68px 后输入区只剩 9px，数字根本没法输入 → 改上下两行
  .practice-amount-row :deep(.el-col) {
    flex: 0 0 100% !important;
    max-width: 100%;
  }

  .practice-amount-row :deep(.el-form-item) {
    margin-bottom: 8px;
  }
}

/* ── 数字范围表格：算数项 1/2… 与运算结果共用一列表头 ── */
.range-table-item :deep(.el-form-item__content) {
  display: block;
}

.range-table {
  width: 100%;
  border: 1px solid #e6eef6;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.range-table__head,
.range-table__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px 92px;
  gap: 8px;
  align-items: center;
}

.range-table__head {
  padding: 7px 12px;
  background: #f6faff;
  border-bottom: 1px solid #e9f1fa;
  font-size: 11.5px;
  color: #8794a2;
}

.range-table__head .range-table__col {
  text-align: center;
}

.range-table__line {
  padding: 7px 12px;
  border-bottom: 1px solid #f2f7fc;
}

.range-table__line:last-child {
  border-bottom: none;
}

.range-table__name {
  font-size: 13px;
  color: #3f4d5a;
}

/* 单元格里的 ElFormItem 只留输入框，错误信息绝对定位不撑行高 */
.range-table__cell {
  margin-bottom: 0;
}

.range-table__cell :deep(.el-form-item__content) {
  margin-left: 0;
  line-height: normal;
}

.range-table__cell :deep(.el-form-item__error) {
  position: absolute;
  top: 100%;
  left: 0;
  font-size: 11px;
  padding-top: 1px;
  white-space: nowrap;
}

.range-table__input :deep(input) {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ── 出题规则（内联折叠，取代「其他设置」二级抽屉）── */
.rules-item :deep(.el-form-item__content) {
  display: block;
}

.rules-card {
  width: 100%;
  border: 1px solid #e6eef6;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.rules-card__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fbff;
  cursor: pointer;
  user-select: none;
}

.rules-card__caret {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  color: #9aa7b4;
  transition: transform 0.16s ease;
}

.rules-card__caret--open {
  transform: rotate(90deg);
}

.rules-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #1e3c5c;
  white-space: nowrap;
  flex: 0 0 auto;
}

.rules-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  flex: 1 1 auto;
  min-width: 0;
}

.rules-badge {
  font-size: 11px;
  color: #5b6b7a;
  background: #eef3f8;
  border-radius: 6px;
  padding: 2px 7px;
}

.rules-card__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid #eef3f8;
}

.rules-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.papers-hint-col {
  display: flex;
  align-items: center;
}

.papers-hint {
  font-size: 12px;
  color: #9aa7b4;
}

.rules-row__label {
  font-size: 12.5px;
  color: #7f8c9b;
  flex: 0 0 64px;
}

</style>