<template>
  <div class="wrongbook">
    <!-- 运算符筛选 -->
    <div class="wb-toolbar">
      <button
        v-for="op in operatorChips"
        :key="op.key"
        type="button"
        class="wb-chip"
        :class="{ 'wb-chip--on': operatorFilter === op.key }"
        @click="operatorFilter = op.key"
      >{{ op.label }}</button>
      <span class="wb-spacer"></span>
      <span class="wb-count">已选 {{ selectedCount }} 题</span>
    </div>

    <!-- 排序 -->
    <div class="wb-sortrow">
      <span class="wb-sortlabel">排序</span>
      <el-select v-model="sortBy" size="small" class="wb-sortselect">
        <el-option v-for="o in sortOptions" :key="o.key" :label="o.label" :value="o.key" />
      </el-select>
      <span class="wb-sortlabel">共 {{ filteredRows.length }} 道</span>
    </div>

    <!-- 空态 -->
    <div v-if="loading" class="wb-empty">正在统计错题…</div>
    <div v-else-if="!filteredRows.length" class="wb-empty">
      还没有错题。练几轮再来这里挑重点题吧。
    </div>

    <!-- 错题列表 -->
    <div v-else class="wb-list" role="listbox" aria-multiselectable="true">
      <div
        v-for="row in filteredRows"
        :key="row.key"
        class="wb-item"
        :class="{ 'wb-item--sel': isSelected(row.key) }"
        role="option"
        :aria-selected="isSelected(row.key)"
        @click="toggle(row, $event)"
      >
        <span class="wb-check" :class="{ 'wb-check--on': isSelected(row.key) }">
          {{ isSelected(row.key) ? '✓' : '' }}
        </span>
        <span class="wb-eq">{{ row.equation.replace(/=.*$/, '') }} =</span>
        <span class="wb-wrongans">{{ row.wrongAnswer }}</span>
        <span v-if="row.reasonLabel" class="wb-why">{{ row.reasonLabel }}</span>
        <span class="wb-mastery" :class="masteryClass(row.percent)">掌握 {{ row.percent }}%</span>
      </div>

      <!-- 底部：全选 / 选 N 题 -->
      <div class="wb-listfoot">
        <button type="button" class="wb-link" @click="selectAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
        <span class="wb-spacer"></span>
        <span class="wb-sortlabel">选</span>
        <el-input-number v-model="pickCount" :min="1" :max="Math.max(1, filteredRows.length)"
          size="small" controls-position="right" class="wb-num" />
        <span class="wb-sortlabel">题</span>
        <button type="button" class="wb-link" @click="autoSelect">自动选择</button>
      </div>
    </div>

    <!-- 底部动作 -->
    <div class="wb-actions">
      <el-button :disabled="!selectedCount" @click="clearSelection">清空选择</el-button>
      <el-button type="primary" :disabled="!selectedCount" @click="startPractice">
        开始互动练习（{{ selectedCount }} 题）
      </el-button>
    </div>
  </div>
</template>

<script setup>
/**
 * 「错题库」页：把历史错题按「最该练」排序展示，勾选后直接开练。
 *
 * 数据来源：services/WrongAnswer.loadPool(profile)
 *   - 自动去重（同算式同答案合并）、附带 wrongCount / mastery
 *   - 已掌握（mastery ≥ 100）的题不会出现在这里
 *
 * 行信息（dr 定的精简版）：算式 + 划掉的错误答案 + 错因 + 掌握度
 *   - 不展示正确答案（卷子上才有意义）
 *   - 错因由 utils/algorithm/explainError 从「错误答案 vs 正确答案」反推
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Answer, WrongAnswer } from '@/services'
import { Profile } from '@/services/abilityProfile'
import { explainError } from '@/utils/algorithm/explainError'

const emit = defineEmits(['start-practice'])

const loading = ref(true)
const rows = ref([])
const selected = ref(new Set())
const operatorFilter = ref('all')
const sortBy = ref('focus')
const pickCount = ref(30)
/** Shift 连选用：上一次点击的行下标 */
let lastClickIdx = -1

