import { defineStore } from 'pinia'
import { EMPTY_PARSED_EQUATION, getCarryType, parseEquation } from '@/utils/equationParser'

export const usePracticeStore = defineStore('drawer', {
  state: () => ({
    generateDrawerVisible: false,
    listPractices: [],
    session: {
      currentIndex: 0,
      answers: [],
      currentAnswer: '',
      feedbackType: null,
      selectedOption: null,
      streak: 0,
      currentOptions: [],
      displayMode: {
        layout: 'horizontal',
        input: 'options'
      }
    }
  }),
  getters: {
    // listQuations:(state)=>{state.listPractices.map((e)=>e.quation);},
    isReady: (state) => state.listPractices && state.listPractices.length > 0,
    totalQuestions: (s) => s.listPractices && s.listPractices.length,
    currentIndex: (state) => state.session.currentIndex,
    currentQuestion: (state) => state.listPractices[state.session.currentIndex] || { equation: '999+999', solution: 7 },
    emptyParsedEquation: () => EMPTY_PARSED_EQUATION,
    currentParsedEquation() {
      return parseEquation(this.currentQuestion?.equation || '') || this.emptyParsedEquation
    },
    currentCarryType() {
      return getCarryType(this.currentParsedEquation)
    },
    isLastQuestion: (state) => state.session.currentIndex >= state.listPractices.length - 1,
    correctCount: (state) => state.session.answers.filter((a) => a.isCorrect).length
  },
  actions: {
    setGenerateDrawerVisible(value) {
      this.generateDrawerVisible = value
    },
    toggleGenerateDrawer() {
      this.generateDrawerVisible = !this.generateDrawerVisible
    },
    setListPractices(value) {
      this.listPractices = value
    },
    setCurrentIndex(value) {
      this.session.currentIndex = value
    },
    resetCurrentIndex() {
      this.session.currentIndex = 0
    },
    nextQuestion() {
      this.session.currentIndex++
    },
    resetPracticeSession() {
      this.session.currentIndex = 0
      this.session.answers = []
      this.session.currentAnswer = ''
      this.session.feedbackType = null
      this.session.selectedOption = null
      this.session.streak = 0
      this.session.currentOptions = []
      this.session.displayMode = {
        layout: 'horizontal',
        input: 'options'
      }
    },
    resetQuestionInputState() {
      this.session.currentAnswer = ''
      this.session.feedbackType = null
      this.session.selectedOption = null
    }
  }
})
