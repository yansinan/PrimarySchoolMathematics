# 15-PLAN：接入 IndexDBSnapshotSync

> **状态**：规划中（未实施）
> **目标**：把 `~/workspace/indexDB-snapshot-sync` 作为自建同步服务接进 PSM，让同一个孩子的练习数据在多设备（x1tablet / 手机 / 另一台电脑）之间自动收敛。
> **前提**：本地优先 —— 同步失败绝不阻塞答题；不做实时协作、不做多用户 UI。
> **配套**：[ARCHITECTURE.md](./ARCHITECTURE.md)（分层）、[DESIGN.md](./DESIGN.md)（本地优先、单孩子）；同步侧契约见同工作区兄弟项目 `indexDB-snapshot-sync/docs/SDK.md` 与 `README.md`

---

## 0. 结论

**可行**，但不能直接接 —— 现有数据层有两个前提必须先补齐，否则接上就会互相覆盖：

1. **加全局稳定行键 `uid`**（Dexie v6 + 回填）。现有主键是自增 `id`，两台设备的 `id=5` 是两条不同记录；按 `id` 合并会串轮、覆盖答案。
2. **明确删除语义**。快照合并不认识「删除」，`/reset` 清空后会被另一台设备把云端数据「复活」。

推荐形态：**vendored 官方 browser SDK + PSM 自己的 `exportAll/importAll` 适配层 + `/sync` 同源反代（vite proxy）+ 设置抽屉里的同步区块**。

不照抄 SpellWell 的 `SyncManager`：它面向「内容后台 + 多编辑器」，自带账号面板与内容版本；PSM 是单孩子家庭场景，直接用官方 SDK（少 ~300 行自研，调度/冲突重试/多标签锁都是现成的）。

---

## 1. 目标与非目标

| 目标 | 非目标 |
|---|---|
| 单用户（一个孩子）多设备数据一致 | 多孩子 / 多账号 UI（`studentId` 仍固定 `'default'`） |
| 自动同步 + 手动「立即同步」 | 实时推送（服务端无 SSE / WebSocket） |
| 离线可用，失败不阻塞答题 | 服务端合并（服务端只存不透明快照） |
| 同步状态可见（已同步 / 离线 / 需重新配对） | 公网多租户、公网匿名访问 |

---

## 2. 现状盘点

### 2.1 同步服务（已在跑）

- 地址：`http://127.0.0.1:4010`（家庭内网经反代使用 `/sync`）。
- 模型：**每用户一个不透明 JSON 快照**，`revision` CAS（`GET/PUT /v1/snapshots`）。
- 认证：每设备 token（`Authorization: Bearer` 或 HttpOnly `ss_device` cookie）+ 一次性配对码。
- 服务端**不 merge、不校验内容**；快照上限 8MB（SDK 侧 `payload_too_large` → `offline`）。
- 无删除快照 API、无变更通知、无历史版本。
- 现有 1 个项目（SpellWell，2 用户）。PSM 需要新项目（bootstrap）或在同项目下建新用户。

### 2.2 PSM 数据层

| 表 | 主键 | 跨设备稳定键 | 时间字段 | 备注 |
|---|---|---|---|---|
| `practiceSessions` | 自增 `id` | ❌（`practiceSessionId` 同一轮多行） | `createdAt` / `updatedAt`（ISO） | 一轮 2~7 行：首题壳 / 各组 checkpoint / 最终结算 |
| `answers` | 自增 `id` | ❌ | `timestamp`（ms） | 重试原地更新同一行；诊断答案无 pid/sessionId（孤儿） |
| `questions` | 自增 `id`，`&equation` | `equation` | `createdAt`（ms） | 派生缓存，统计不依赖 |

- `synced` 字段存在但**从未使用**（之前为 Dexie Cloud 预留）。
- 已有 `exportAllData / importAllData`，但形状是 `{version:'2.0', sessions, answers, questions}`，不是 SDK 的 `{schemaVersion, stores}`。
- 删除入口：`/reset` → `clearAllData()`（有 UI）；`deleteSession` 有 API 但**无 UI 调用**。
- `answers.sessionId`（数值）指向首题行的本地 id，**跨设备必然指错**；新读路径已全部改按 `practiceSessionId`（`getDetail`、`getBatchSessionStats`、`statsAggregator`）。

