<template>
  <div>
    <ElFormItem label="几步运算?">
      <el-radio-group v-model="formData.step" @change="changeStep">
        <el-radio-button v-for="o in stepOptions" :label="o.key" :disabled="o.disabled">{{ o.label }}</el-radio-button>
      </el-radio-group>
      <ElButton type="primary" style="margin-left: 6px;" @click="openOptionsDrawer">其他设置</ElButton>
    </ElFormItem>

    <template v-for="item, index in formData.formulaList">
      <ElFormItem v-if="item.operators" :label="`第${index}步运算符号选择`" :prop="`formulaList.${index}.operators`"
        :rules="requiredRule">
        <el-checkbox-group v-model="item.operators">
          <el-checkbox v-for="o in operatorOptions" :label="o.key">{{ o.label }}</el-checkbox>
        </el-checkbox-group>
      </ElFormItem>

      <ElFormItem :label="`算数项${index + 1}`">
        <ElRow :gutter="12">
          <ElCol :xs="24" :sm="8">
            <ElFormItem :prop="`formulaList.${index}.min`" :rules="requiredNumberRule">
              <ElInput v-model.number="item.min">
                <template #prepend>最小值</template>
              </ElInput>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :sm="8">
            <ElFormItem :prop="`formulaList.${index}.max`" :rules="requiredNumberRule">
              <ElInput v-model.number="item.max">
                <template #prepend>最大值</template>
              </ElInput>
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElFormItem>
    </template>

    <ElFormItem label="运算结果">
      <ElRow :gutter="12">
        <ElCol :xs="24" :sm="8">
          <ElFormItem prop="resultMinValue"
            :rules="[{ required: true, message: '请填写运算结果最小值' }, { type: 'number', message: '请填写数字' }]">
            <ElInput v-model.number="formData.resultMinValue">
              <template #prepend>最小值</template>
            </ElInput>
          </ElFormItem>
        </ElCol>
        <ElCol :xs="24" :sm="8">
          <ElFormItem prop="resultMaxValue"
            :rules="[{ required: true, message: '请填写运算结果最大值' }, { type: 'number', message: '请填写数字' }]">
            <ElInput v-model.number="formData.resultMaxValue">
              <template #prepend>最大值</template>
            </ElInput>
          </ElFormItem>
        </ElCol>
      </ElRow>
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

    <ElFormItem label="自适应练习量" :error="targetRangeError">
      <ElRow :gutter="12">
        <ElCol :xs="12" :sm="8">
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
        <ElCol :xs="12" :sm="8">
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
        <ElCol :xs="24" :sm="8" class="target-hint-col">
          <span class="target-hint" :class="{ 'target-hint--error': !!targetRangeError }">
            {{ targetRangeError || '答好可提前结束' }}
          </span>
        </ElCol>
      </ElRow>
    </ElFormItem>

    <ElFormItem>
      <ElButton type="primary" @click="append">添加口算题</ElButton>
      <ElButton @click="clear">清空口算题</ElButton>
      <el-button type="success" @click="addConfiguration">将当前参数保存为配置</el-button>
    </ElFormItem>

    <OptionsDrawer v-model:visible="optionsDrawerVisible" v-model:formulasFormData="formData" />
  </div>
</template>

<script setup>
import { computed, ref, unref, toRaw, getCurrentInstance, watch } from 'vue';
import { v4 as uuidv4 } from "uuid";
import { cloneDeep } from "lodash";
import ConfigStorage from '@/utils/configStorage';
import { OptionsDrawer } from "@/components/home";
import { validateTargetRange, TARGET_LIMITS } from '@/utils/formDefaults';

const { proxy } = getCurrentInstance()

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

const optionsDrawerVisible = ref(false)
const openOptionsDrawer = () => {
  optionsDrawerVisible.value = true
}

const append = () => {
  props.refForm?.validate((valid) => {
    if (!valid) return

    const { step, numberOfFormulas, whereIsResult, formulaList, resultMinValue, resultMaxValue } = cloneDeep(toRaw(formData.value))
    paperList.value.push({
      step, numberOfFormulas, whereIsResult, formulaList, resultMinValue, resultMaxValue
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
</style>