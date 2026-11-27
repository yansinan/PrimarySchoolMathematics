<template>
  <div class="cmf">
    <section class="block-card">
      <header class="block-card__head">手动输入题目</header>
      <div class="block-card__body">
        <p class="cmf-hint">
          可以手动添加题目生成进试卷，比如之前的错题和需要加强的题目。乘法除法填写时可以用
          <ElTag size="small">*</ElTag> 和 <ElTag size="small">/</ElTag> 代替，程序会自动替换。不需要填写等号。
        </p>

        <ElFormItem v-for="item, index in formData.customFormulaList"
          :key="`cf-${index}`" :prop="`customFormulaList.${index}.formula`" :rules="requiredRule" class="cmf-item">
          <div class="cmf-row">
            <ElInput ref="refCustomFormulaInputs" v-model="item.formula" placeholder="例: 20*10"
              @keydown.enter.prevent="add(index)" />
            <el-icon v-show="formData.customFormulaList.length == (index + 1)" @click="add(index)">
              <CirclePlusFilled />
            </el-icon>
            <el-icon v-show="formData.customFormulaList.length > 1" @click="remove(index)">
              <RemoveFilled />
            </el-icon>
          </div>
        </ElFormItem>
      </div>
    </section>

    <!-- 配置完成后的下一步：加入卷子 -->
    <div class="add-row">
      <el-button type="primary" class="add-row__btn" @click="append">添加口算题（{{ validCount }} 题）</el-button>
      <el-button class="add-row__btn" @click="clear">清空口算题</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';

const props = defineProps({
  formulasFormData: {
    type: Object
  },
  papers: {
    type: Array
  },
  refForm: {
    type: Object
  }
})

const emit = defineEmits(['update:formulasFormData', 'update:papers'])

const formData = computed({
  get() {
    return props.formulasFormData
  },
  set(val) {
    emit('update:formulasFormData', val)
  }
})

const requiredRule = [
  { required: true, message: '此项为必填项' }
]

const paperList = computed({
  get() {
    return props.papers
  },
  set(val) {
    emit('update:papers', val)
  }
})

const refCustomFormulaInputs = ref(null)
const add = (index) => {
  props.refForm?.validate((valid) => {
    if (!valid) return

    formData.value.customFormulaList.push({ formula: '' })
    nextTick(() => {
      refCustomFormulaInputs.value[index + 1].focus()
    })
  })
  return
}

const remove = (index) => {
  formData.value.customFormulaList.splice(index, 1)
}

/** 当前填好、会被加进题组的题目数 */
const validCount = computed(() =>
  (props.formulasFormData?.customFormulaList || []).filter(i => String(i.formula || '').trim()).length
)

const append = () => {
  const customFormulaList = formData.value.customFormulaList.reduce((prev, cur) => {
    if (cur.formula) {
      let formula = cur.formula.replace('*', 'x').replace('/', '÷').trim() + '='
      formula = formula.replace(/\s+/g, '');
      prev.push({ formula })
    }
    return prev
  }, [])

  paperList.value.push({ customFormulaList, numberOfFormulas: customFormulaList.length })
}

const clear = () => {
  paperList.value = []
}
</script>

<style lang="scss" scoped>
i {
  @apply text-xl ml-1;
}
</style>

<style scoped lang="scss">
/* 与出题抽屉其它区块同一套卡片规范 */
.block-card {
  border: 1px solid #e6eef6;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
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

.cmf-hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #8794a2;
}

.cmf-item {
  margin-bottom: 10px;
}

.cmf-item :deep(.el-form-item__content) {
  display: block;
  margin-left: 0;
}

.cmf-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.add-row__btn {
  flex: 1 1 0;
  margin-left: 0;
}
</style>