### 2.3 部署形态

| 形态 | 地址 | 能否 `/sync` 反代 |
|---|---|---|
| 开发 | vite `:8080` | ✅ `server.proxy` |
| 家庭 | docker compose，宿主 `:4003` → 容器 vite `:8080` | ✅ 同 vite 配置 |
| 公网 | `build:github` 静态托管 | ❌ 无服务端（降级为「未启用同步」） |

---

## 3. 可行性结论（逐条）

| 维度 | 结论 | 依据 / 对策 |
|---|---|---|
| 协议 / SDK 匹配 | ✅ | SDK 只要求 `exportAll` / `importAll`；PSM 已有整库导出能力，改造成本低 |
| 合并键 | ❌ → 需改造 | 必须加 `uid`；`answers` 用 `lww(timestamp)`，`practiceSessions` 用 `lww(updatedAt)` |
| 快照上限 8MB | ⚠️ | 当前数据量 < 100KB；`questions` 不入快照；按 ~250B/答案估算可存约 3 万题 |
| 删除语义 | ⚠️ | 阶段一「只增不删」+ 重置前断开同步；阶段二墓碑 |
| 诊断孤儿答案 | ⚠️ | 先随快照同步（按 uid 去重）；后续给诊断轮补 `practiceSessionId`（独立小修） |
| 时钟偏移 | ⚠️ | `lww` 依赖设备时间；家庭设备已同步 NTP，可接受 |
| 多标签并发 | ✅ | `navigator.locks`（HTTPS / localhost）；LAN http 下降级为无锁 |
| 安全 | ✅ | 默认 cookie 模式（token 不落 JS）；同源反代；凭据不进快照 |
| 运维 | ⚠️ | 单实例、无备份；`data/` 目录需纳入备份 |
| 公网 | ❌ | 静态托管无代理；保持「本地可用、公网只读本地数据」 |

---

## 4. 架构设计（分层）

```
src/sync/                          ← vendored 官方 SDK（不改）
  client.js  merge.js  browser.js
src/sync/config.js                 ← baseUrl / projectId 的来源（运行时配置，不硬编码进仓库）
src/services/snapshot.js           ← S 层：exportAll / importAll / merge 策略 / schemaVersion
src/composables/useSnapshotSync.js ← C 层：init / enroll / pair / syncNow / 状态
src/components/generate/OptionsDrawer.vue ← V：同步区块（状态 / 配对 / 立即同步 / 解绑）
```

- 跨层遵循 ARCHITECTURE：V → C → S →（Dexie）。SDK 作为 U 层叶子模块被 S 层调用。
- **写入触发点**：`usePracticeSaver` 的 `savePerQuestion` / `saveGroupCheckpoint` / `saveSessionFinal` 之后各 `markDirty()`；`importData`、`clearAllData` 之后同样。
- **状态可见**：设置抽屉内的同步区块 + 页头一个小状态点（已同步 / 待同步 / 离线 / 需重新配对），不阻塞答题。
- 调度：`sync.start({ intervalMs: 120000 })`（默认 30s 太密，整库快照没必要每 30s 推一次）；`markDirty` 自带 800ms 防抖。

---

## 5. 数据模型变更（关键）

### 5.1 Dexie v6：`uid`

```js
// services/databaseInit.js
this.version(6).stores({
  practiceSessions: '++id, &uid, studentId, createdAt, synced, updatedAt, practiceSessionId',
  answers:          '++id, &uid, sessionId, questionId, startedAt, synced, timestamp, practiceSessionId',
  questions:        '++id, &equation, operator, createdAt, synced',
});
```

