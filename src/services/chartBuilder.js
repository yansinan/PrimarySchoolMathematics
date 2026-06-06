/**
 * 图表构建 service（ARCH 合规：V 层零图表逻辑）
 *
 * 封装 Chart.js 的构建与销毁，V 层只传 canvas ref + 数据。
 * 所有 Chart.js 构造/配置/样式集中在此。
 */
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const OP_COLORS = {
  '＋': '#409eff',
  '－': '#e6a23c',
  '×': '#67c23a',
  '÷': '#f56c6c',
}

/**
 * 构建正确率趋势折线图
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label:string, accuracy:number}>} data
 * @returns {Chart|null}
 */
export function buildTrendChart(canvas, data) {
  if (!canvas || !data?.length) return null

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: '正确率',
        data: data.map(d => d.accuracy * 100),
        borderColor: '#58cc71',
        backgroundColor: 'rgba(88, 204, 113, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${Math.round(ctx.parsed.y)}%`,
          },
        },
      },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
        x: { ticks: { maxTicksLimit: 10 } },
      },
    },
  })
}

/**
 * 构建运算符正确率柱状图
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label:string, accuracy:number, count:number}>} data
 * @returns {Chart|null}
 */
export function buildOperatorChart(canvas, data) {
  if (!canvas || !data?.length) return null

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: '正确率',
        data: data.map(d => d.accuracy * 100),
        backgroundColor: data.map(d => OP_COLORS[d.label] || '#909399'),
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${Math.round(ctx.parsed.y)}% (${data[ctx.dataIndex].count}题)`,
          },
        },
      },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
      },
    },
  })
}

/**
 * 安全销毁图表实例
 * @param {Chart|null} instance
 */
export function destroyChart(instance) {
  if (instance) {
    instance.destroy()
  }
}
