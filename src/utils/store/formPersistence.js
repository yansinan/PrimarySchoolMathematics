/**
 * 出题表单自动持久化
 *
 * 解决的问题：`Generate.vue` 里的 formData 只在 onMounted 从 ConfigStorage 的
 * 「默认配置行」恢复一次，而用户在抽屉里改的题数 / 练习量 / 进位设置等
 * 从不写回任何地方 —— 刷新页面就全丢，表现为「题目数量设置没有保存」。
 *
 * 设计取舍：
 *   - 写在独立的 localStorage 键，**不动** ConfigStorage（`customer-config`）的语义，
 *     「保存配置 / 选中配置」那套手动流程照旧可用
 *   - 存 formData + paperList 两份：题组里每组的题数在 paperList 里，
 *     只存 formData 修不好「题组题数不保存」
 *   - 带版本号；结构校验不过就当作没存过，回落到原有默认逻辑，不让脏数据把表单搞坏
 *   - 写入做 debounce：deep watch 在拖滑块/连续输入时会高频触发，每次写盘没必要
 */

const STORAGE_KEY = 'psm_form_state'
const VERSION = 1
const SAVE_DEBOUNCE_MS = 400

/**
 * @typedef {Object} FormState
 * @property {number} version
 * @property {object} formData
 * @property {Array} paperList
 */

/**
 * 读取保存的表单状态
 * @returns {{ formData: object, paperList: Array } | null} 没存过/损坏时返回 null
 */
export function loadFormState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== VERSION) return null
    const { formData, paperList } = parsed
    // 结构校验：formData 至少要有题数与题型这几个核心字段，否则视为脏数据
    if (!formData || typeof formData !== 'object') return null
    if (formData.numberOfFormulas == null || formData.step == null) return null
    return {
      formData,
      paperList: Array.isArray(paperList) ? paperList : [],
    }
  } catch {
    return null
  }
}

/**
 * 保存表单状态（带 debounce，多次调用只落最后一次）
 * @param {object} formData
 * @param {Array} paperList
 */
export function saveFormState(formData, paperList) {
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => {
    _timer = null
    try {
      const payload = {
        version: VERSION,
        formData: formData || {},
        paperList: Array.isArray(paperList) ? paperList : [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch { /* 隐私模式 / 配额满：静默降级，不影响出题 */ }
  }, SAVE_DEBOUNCE_MS)
}

let _timer = null

/** 清空保存的表单状态（重置数据时用） */
export function clearFormState() {
  if (_timer) { clearTimeout(_timer); _timer = null }
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