- 升级钩子逐行回填 `uid`（事务内，空库不报错）。
- `uid()` 必须带降级：`crypto.randomUUID()` 在 **http 局域网非安全上下文不可用** → `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`。
- 创建路径：`PracticeSession.create`、`Answer.save`、诊断答案写入都要带 `uid`。
- **坑**：`Answer.toJSON()` 是白名单序列化，`uid` 不加进去的话，答错重试（`put` 更新同一行）会把 `uid` 抹掉 → 必须同时加进 `Answer.toJSON()` / `fromJSON()` 与 `Answer` schema 默认值。
- `practiceSessions` 的 `update()`（`modify`）不碰 `uid`，无需改。

### 5.2 合并策略

```js
policies: {
  practiceSessions: { mode: 'lww', key: 'uid', timeField: 'updatedAt' },
  answers:          { mode: 'lww', key: 'uid', timeField: 'timestamp' },
  questions:        { mode: 'local' },   // 设备本地派生缓存，不同步
}
```

> **为什么 answers 不能用 `union`**：`unionRecords` 先遍历 remote、同键本地记录直接丢弃 —— 而答案会在答错重试时原地更新。`lww` 才能让「后一次作答」赢。

### 5.3 `exportAll`

```js
// services/snapshot.js —— 单事务读，避免半更新快照（SDK checklist 要求）
export async function exportAll() {
  return DB.transaction('r', DB.practiceSessions, DB.answers, async () => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    stores: {
      practiceSessions: await DB.practiceSessions.toArray(),
      answers: await DB.answers.toArray(),
      // questions 不入快照（派生缓存，可由 answers 重建）
    },
  }));
}
```

### 5.4 `importAll`（按 uid upsert + 外键重映射）

1. 校验 `schemaVersion === 1`，否则拒绝导入（`status = error`，本地数据不动）。
2. 事务内：`practiceSessions` 按 `uid` `put`；`answers` 按 `uid` `put`，并把 `sessionId` 重映射为本机同 `practiceSessionId` 首行的 `id`（查不到则置 `null`，读路径已按 pid）。
3. **不删除任何本地行**（阶段一）；`questions` 完全不动。
4. 幂等：同一快照重复导入结果一致。

### 5.5 删除语义（阶段一）

- 承诺：**同步只增不删**。`/reset` 清空后，下次同步会把云端数据拉回来。
- 对策：`ResetData.vue` 增加「同时断开本机同步（推荐）」复选（默认勾选）→ `sync.reset()` + `clearAllData()`；不勾选则明确提示「下次同步会恢复云端记录」。
- 阶段二（可选）：`deletedAt` 墓碑 + 读路径过滤 + `lww` 传播删除。改动面较大（所有读路径都要过滤），放到 P4 之后按需做。

### 5.6 迁移安全：P0 会不会破坏旧数据？

**结论：只要 P0 严格「只加字段 + 回填」，不碰任何业务字段、不联网，就不会损坏已有练习数据。** 但有几个必须处理的失败模式，否则会出现「打不开」或「静默不同步」（不丢数据，但行为错误）。

| 风险 | 是否丢数据 | 触发条件 | 处理 |
|---|---|---|---|
| 升级钩子抛错 | ❌ 不丢（整个 version-change 事务回滚，DB 停在 v5） | 回填代码异常 | 钩子只做 `modify` 补字段；失败 → 应用打不开，需明确错误页 + 保留 v5 数据 |
| 升级后回滚代码 | ❌ 不丢，但**打不开** | 合并后又 `git checkout` 回到 version(5) | DB 版本单向：只能保留 v6 代码或清库。P0 上线前先做一次完整导出 |
| 多标签阻塞升级 | ❌ 不丢，但卡住 | 两个标签页同时打开（旧连接不关，升级永远等待） | 现在**没有任何** `versionchange` / `blocked` 处理，必须补 `db.on('versionchange', () => db.close())` + `blocked` 提示「请关闭其他标签页」 |
| 旧 JSON 导入的行没有 `uid` | ❌ 不丢，但**永不参与同步** | 用旧导出文件导入（`importAllData` 直接 `add`/`bulkAdd`，绕过 `Answer.save`） | 导入时补 `uid` |
| `Answer.toJSON()` 漏 `uid` | ❌ 不丢，但**静默退出同步** | 答错重试（`put` 整行替换，白名单里没 `uid` 就抹掉） | 白名单补 `uid` + 单测「重试后 uid 不变」 |
| 唯一索引冲突 | ❌ 不丢（写入直接报错，可见） | `uid` 重复（概率极低） | 单测覆盖；迁移自检「每行 uid 唯一」 |

