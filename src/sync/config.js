/**
 * 快照同步配置（C/S 共用常量）
 *
 * projectId 由 indexDB-snapshot-sync 在 2026-11-25 bootstrap 时生成，之后固定绑定本项目
 * （dr 的决定：预置 projectId + 用户名，零运维）。
 *
 * 它是「项目 join capability」：知道它就能在本项目下创建一个新的**用户命名空间**，
 * 但读不到别人的快照。服务只在家用局域网内可达，故预置在此。
 *
 * 首次配对：
 *  - 首台设备用 projectId + SYNC_USER_NAME 自动注册（服务端生成 userId/namespace）；
 *  - 后续设备在主设备生成一次性配对码，enroll({ pairingCode }) 加入**同一个**用户。
 *    注意：后续设备不能再用 projectId 注册，否则会建出一个新的空用户。
 *
 * @see designDocs/15-PLAN-snapshot-sync.md §7
 */

/** 同源反代前缀（vite server.proxy → 127.0.0.1:4010） */
export const SYNC_BASE_URL = '/sync'

/** 本项目在同步服务上的项目 id（已创建，勿改） */
export const SYNC_PROJECT_ID = 'proj_6pYzoEk4Hx66DtWzyQ-DWA'

/** 首台设备自动注册时使用的用户名（家庭单孩子场景） */
export const SYNC_USER_NAME = '孩子'
