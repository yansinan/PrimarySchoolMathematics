# Agent Rules — PrimarySchoolMathematics

## 浏览器实测
修改完 UI 相关问题后，必须用浏览器实测验证，不能想当然推给用户测。
- 启动 dev server → 打开页面 → 操作验证 → 检查控制台错误
- 确认无误后再提交

## Dev Server 管理
- 固定使用端口 8080（与 vite.config.js 一致）
- 卡死就 kill 旧进程，重启新的
- 不要来回去换端口

## 继承与封装
- 时刻记住 Question → Answer → WrongAnswer 三大类继承关系，从适当的祖先节点添加成员函数/变量
- services 里已有的类，能封装到类的要封装
- 每一次修改，都是理顺业务逻辑的机会
- 时刻遵循构架文档 ARCHITECTURE.md
