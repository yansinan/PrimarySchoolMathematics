<template>
  <div>
    <p class="config-heading">已保存的配置</p>
    <ElCard v-for="c in configurations" :class="{ active: c.id == activeConfigurationId }" class="mb-3" :shadow="'hover'"
      @click="select(c.id)">
      <div class="flex justify-between items-center cursor-pointer">
        <!-- 是否选中 -->
        <p class="text-sm">{{ c.name }}</p>
        <el-icon v-if="configurations && configurations.length > 1" @click.stop="remove(c.id)">
          <CircleCloseFilled />
        </el-icon>
      </div>
    </ElCard>
  </div>
</template>

<script setup>
import { getCurrentInstance, computed, watch } from 'vue';
import ConfigStorage from '@/utils/configStorage';
import { cloneDeep } from 'lodash';

const { proxy } = getCurrentInstance()

const props = defineProps({
  activeIndex: {
    type: String,
    default: '1'
  },
  configurations: Array
})

const emits = defineEmits(['removed', 'selected', 'update:activeIndex'])

const activeConfigurationId = computed({
  get() {
    return props.activeIndex
  },
  set(val) {
    emits('update:activeIndex', val)
  }
})

const remove = async (id) => {
  try {
    await proxy.$messageBox.confirm('确定删除吗? ', '提示', { type: 'warning' })
    new ConfigStorage().remove(id)
    proxy.$message.success('删除成功!')
    // 如果删除的配置正在被使用，则自动选择第一个
    if (activeConfigurationId.value == id) {
      activeConfigurationId.value = props.configurations[0].id
    }
    emits('removed')
  } catch (error) {

  }
}

const select = async (id) => {
  try {
    await proxy.$messageBox.confirm('确定加载吗? 注意未保存的参数将会丢失!', '提示', { type: 'warning' })
    activeConfigurationId.value = id
  } catch (error) {
  }
}

watch(() => props.activeIndex, async (val) => {
  const c = props.configurations.find(p => p.id == val)
  emits('selected', cloneDeep(c))
})

</script>

<style lang="scss" scoped>
.config-heading {
  font-size: 14px;
  font-weight: 600;
  color: #1e3c5c;
  margin: 0 0 10px 0;
}

.el-card {
  margin-bottom: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid #e8edf3;

  &:hover {
    border-color: #409eff;
  }
}

:deep(.el-card__body) {
  padding: 10px 14px;
}

.el-card.active {
  border-color: #409eff !important;
  background: #ecf5ff;
}

i {
  color: #c0ccda;
  font-size: 16px;
  transition: color 0.15s;
  margin-left: auto;

  &:hover {
    color: #f56c6c;
  }
}
</style>