import { DEFAULT_CONFIG_ROW } from "../form/formDefaults"


export default class {
  key = 'customer-config'

  constructor() {

  }

  #getConfigurations() {
    const stringValue = localStorage.getItem(this.key)
    return stringValue && JSON.parse(stringValue)
  }

  #setConfigurations(configurations) {
    localStorage.setItem(this.key, JSON.stringify(configurations))
  }

  /** @deprecated 空方法，无任何调用 → 后续 PR 删除 */
  load() { }

  loadAll() {
    const configurations = this.#getConfigurations()
    if (configurations) {
      return configurations
    } else {
      // 兜底配置统一从 formDefaults.DEFAULT_CONFIG_ROW 派生
      const initConfiguration = [DEFAULT_CONFIG_ROW]
      this.#setConfigurations(initConfiguration)
      return initConfiguration
    }
  }

  save(id, name, configuration) {
    const configurations = this.#getConfigurations()
    configurations.push({ id, name, data: configuration })
    this.#setConfigurations(configurations)
  }

  remove(id) {
    const configurations = this.#getConfigurations()
    const index = configurations.findIndex(p => p.id == id)
    configurations.splice(index, 1)
    this.#setConfigurations(configurations)
  }

  clear() {
    localStorage.removeItem(this.key)
  }
} 