**三个前置动作**（缺一不可）：

1. **先修导出完整性**：现有 `exportAllData` 按 `sessionId` 查答案，诊断孤儿答案（无 `sessionId`）不会被导出 —— 拿它做迁移前备份是不完整的。P0a 先把导出补全（孤儿答案 + 按 `practiceSessionId` 兜底）。
2. **迁移自检**：升级后核对行数与升级前一致、逐表校验「每行有非空 `uid`」；不一致 → 顶部错误提示，不静默继续。
3. **不可逆说明写进验收**：迁移只在备份上验证过、且双标签场景测过之后才合入。

> 补充：P0/P0a 不接网，**不存在「远端覆盖本地」**的通道；第一次可能出现 remote → local 的写入是 P1 的首次同步（首台设备远端为空，只会 push）。

---

## 6. 部署与代理

```js
// vite.config.js
server: {
  port: 8080, host: true, strictPort: true,
  proxy: {
    '/sync': {
      target: process.env.SYNC_SERVER_URL || 'http://127.0.0.1:4010',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/sync/, ''),
    },
  },
}
```

```yaml
# docker-compose.yml（对齐 spellwell）
environment:
  - SYNC_SERVER_URL=http://helix:4010
extra_hosts:
  - "helix:host-gateway"
```

- 生产 nginx（可选）：`location /sync/ { proxy_pass http://127.0.0.1:4010/; }`。
- GitHub Pages：构建脚本设 `VITE_SYNC_ENABLED=0`，`start()` 不启动，设置页显示「当前部署不支持同步」；本地数据照常可用。

---

## 7. 账号与配对 UX

| 场景 | 流程 |
|---|---|
| 首台设备 | 设置 → 同步 → 创建 / 加入：填 `projectId` + 用户名（或一次性 bootstrap 码） |
| 第二台设备 | 首台生成 6 位配对码（600s）→ 第二台输入 → `preferRemoteOnFirstBind = true`，首绑直接采用云端数据 |
| 日常 | 自动同步；设置页可「立即同步」、查看最后同步时间、生成配对码、解绑 |

状态映射（SDK → 中文）：

| SDK state | 文案 |
|---|---|
| `unconfigured` | 未启用同步 |
| `idle` + `!pending` | 已同步 |
| `syncing` | 同步中… |
| `synced` | 已同步（时间） |
| `offline` | 离线，稍后自动重试 |
| `unauthorized` | 需重新配对 |
| `error` | 同步失败（保留本地数据，可手动重试） |

- `projectId` 存 localStorage（`psm.snapshotSync.projectId`），**不写进仓库**；bootstrap 码只进内存。
- 与 SpellWell 的差异：SpellWell 把 `SYNC_PROJECT_ID` 硬编码在 `src/sync/config.js` 并提交；PSM 为公开仓库，projectId 是 join capability，不入库。

---

## 8. 分阶段执行计划

| 阶段 | 内容 | 交付 / 验收 | 估时 |
|---|---|---|---|
| **P0a 备份前置** | 修 `exportAllData` 完整性（含孤儿答案 / 按 pid 兜底）；人工导出一份完整备份 | 导出文件含全部 answers（与 `DB.answers.count()` 一致） | 0.25d |
| **P0b 数据层前提** | Dexie v6 + `uid` 迁移；`Answer.toJSON` 白名单补 `uid`；`versionchange`/`blocked` 处理；`importAllData` 补 `uid`；迁移自检 | vitest：迁移前后行数一致、每行 uid 唯一非空、重试后 uid 不变、旧文件导入补 uid；双标签升级不卡死；现有 255 用例全绿 | 0.5d |
| **P0c 快照适配** | `exportAll/importAll` + merge 策略（不接网） | vitest：往返一致、重复导入幂等、`schemaVersion` 不匹配拒绝 | 0.25d |
| **P1 通道打通** | vendored SDK（`src/sync/`）+ vite proxy + 设置页最小状态 +「立即同步」 | 单设备：创建用户 → 答题 → 同步 → `revision` 增长；console 零错误 | 0.5d |
| **P2 自动同步** | `markDirty` 接三个写入点 + 调度（120s / 在线 / 可见）+ 状态点 | 断网答题不阻塞；恢复后自动补同步；多标签不并发推 | 0.5d |
| **P3 双设备** | 配对流程 + 首绑 + 冲突收敛 + 删除策略落地（重置前断开同步） | Playwright 双 context：A 写 → B 见；同轮冲突收敛；`/reset` 不复活 | 1d |
| **P4 收尾** | 容量 / 字段裁剪、`data/` 备份、文档 §18 补记、部署说明 | 快照 < 1MB；`IMPLEMENTATION_HISTORY` 有实施记录；`README` 部署章节更新 | 0.5d |

