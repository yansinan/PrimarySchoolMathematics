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
