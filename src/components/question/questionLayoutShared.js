import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePracticeStore } from '@/stores/practice'
import { parseEquation, getCarryType, EMPTY_PARSED_EQUATION } from '@/utils/algorithm/equationParser'

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
  },
  /** Optional equation string (e.g. "3+5=8") to override store-based data */
  equation: {
    type: String,
    default: ''
  },
  /** 逐位数字输入模式（竖式计算）*/
  digitMode: {
    type: Boolean,
    default: false
  },
  /** 逐位数字输入的外部焦点索引 */
  focusSlot: {
    type: Number,
    default: -1
  },
  /** 初始焦点位置：-1=最右侧（个位），0=最左侧 */
  initialFocus: {
    type: Number,
    default: -1
  }
}

export const questionLayoutEmits = ['update:userAnswer', 'submitAnswer', 'focus']

/**
 * 读取当前题目的算式解析结果与进退位类型。
 * 如果提供了 equation prop，则直接解析该字符串；
 * 否则从 Pinia practiceStore 读取。
 * @param {{ equation?: import('vue').ComputedRef<string>|string }} [props]
 * @returns {{parsedEquation: import('vue').ComputedRef<any>, carryType: import('vue').ComputedRef<string>}}
 */
export const useQuestionEquation = (props) => {
  const hasEquation = computed(() => !!(props?.equation))

  const parsedEquation = computed(() => {
    // When equation prop is provided, parse it directly
    if (hasEquation.value) {
      return parseEquation(props.equation) || EMPTY_PARSED_EQUATION
    }
    // Fall back to store
    const practiceStore = usePracticeStore()
    const { currentParsedEquation, emptyParsedEquation } = storeToRefs(practiceStore)
    return currentParsedEquation.value || emptyParsedEquation.value
  })

  const carryType = computed(() => {
    if (hasEquation.value) {
      return getCarryType(parsedEquation.value)
    }
    const practiceStore = usePracticeStore()
    const { currentCarryType } = storeToRefs(practiceStore)
    return currentCarryType.value
  })

  return {
    parsedEquation,
    carryType
  }
}