# Agent Rules — PrimarySchoolMathematics

## 浏览器实测
修改完 UI 相关问题后，必须用浏览器实测验证，不能想当然推给用户测。
- 启动 dev server → 打开页面 → 操作验证 → 检查控制台错误
- 确认无误后再提交

## Dev Server 管理
- 固定使用端口 8080（与 vite.config.js 一致）
- 卡死就 kill 旧进程，重启新的
- 不要来回去换端口
