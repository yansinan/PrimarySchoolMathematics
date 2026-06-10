/**
 * Format a duration in milliseconds to a human-readable Chinese string.
 *
 * Examples:
 *   3723500 → "1小时2分3.5秒"
 *   313000  → "5分13秒"
 *   13500   → "13.5秒"
 *   3200    → "3.2秒"
 *   500     → "0.5秒"
 *
 * @param {number} ms — Duration in milliseconds
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return ''
  if (ms === 0) return '0秒'

  const totalSeconds = ms / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = []

  if (hours > 0) {
    parts.push(`${hours}小时`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}分`)
  }
  // Always show seconds (with one decimal if fractional)
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds.toFixed(1)}秒`)
  }

  return parts.join('')
}

/**
 * Format an ISO date string to short display format.
 * @param {string} iso - ISO date string
 * @returns {string} e.g. "3/15 14:30"
 */
export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Generate a compact timestamp string for filenames.
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. "2026611153045"
 */
export function formatTimestampForFilename(date) {
  const d = date || new Date()
  const y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}${M}${D}${h}${m}${s}`
}
