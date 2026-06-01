import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'

export const questionLayoutProps = {
  showAnswer: {
    type: Boolean,
    default: false
  },
  answer: {
    type: [String, Number],
    default: ''
  },
  userAnswer: {
    type: [String, Number],
    default: ''
  },
  enableDirectInput: {
    type: Boolean,
    default: false
  }
}

export const questionLayoutEmits = ['update:userAnswer', 'submitAnswer']

/**
 * 读取当前题目的算式解析结果与进退位类型。
 * @returns {{parsedEquation: import('vue').ComputedRef<any>, carryType: import('vue').ComputedRef<string>}}
 */
export const useQuestionEquation = () => {
  const practiceStore = usePracticeStore()
  const { currentParsedEquation, currentCarryType, emptyParsedEquation } = storeToRefs(practiceStore)
  const parsedEquation = computed(() => currentParsedEquation.value || emptyParsedEquation.value)
  const carryType = computed(() => currentCarryType.value)

  return {
    parsedEquation,
    carryType
  }
}