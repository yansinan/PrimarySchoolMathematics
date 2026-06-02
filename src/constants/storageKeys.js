/**
 * localStorage / 持久化 key 集中管理
 *
 * 避免 key 散落在 stores 中难以检索和重构。
 * 命名规范：LS_KEY_<模块>_<用途>
 */

/** 持久化的诊断状态（profile + phase） */
export const LS_KEY_PSM_PROFILE = 'psm_profile'

/** 配置存储（configStorage.js 暂未集中，先占位） */
// export const LS_KEY_CONFIGS = 'psm_configs'

/** 用户偏好（音量、动画等暂未涉及，预留） */
// export const LS_KEY_PREFERENCES = 'psm_preferences'
