# 设计图渲染脚本

这些脚本用 Chromium（Playwright）把设计稿渲染成 PNG，产出在 `designDocs/mockups/<主题>/`。
**不是运行时资源**，只在改设计图时手动跑。

| 脚本 | 产物 | 说明 |
|---|---|---|
| `mockup-start-page.mjs` | `designDocs/mockups/start-page/before-390.png`、`after-*.png`、`compare.png` | 准备开始页 v1–v3（去重 / 上次正确率 / 折叠设置） |
| `mockup-start-page-final.mjs` | `start-page/final-*.png` | 方案 A 定稿：窄栏居中 + 降/升双按钮 + 「更多」面板 |
| `mockup-start-page-wide.mjs` | `start-page/after-*-1440.png` | 宽屏左右分栏（已被方案 A 否决，留存对照） |
| `mockup-start-page-wide2.mjs` | `start-page/wide-A/B/C-*.png` | 宽屏三方案对照 |
| `mockup-ratio-title.mjs` | `ratio-title/A-*.png`、`B1/B2-*.png` | 档位配比归属 + 卷子标题两种归属方案 |
| `mockup-drawer-compact.mjs` | `drawer-compact/N*.png`、`O*.png` | 数字范围表格化 + 出题规则内联 |

运行前确认依赖：

```bash
# Playwright 装在 /tmp/pw-playwright（避免污染项目依赖）
node scripts/mockups/mockup-drawer-compact.mjs
```