const operatorChips = [
  { key: 'all', label: '全部' },
  { key: '+', label: '加法' },
  { key: '-', label: '减法' },
  { key: '*', label: '乘法' },
  { key: '/', label: '除法' },
]

const sortOptions = [
  { key: 'focus', label: '最该练（正确率低优先）' },
  { key: 'mostWrong', label: '错得最多' },
  { key: 'recent', label: '最近错过' },
  { key: 'oldest', label: '最久没练' },
]

/**
 * 掌握度 = 这道题的历史正确率（答对次数 / 总作答次数）
 *
 * 不用 mastery 分数：错题通常一次没错对过，mastery 一律 −100 → 全部显示 0%，
 * 看不出差别；而「对 3 次 / 共 5 次 = 60%」这种口径家长一看就懂。
 */
function accuracyOf(stat) {
  if (!stat || !stat.total) return 0
  return Math.round((stat.correct / stat.total) * 100)
}

function masteryClass(percent) {
  if (percent >= 60) return 'wb-mastery--high'
  if (percent >= 30) return 'wb-mastery--mid'
  return 'wb-mastery--low'
}

/** 载入错题库 */
async function load() {
  loading.value = true
  try {
    const profile = await Profile.load()
    const pool = await WrongAnswer.loadPool(profile, { days: 365, limit: 400 })
    // 历史正确率：一次全表扫描，按 equation_solution 聚合
    const statMap = new Map()
    try {
      const all = await Answer.getAllByStudent()
      for (const a of all) {
        const k = `${a.equation || ''}_${a.solution}`
        const cur = statMap.get(k) || { total: 0, correct: 0 }
        cur.total += 1
        if (Answer.isCorrect(a)) cur.correct += 1
        statMap.set(k, cur)
      }
    } catch { /* 统计失败不影响列表 */ }
    rows.value = pool.map((w) => {
      const equation = w.equation || ''
      const solution = w.solution
      const wrongAnswer = w.userAnswer
      const reason = explainError({ equation, solution, userAnswer: wrongAnswer, operator: w.operator })
      const stat = statMap.get(`${equation}_${solution}`)
      const percent = accuracyOf(stat)
      return {
        key: `${equation}_${solution}`,
        equation,
        solution,
        wrongAnswer,
        operator: w.operator,
        wrongCount: w.wrongCount || 1,
        mastery: w.mastery ?? 0,
        percent,
        timestamp: w.timestamp || w.startedAt || 0,
        reasonLabel: reason.label,
        reasonHint: reason.hint,
      }
    })
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

const filteredRows = computed(() => {
  const list = rows.value.filter(r => operatorFilter.value === 'all' || r.operator === operatorFilter.value)
  const sorted = [...list]
  if (sortBy.value === 'mostWrong') sorted.sort((a, b) => b.wrongCount - a.wrongCount || a.percent - b.percent)
  else if (sortBy.value === 'recent') sorted.sort((a, b) => b.timestamp - a.timestamp)
  else if (sortBy.value === 'oldest') sorted.sort((a, b) => a.timestamp - b.timestamp)
  else sorted.sort((a, b) => a.percent - b.percent || b.wrongCount - a.wrongCount)   // 最该练
  return sorted
})

const selectedCount = computed(() => filteredRows.value.filter(r => selected.value.has(r.key)).length)
const allSelected = computed(() => filteredRows.value.length > 0 && selectedCount.value === filteredRows.value.length)

function isSelected(key) {
  return selected.value.has(key)
}

/** 点击整行切换；Shift+点击 连选（桌面） */
function toggle(row, evt) {
  const idx = filteredRows.value.findIndex(r => r.key === row.key)
  const next = new Set(selected.value)
  if (evt?.shiftKey && lastClickIdx >= 0 && idx >= 0) {
    const [from, to] = lastClickIdx < idx ? [lastClickIdx, idx] : [idx, lastClickIdx]
    const shouldSelect = !next.has(row.key)
    for (let i = from; i <= to; i++) {
      const k = filteredRows.value[i].key
      if (shouldSelect) next.add(k)
      else next.delete(k)
    }
  } else if (next.has(row.key)) {
    next.delete(row.key)
  } else {
    next.add(row.key)
  }
  lastClickIdx = idx
  selected.value = next
}

function selectAll() {
  if (allSelected.value) {
    selected.value = new Set()
  } else {
    selected.value = new Set(filteredRows.value.map(r => r.key))
  }
}

/** 按当前排序取前 N 条（优先度最高的 N 题） */
function autoSelect() {
  const n = Math.max(1, Math.floor(Number(pickCount.value) || 1))
  const picked = filteredRows.value.slice(0, n)
  selected.value = new Set(picked.map(r => r.key))
  ElMessage.success(`已按当前排序选中 ${picked.length} 题`)
}

function clearSelection() {
  selected.value = new Set()
}

function startPractice() {
  const picked = filteredRows.value.filter(r => selected.value.has(r.key))
  if (!picked.length) return
  emit('start-practice', {
    // 练习页只需要 { equation, solution }
    questions: picked.map(r => ({ equation: r.equation, solution: r.solution })),
  })
}

onMounted(load)
</script>

<style scoped lang="scss">
.wrongbook {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wb-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wb-chip {
  border: 0;
  background: #f2f6fa;
  color: #5b6b7a;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.wb-chip--on {
  background: #e3f1ff;
  color: #176ebf;
  font-weight: 600;
}

.wb-spacer {
  flex: 1 1 auto;
}

.wb-count {
  font-size: 12.5px;
  font-weight: 600;
  color: #176ebf;
}

.wb-sortrow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-sortlabel {
  font-size: 12px;
  color: #8794a2;
}

.wb-sortselect {
  width: 210px;
}

.wb-empty {
  padding: 26px 12px;
  text-align: center;
  font-size: 13px;
  color: #9aa7b4;
  border: 1px dashed #dbe7f4;
  border-radius: 12px;
}

.wb-list {
  border: 1px solid #e6eef6;
  border-radius: 12px;
  overflow: hidden;
}

.wb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid #f2f7fc;
  cursor: pointer;
  user-select: none;
}

.wb-item:last-of-type {
  border-bottom: none;
}

.wb-item--sel {
  background: #f2f9ff;
}

.wb-check {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 5px;
  border: 1.5px solid #c9d6e2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}

.wb-check--on {
  background: #1cb0f6;
  border-color: #1cb0f6;
}

.wb-eq {
  font-size: 13.5px;
  color: #1e3c5c;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.wb-wrongans {
  font-size: 13.5px;
  color: #e05252;
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  flex: 0 0 auto;
}

.wb-why {
  font-size: 11px;
  color: #b7791f;
  background: #fff7e6;
  border-radius: 6px;
  padding: 1px 6px;
  flex: 0 0 auto;
}

.wb-mastery {
  margin-left: auto;
  font-size: 11.5px;
  border-radius: 6px;
  padding: 1px 7px;
  white-space: nowrap;
}

.wb-mastery--low {
  color: #d94848;
  background: #fdeaea;
}

.wb-mastery--mid {
  color: #b7791f;
  background: #fff7e6;
}

.wb-mastery--high {
  color: #2f9e5c;
  background: #e5f7ea;
}

.wb-listfoot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fbfdff;
  border-top: 1px solid #e6eef6;
}

.wb-link {
  border: 0;
  background: none;
  color: #176ebf;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.wb-num {
  width: 84px;
}

.wb-actions {
  display: flex;
  gap: 10px;
}

.wb-actions .el-button {
  flex: 1;
  margin-left: 0;
}

@media (max-width: 480px) {
  .wb-sortselect {
    width: 100%;
  }

  .wb-item {
    flex-wrap: wrap;
  }

  .wb-mastery {
    margin-left: 0;
  }
}
</style>
