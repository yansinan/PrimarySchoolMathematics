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

      <el-form-item>
        <el-row :gutter="20">
          <el-col :span="9">
            <ElFormItem prop="numberOfPapers">
              <el-input v-model.number="formData.numberOfPapers">
                <template #prepend>生成的卷子数量</template>
              </el-input>
            </ElFormItem>
          </el-col>
          <el-col :span="8">
            <ElFormItem prop="numberOfPagerColumns">
              <el-input v-model.number="formData.numberOfPagerColumns">
                <template #prepend>口算题列数</template>
              </el-input>
            </ElFormItem>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item label="文件名生成规则" prop="fileNameGeneratedRule">
        <el-radio-group v-model="formData.fileNameGeneratedRule">
          <el-radio-button v-for="o in fileNameGeneratedRuleOptions" :label="o.key">{{ o.label }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item prop="paperTitle">
        <el-row :gutter="8">
          <el-col :span="24">
            <el-input v-model="formData.paperTitle">
              <template #prepend>卷子标题</template>
            </el-input>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item prop="paperSubTitle">
        <el-input v-model="formData.paperSubTitle">
          <template #prepend>卷子副标题</template>
        </el-input>
      </el-form-item>
    </ElForm>
  </el-drawer>
</template>

<script setup>
import { ref, computed } from 'vue';
import { fileNameGeneratedRuleEnum } from '@/utils/enum.js';

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