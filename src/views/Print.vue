<template>
  <div :class="{ 'preview': !isPrinting }">
    <div class="A4">
      <div v-for="sheet in sheets" class="sheet padding-10mm" :class="{ 'sheet-shadow': !isPrinting }">
        <div class="mt-12 mb-12">
          <h1>{{ sheet.paperTitle }}</h1>
          <h3>{{ sheet.paperSubTitle }}</h3>
        </div>
        <div class="row">
          <div v-for="col in sheet.columnsOfPaper" :style="`width: ${sheet.colWidth}%;`">
            <p :style="`margin-bottom: ${sheet.rowHeight}`" v-for="f in col">{{ f }}</p>
          </div>
        </div>
      </div>
      <div class="btn" v-if="!isPrinting">
        <ElButton @click="goBack">返回</ElButton>
        <ElButton class="mr-2 w-32" type="primary" @click="print">打印</ElButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatTimestampForFilename } from '@/utils/time/timeFormat'
// E3: papers 改从 sessionStorage 读 (路径 4: sessionStorage + key in query)
// 不再依赖 stores/app.js 跨页面 state


/**
 * 要处理的场景
 * 场景1: 一份试卷一页能显示完
 * 场景2: 一份试卷一页能不能显示完(A4纸一列最多26道题)
 * 场景3: 多份试卷一页能显示完
 * 场景4: 多份试卷一页能不能显示完
*/
const isPrinting = ref(false)
const route = useRoute()
const router = useRouter()

/**
 * 读 sessionStorage 的 papers. key 来自 query.
 * 兼容历史: 若 query 没 key (例如直链访问), 返回空数组.
 */
const printPapers = computed(() => {
  const key = route.query.key
  if (!key) return []
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
})

const sheets = computed(() => {
  return printPapers.value.map(p => {
    const { paperTitle, paperSubTitle, numberOfPagerColumns, solution, formulas } = p

    const numberOfCols = formulas.length / numberOfPagerColumns
    const colWidth = 100 / numberOfPagerColumns
    const rowHeight = solution == '0' ? '16px' : '160px'

    let columnsOfPaper = [];
    let index = 0
    while (index < formulas.length) {
      columnsOfPaper.push(formulas.slice(index, numberOfCols + index));
      index += numberOfCols;
    }
    columnsOfPaper = columnsOfPaper.reverse()
    if (import.meta.env.DEV) console.log(columnsOfPaper);
    return { paperTitle, paperSubTitle, columnsOfPaper, colWidth, rowHeight }
  })
})

onMounted(() => {
  // 修改网页标题以作为打印时文件的文件名
  document.title = route.query.fileName + formatTimestampForFilename()

  window.onbeforeprint = () => {
    if (import.meta.env.DEV) console.log('before')
    isPrinting.value = true
  }

  window.onafterprint = () => {
    if (import.meta.env.DEV) console.log('after')
    nextTick(() => {
      isPrinting.value = false
    })
  }
})

// 兜底清理: 路由 guard 会在离开 /print 时清, 这里再清一次 (双保险)
// onUnmounted 不一定在浏览器关 tab 时触发, 但同 tab 内的 router 跳转通常会触发
onUnmounted(() => {
  const key = route.query.key
  if (key) {
    try { sessionStorage.removeItem(key) } catch {}
  }
})

const goBack = () => {
  router.back()
}

const print = () => {
  isPrinting.value = true
  nextTick(() => {
    window.print()
  })
}
</script>

<style lang="scss" scoped>
.preview {
  background: #e0e0e0;
  padding: 5mm;
  display: flex;
  justify-content: center;
  // height: 100vh;
}

.A4 {
  text-align: center;
}

.sheet {
  margin: 0;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  page-break-after: always;
}

.sheet-shadow {
  box-shadow: 0 .5mm 2mm rgba(0, 0, 0, .3);
}

.A4 {
  .sheet {
    width: 210mm;
    // height: 296mm;
    background: white;

    @apply mt-2;

    &:first-of-type {
      @apply mt-0;
    }

    &.padding-10mm {
      padding: 10mm
    }

    &.padding-15mm {
      padding: 15mm
    }

    &.padding-20mm {
      padding: 20mm
    }

    &.padding-25mm {
      padding: 25mm
    }
  }
}

.row {
  display: flex;
  width: 100%;
}

.col33 {
  width: 33%;
}

.col34 {
  width: 34%;
}

h1 {
  @apply text-3xl font-bold mb-5;
}

h3 {
  @apply text-base;
}

p {
  @apply text-sm;
  margin-right: 20%;
}

.btn {
  position: fixed;
  bottom: 0;
  left: 0;
  z-index: 100;
  height: 50px;
  @apply flex justify-end items-center;
  @apply bg-black bg-opacity-50 w-full;
}
</style>