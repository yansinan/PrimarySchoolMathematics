/**
 * 练习汇总弹窗 HTML 生成
 *
 * 抽离自 Practice.vue 的 genSummaryHtml 函数。
 * 后续可以渐进式重构为 Vue 组件（PracticeSummaryDialog.vue），
 * 本阶段先做工具函数化。
 */

import { getCommentByRate } from '@/constants/practice'

/**
 * 生成汇总弹窗 HTML
 * @param {number} totalAns - 总题数
 * @param {number} correctAns - 正确数
 * @returns {string} HTML 字符串
 */
export function genSummaryHtml(totalAns, correctAns) {
  const rate = Math.round((correctAns / totalAns) * 100)
  const { emoji, comment, color } = getCommentByRate(rate)

  var h = '<div style="text-align:center;padding:4px 0;">'
  h += '<div style="font-size:52px;margin-bottom:8px;line-height:1.2;">' + emoji + '</div>'
  h += '<div style="font-size:22px;font-weight:700;color:#1e3c5c;margin-bottom:4px;">练习完成</div>'
  h += '<div style="font-size:14px;color:#909399;margin-bottom:18px;">' + comment + '</div>'
  h += '<div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">'
  h += '<div style="background:linear-gradient(135deg,#f0f9ff,#e8f4fd);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:#1e3c5c;">' + totalAns + '</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">共答</div></div>'
  h += '<div style="background:linear-gradient(135deg,#f0fdf4,#e6f9ed);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:#27ae60;">' + correctAns + '</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确</div></div>'
  h += '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:14px;padding:10px 18px;min-width:68px;box-shadow:0 2px 8px rgba(23,110,191,0.06);">'
  h += '<div style="font-size:24px;font-weight:700;color:' + color + ';">' + rate + '%</div>'
  h += '<div style="font-size:11px;color:#7f8c8d;margin-top:2px;">正确率</div></div></div>'
  h += '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #edf2f7;font-size:12px;color:#c0c4cc;">继续加油，每天进步一点点 &#127775;</div></div>'
  return h
}
