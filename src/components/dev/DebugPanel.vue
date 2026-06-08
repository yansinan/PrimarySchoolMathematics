/**
 * DebugPanel — 开发调试浮动面板
 * 通过 ?debug=true 控制显示，面包屑分页展示 composable 层全量数据。
 * 半透明浮动，pointer-events:none 不干扰用户操作。
 *
 * ARCH §2.1: dev 组件放 components/dev/
 */
<template>
  <div v-if="visible" class="debug-overlay" @click.stop>
    <div class="debug-panel">
      <div class="debug-breadcrumb">
        <span
          v-for="tab in tabs"
          :key="tab.key"
          :class="['debug-crumb', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >{{ tab.label }}</span>
        <span class="debug-close" @click="close">✕</span>
      </div>

      <div class="debug-body">
        <!-- ────── Tab 1: 会话概览 ────── -->
        <template v-if="activeTab === 'overview'">
          <div class="debug-line">
            <span class="dl">阶段[phase]</span> {{ phase }}
            <span class="dl">| 类型[isAssessment]</span> {{ isAssessment ? '诊断' : '练习' }}
            <span class="dl">| 阶段名[stageName]</span> {{ stageName }}
          </div>
          <div class="debug-line">
            <span class="dl">难度索引[currentDifficultyIdx]</span> {{ currentDifficultyIdx }}
            <span class="dl">| 难度标签</span> {{ difficultyLabel }}
            <span class="dl">| 组序号[currentGroupIndex]</span> {{ currentGroupIndex }}
          </div>
          <div class="debug-line">
            <span class="dl">总题量[totalQuestions]</span> {{ totalQuestions }}
            <span class="dl">| 当前题号[currentIndex]</span> {{ currentIndex }}
            <span class="dl">| 本组题量</span> {{ session?.answers?.length || 0 }}
            <span class="dl">| 本组正确</span> {{ groupCorrectCount }}
          </div>
          <div class="debug-line">
            <span class="dl">累计答[adaptiveAnswers]</span> {{ adaptiveAnswers?.length || 0 }}
            <span class="dl">| 对[correctCount]</span> {{ correctCount }}
            <span class="dl">| 连对[session.streak]</span> {{ session?.streak || 0 }}
            <span class="dl">| nextLocked</span> {{ nextLocked ? '🔒' : '✓' }}
          </div>
        </template>

        <!-- ────── Tab 2: 当前题组 ────── -->
        <template v-if="activeTab === 'currentGroup'">
          <!-- 用户画像（scope=当前组答案） -->
          <div class="debug-line">
            <span class="dl">总答案[totalAnswers]</span> {{ groupProfile.totalAnswers?.value ?? '-' }}
            <span class="dl">| 分[scoreSum]</span> {{ groupProfile.scoreSum?.value ?? '-' }}
            <span class="dl">| 正确率[rate]</span> {{ groupProfile.rate?.value ?? '-' }}%
            <span class="dl">| 准确率[displayAccuracy]</span> {{ (groupProfile.displayAccuracy?.value * 100 || 0).toFixed(0) }}%
          </div>
          <div class="debug-line">
            <span class="dl">等级[currentLevelLabel]</span> {{ groupProfile.currentLevelLabel?.value ?? '-' }}
            <span class="dl">| 进度</span> {{ groupProfile.levelCurrentDisplay?.value ?? '-' }}/{{ groupProfile.statsLevelTotal?.value ?? '-' }}
            <span class="dl">| 强项[strongLevels]</span> {{ (groupProfile.strongLevels?.value || []).join(', ') || '无' }}
            <span class="dl">| 弱项[weakLevels]</span> {{ (groupProfile.weakLevels?.value || []).join(', ') || '无' }}
          </div>
          <!-- 本组题目 -->
          <slot name="question-list" :questions="listPractices" :current="currentIndex">
            <div class="debug-line">
              <span class="dl">本组共</span> {{ listPractices?.length || 0 }} 题
              <span class="dl">| 当前</span> {{ currentIndex + 1 }}
              <span class="dl">| 剩余</span> {{ remainingCount }}
              <span class="dl">| 选择题目</span>
              <select v-model="groupQIdx" class="debug-select">
                <option v-for="(q, i) in listPractices" :key="i" :value="i">
                  #{{ i+1 }} {{ q.equation || '-' }}
                  {{ i < currentIndex ? '✓' : i === currentIndex ? '◀' : '' }}
                </option>
              </select>
            </div>
            <QuestionDetail :q="groupSelectedQ" />
          </slot>
        </template>

        <!-- ────── Tab 3: 本轮练习 ────── -->
        <template v-if="activeTab === 'round'">
          <div class="debug-line">
            <span class="dl">总答案[totalAnswers]</span> {{ roundProfile.totalAnswers?.value ?? '-' }}
            <span class="dl">| 分[scoreSum]</span> {{ roundProfile.scoreSum?.value ?? '-' }}
            <span class="dl">| 正确率[rate]</span> {{ roundProfile.rate?.value ?? '-' }}%
            <span class="dl">| 准确率[displayAccuracy]</span> {{ (roundProfile.displayAccuracy?.value * 100 || 0).toFixed(0) }}%
          </div>
          <div class="debug-line">
            <span class="dl">等级[currentLevelLabel]</span> {{ roundProfile.currentLevelLabel?.value ?? '-' }}
            <span class="dl">| 进度</span> {{ roundProfile.levelCurrentDisplay?.value ?? '-' }}/{{ roundProfile.statsLevelTotal?.value ?? '-' }}
            <span class="dl">| 强项[strongLevels]</span> {{ (roundProfile.strongLevels?.value || []).join(', ') || '无' }}
            <span class="dl">| 弱项[weakLevels]</span> {{ (roundProfile.weakLevels?.value || []).join(', ') || '无' }}
          </div>
          <div class="debug-line">
            <span class="dl">数字掌握度[masteryByNumber]</span>
            <span v-for="n in 10" :key="n-1"
              :title="(n-1)+': '+((roundProfile.masteryByNumber?.value?.[n-1]||0)*100).toFixed(0)+'%'"
              :style="{color: (roundProfile.masteryByNumber?.value?.[n-1]||0) >= 0.8 ? '#4caf50' : (roundProfile.masteryByNumber?.value?.[n-1]||0) >= 0.5 ? '#ff9800' : '#f44336'}">
              {{ n-1 }}<sup>{{ ((roundProfile.masteryByNumber?.value?.[n-1]||0)*100).toFixed(0) }}</sup>
            </span>
          </div>
          <div class="debug-line">
            <span class="dl">强项数字[strengthByNumber]</span>
            {{ (roundProfile.strengthByNumber?.value || []).map(i => i.number+'('+(i.accuracy*100).toFixed(0)+'%)').join(', ') || '无' }}
            <span class="dl">| 弱项[weaknessByNumber]</span>
            {{ (roundProfile.weaknessByNumber?.value || []).map(i => i.number+'('+(i.accuracy*100).toFixed(0)+'%)').join(', ') || '无' }}
          </div>
          <!-- 本轮全部题目 -->
          <div class="debug-line">
            <span class="dl">本轮共</span> {{ listPractices?.length || 0 }} 题
            <span class="dl">| 选择题目</span>
            <select v-model="roundQIdx" class="debug-select">
              <option v-for="(q, i) in listPractices" :key="i" :value="i">
                #{{ i+1 }} {{ q.equation || '-' }}
                {{ i < currentIndex ? '✓' : i === currentIndex ? '◀' : '' }}
              </option>
            </select>
          </div>
          <QuestionDetail :q="roundSelectedQ" />
        </template>

        <!-- ────── Tab 4: 历史全量用户画像 ────── -->
        <template v-if="activeTab === 'history'">
          <div class="debug-line">
            <span class="dl">总答案[totalAnswers]</span> {{ histProfile.totalAnswers?.value ?? '-' }}
            <span class="dl">| 分[scoreSum]</span> {{ histProfile.scoreSum?.value ?? '-' }}
            <span class="dl">| 正确率[rate]</span> {{ histProfile.rate?.value ?? '-' }}%
            <span class="dl">| 准确率[displayAccuracy]</span> {{ (histProfile.displayAccuracy?.value * 100 || 0).toFixed(0) }}%
          </div>
          <div class="debug-line">
            <span class="dl">等级[currentLevelLabel]</span> {{ histProfile.currentLevelLabel?.value ?? '-' }}
            <span class="dl">| 进度</span> {{ histProfile.levelCurrentDisplay?.value ?? '-' }}/{{ histProfile.statsLevelTotal?.value ?? '-' }}
            <span class="dl">| 强项等级[strongLevels]</span> {{ (histProfile.strongLevels?.value || []).join(', ') || '无' }}
            <span class="dl">| 弱项等级[weakLevels]</span> {{ (histProfile.weakLevels?.value || []).join(', ') || '无' }}
          </div>
          <div class="debug-line">
            <span class="dl">数字掌握度[masteryByNumber]</span>
            <span v-for="n in 10" :key="n-1"
              :title="(n-1)+': '+((histProfile.masteryByNumber?.value?.[n-1]||0)*100).toFixed(0)+'%'"
              :style="{color: (histProfile.masteryByNumber?.value?.[n-1]||0) >= 0.8 ? '#4caf50' : (histProfile.masteryByNumber?.value?.[n-1]||0) >= 0.5 ? '#ff9800' : '#f44336'}">
              {{ n-1 }}<sup>{{ ((histProfile.masteryByNumber?.value?.[n-1]||0)*100).toFixed(0) }}</sup>
            </span>
          </div>
          <div class="debug-line">
            <span class="dl">强项数字[strengthByNumber]</span>
            {{ (histProfile.strengthByNumber?.value || []).map(i => i.number+'('+(i.accuracy*100).toFixed(0)+'%)').join(', ') || '无' }}
            <span class="dl">| 弱项[weaknessByNumber]</span>
            {{ (histProfile.weaknessByNumber?.value || []).map(i => i.number+'('+(i.accuracy*100).toFixed(0)+'%)').join(', ') || '无' }}
          </div>
          <div class="debug-line">
            <span class="dl">全对题[fullCorrectCount]</span> {{ histProfile.fullCorrectCount?.value ?? '-' }}
            <span class="dl">| 鼓励语[strengthEncouragement]</span> {{ histProfile.strengthEncouragement?.value || '-' }}
          </div>
          <div class="debug-line">
            <span class="dl">统计[aggregatedStats]</span>
            {{ histAggStats ? `共${histAggStats.totalSessions}次练习 ${histAggStats.totalQuestions}题 正确率${(histAggStats.overallAccuracy*100).toFixed(0)}% 连续${histAggStats.dailyStreak}天` : '加载中…' }}
          </div>
        </template>

        <!-- ────── Tab 5: 出题逻辑 ────── -->
        <template v-if="activeTab === 'engine'">
          <div class="debug-line">
            <span class="dl">当前档位[DIFFICULTY_LEVELS[{{ currentDifficultyIdx }}]]</span>
            {{ difficultyLabel }}
          </div>
          <div class="debug-line" v-if="currentLevel">
            <span class="dl">formulaList</span> {{ JSON.stringify(currentLevel.formulaList) }}
            <span class="dl">| carry/abdication</span>
            {{ currentLevel.carry }}/{{ currentLevel.abdication }}
            <span class="dl">| resultMax</span> {{ currentLevel.resultMax }}
          </div>
          <div class="debug-line" v-if="currentLevel">
            <span class="dl">各operators</span>
            {{ (currentLevel.formulaList || []).map(f => f.operators ? JSON.stringify(f.operators) : 'null').join(', ') }}
          </div>
          <div class="debug-line">
            <span class="dl">当前题[currentQuestion]</span>
            {{ currentQuestion?.equation || '-' }}
            <span class="dl">| 答案</span> {{ currentQuestion?.solution ?? '-' }}
            <span class="dl">| inputMode</span> {{ currentQuestion?.inputMode || '-' }}
          </div>
          <div class="debug-line">
            <span class="dl">displayMode</span> {{ displayModeStr }}
            <span class="dl">| 运算符[currentQuestion.operator]</span> {{ currentQuestion?.operator || '-' }}
            <span class="dl">| 难度[difficulty]</span> {{ currentQuestion?.difficulty ?? '-' }}
          </div>
          <div class="debug-line">
            <span class="dl">session.displayMode</span>
            {{ `${session.displayMode?.layout||'-'}/${session.displayMode?.input||'-'}` }}
            <span class="dl">| currentOptions</span> {{ JSON.stringify(session.currentOptions || [])?.substring(0,60) }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { usePracticeStore } from '@/stores/practice'
import { useStatsStore } from '@/stores/stats'
import { useAbilityProfile } from '@/composables/useAbilityProfile'
import { useAbilityAnalysis } from '@/composables/useAbilityAnalysis'
import { useStatsQuery } from '@/composables'
import { DIFFICULTY_LEVELS } from '@/utils/algorithm/adaptiveEngine'
import { sumAnswerScores } from '@/utils/score'
import { storeToRefs } from 'pinia'
import QuestionDetail from './QuestionDetail.vue'

// ── 显示控制: ?debug=true ──
const visible = ref(false)
const params = new URLSearchParams(window.location.search)
if (params.get('debug') === 'true') visible.value = true

function close() { visible.value = false }

// ── Breadcrumb 标签 ──
const tabs = [
  { key: 'overview',     label: '会话概览' },
  { key: 'currentGroup', label: '当前题组' },
  { key: 'round',        label: '本轮练习' },
  { key: 'history',      label: '历史用户画像' },
  { key: 'engine',       label: '出题逻辑' },
]
const activeTab = ref('overview')

// ── Store 数据 (M 层) ──
const practiceStore = usePracticeStore()
const statsStore = useStatsStore()
const { refreshAll: refreshAllQuery, loadAllAnswers: loadAllAnswersQuery } = useStatsQuery()
const {
  phase, isAssessment, currentDifficultyIdx, currentGroupIndex,
  totalQuestions, currentIndex, session, correctCount,
  listPractices, currentQuestion, adaptiveAnswers,
} = storeToRefs(practiceStore)

// ── Composable C 层: 3 种 scope ──
const analysis = useAbilityAnalysis()

// Tab2: 当前题组 → session.answers (本组答案)
const groupAnswers = computed(() => session.value.answers || [])
const groupProfile = useAbilityProfile({ analysis, answers: groupAnswers })

// Tab3: 本轮练习 → adaptiveAnswers (全轮累积)
const roundAnswers = computed(() => adaptiveAnswers.value || [])
const roundProfile = useAbilityProfile({ analysis, answers: roundAnswers })

// Tab4: 历史全量 → statsStore.allAnswers (需先加载)
const histAnswers = computed(() => statsStore.allAnswers || [])
const histProfile = useAbilityProfile({ analysis, answers: histAnswers })
const histAggStats = computed(() => statsStore.aggregatedStats)

// 历史 tab 被点击时触发加载聚合统计 + 数字掌握度
watch(activeTab, (tab) => {
  if (tab === 'history') {
    refreshAllQuery()
    loadAllAnswersQuery().then(() => {
      if (statsStore.allAnswers?.length) {
        analysis.refreshMasteryFromAnswers(statsStore.allAnswers)
      }
    })
  }
})

// ── 出题器常量 ──
const currentLevel = computed(() =>
  currentDifficultyIdx.value >= 0 ? DIFFICULTY_LEVELS[currentDifficultyIdx.value] : null
)
const difficultyLabel = computed(() =>
  currentLevel.value?.label || (currentDifficultyIdx.value < 0 ? '未激活' : '—')
)

const stageName = computed(() => {
  if (isAssessment.value) return `能力评估 ${session.value.answers.length}/${totalQuestions.value}`
  if (currentLevel.value) return `${currentLevel.value.label} · 第${currentGroupIndex.value}组`
  return '—'
})

const groupCorrectCount = computed(() => sumAnswerScores(session.value.answers || []))

const displayModeStr = computed(() => {
  const dm = session.value?.displayMode
  return dm ? `${dm.layout}/${dm.input}` : '-/-'
})

const nextLocked = computed(() => session.value?.nextLocked ?? false)

// ── 本组题目下拉 ──
const groupQIdx = ref(0)
const groupSelectedQ = computed(() => listPractices.value?.[groupQIdx.value] || null)

const roundQIdx = ref(0)
const roundSelectedQ = computed(() => listPractices.value?.[roundQIdx.value] || null)

watch(currentIndex, (v) => {
  if (groupQIdx.value > v) groupQIdx.value = v
  if (roundQIdx.value > v) roundQIdx.value = v
})

const remainingCount = computed(() =>
  Math.max(0, (listPractices.value?.length || 0) - currentIndex.value - 1)
)
</script>

<style scoped>
/* ── 浮动层：不干扰用户操作 ── */
.debug-overlay {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 9999;
  pointer-events: none;          /* 点击穿透 */
}
.debug-panel {
  pointer-events: auto;          /* 面板内可交互 */
  margin: 4px 8px;
  background: rgba(10, 10, 30, 0.78);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4e8;
  overflow: hidden;
}

/* ── 面包屑导航 ── */
.debug-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 4px 8px;
  background: rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  user-select: none;
}
.debug-crumb {
  padding: 2px 10px;
  cursor: pointer;
  color: #8899bb;
  transition: all 0.15s;
  border-radius: 4px;
  font-size: 11px;
}
.debug-crumb + .debug-crumb::before {
  content: '/';
  margin-right: 6px;
  color: #445;
}
.debug-crumb:hover { color: #b0c4ee; background: rgba(255,255,255,0.06); }
.debug-crumb.active { color: #8cf; background: rgba(100,180,255,0.12); }
.debug-close {
  margin-left: auto;
  cursor: pointer;
  padding: 0 6px;
  color: #889;
  font-size: 14px;
}
.debug-close:hover { color: #f88; }

/* ── 内容体 ── */
.debug-body {
  padding: 3px 8px 4px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.debug-body::-webkit-scrollbar { width: 4px; }
.debug-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.debug-line {
  white-space: nowrap;
  overflow-x: hidden;
  text-overflow: ellipsis;
  padding: 1px 0;
}
.debug-line:hover {
  overflow-x: auto;
  white-space: nowrap;
}

.dl {
  color: #6688bb;
  font-size: 10px;
}
.dl + .dl { margin-left: 6px; }

/* ── 下拉选择器 ── */
.debug-select {
  background: rgba(255,255,255,0.08);
  color: #d4d4e8;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 3px;
  font-size: 11px;
  padding: 0 4px;
  max-width: 240px;
  cursor: pointer;
}
.debug-select option { background: #1a1a2e; color: #d4d4e8; }

/* ── 掌握度数字小标签 ── */
sup { font-size: 8px; }
</style>