每阶段独立可合入：P0a/P0b/P0c/P1 无用户可见变化，P2/P3 才有。

> **进度（2026-11-25）**：P0a–P4 全部落地；另补 P5「配置同步」（localStorage 配置纳入快照），实施记录见 [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md) §19–§24。后续可选：删除传播（墓碑）、浏览器级并发冲突演练、超限快照自动裁剪。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 自增 `id` 跨设备冲突 | 数据串轮 / 覆盖 | `uid` + `lww`（P0b 解决） |
| **DB 版本不可降级** | 回滚代码后应用打不开 | 上线前完整备份；文档写明单向升级（见 §5.6） |
| 多标签阻塞 v6 升级 | 应用卡住 | `versionchange` 自动关闭连接 + `blocked` 提示（P0b） |
| 删除复活 | 家长困惑 | 重置前断开同步 + 文案；阶段二墓碑 |
| 8MB 上限 | 同步停摆 | 不同步 `questions`；答案只存必要字段；超限提示「数据过大」 |
| 单点服务 / `data/` 丢失 | 同步中断 | `data/` 纳入 Timeshift / rsync；健康检查 |
| LAN http 非安全上下文 | `randomUUID` / `locks` 不可用 | uid 降级；多标签退化为无锁 |
| token 泄露 | 他人写入 | 默认 cookie 模式（`storeToken:false`）；凭据不进快照 |
| 设备时钟偏移 | `lww` 选错 | 家庭设备 NTP；平局保留 remote（SDK 默认） |
| 诊断孤儿答案跨设备重复 | 统计微偏 | 后续给诊断轮补 pid；短期接受 |

---

## 10. 已确认的决策（2026-11-25）

| 决策点 | 结论 |
|---|---|
| projectId 来源 | **新建项目**。服务端 bootstrap 生成 `proj_6pYzoEk4Hx66DtWzyQ-DWA`，预置进 `src/sync/config.js`，之后固定绑定本项目 |
| 删除语义 | 阶段一「只增不删 + 重置前断开同步」 |
| `questions` | **不同步**（可由 answers 推导） |
| 部署目标 | 暂时只保证家庭局域网（4003 + 反代） |
| 首次配对 | 预置 projectId + 用户名（零运维）。首台设备自动注册；后续设备用一次性配对码加入同一用户 |

---

## 11. 参考：SpellWell 的接入方式（不照抄的原因）

| 维度 | SpellWell | PSM（本方案） |
|---|---|---|
| 同步逻辑 | 自写 `SyncManager`（~200 行） | 官方 `createSnapshotSync`（vendored，不改） |
| 服务 | `tools/serve.mjs` 静态服务 + `/sync` 反代 | vite dev server proxy（compose 本身就是 vite） |
| projectId | 硬编码进仓库 | 运行时配置（localStorage / 一次性 bootstrap） |
| 定位 | 内容后台 + 多编辑器 | 单孩子练习数据 |

---

## 12. 一句话验收

两台设备各练几轮 → 任意一台打开都能看到对方新增的轮次、答案不丢不串、`/reset` 前有明确选择；断网时照常答题、恢复后自动补齐；console 零错误。
