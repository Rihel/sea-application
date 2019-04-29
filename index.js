import Vue from 'vue'
import Vuex from 'vuex'
import VueRouter from 'vue-router'
import axios from 'axios'
let app = null
const throwError = msg => {
  throw new Error(msg)
}
const deepClone = obj => {
  return JSON.parse(JSON.stringify(obj))
}
const makeStore = stores => {
  const s = stores.filter(parent => {
    const children = stores.filter(child => child.parentName === parent.name)
    if (children.length) {
      parent.store.modules = children.map(item => {
        let moduleStore = deepClone(item.store)
        delete moduleStore.modules
        return {
          store: { ...moduleStore, namespaced: true },
          name: item.name
        }
      }).reduce((val, cur) => {
        val[cur.name] = cur.store
        return val
      }, {})
    }
    return !parent.parentName
  }).map(item => {
    return {
      store: { ...item.store, namespaced: true },
      name: item.name
    }
  }).reduce((val, cur, index) => {
    val[cur.name] = cur.store
    return val
  }, {})
  return s
}
const makeRoutes = (routes) => {
  return routes.filter(parent => {
    const children = routes.filter(child => child.parentName === parent.name)
    if (children.length) {
      if (!parent.route.children) {
        parent.route.children = []
      }
      parent.route.children = [...parent.route.children, ...children.map(item => item.route)]
    }
    return !parent.parentName
  }).map(item => item.route)
}

export default class Application {
  constructor() {
    this._status = 'stop'
    this.modules = []
    this.router = new VueRouter()
    this.store = null
    this.service = axios.create()
  }
  // 添加模块
  addModule(module) {
    this._addModule(module)
    return this
  }
  /**
  * 请求拦截器
  * @param {Functon} resolve 成功
  * @param {Function} reject 拒绝
  */
  serviceRquestInterceptor(resolve, reject) {
    this.service.interceptors.request.use((config) => {
      const result = resolve(config, this)
      return result
    }, reject)
    return this
  }
  /**
   * axios响应拦截器
   * @param {Functon} resolve 成功
   * @param {Function} reject 拒绝
   */
  serviceRqsponseInterceptor(resolve, reject) {
    this.service.interceptors.response.use((response) => {
      const result = resolve(response, this)
      return result
    }, reject)
    return this
  }
  /**
   * 设置服务前缀
   * @param {String} prefix 服务前缀
   */
  setServicePrefix(prefix = '/') {
    this.service.defaults.baseURL = prefix
    return this
  }

  // 判断待注册模块是否存在
  _isExistModule(name) {
    return this.modules.some(item => item.name === name)
  }
  // 添加模块递归
  _addModule(module) {
    const { name, children = [] } = module
    if (!name) throwError('Module must have name option!')
    if (this._isExistModule(name)) {
      throwError(`[ module ] ${name} already exist.`)
    } else {
      this.modules.push(module)
      if (children.length) {
        for (let i = 0; i < children.length; i++) {
          const m = children[i]
          m.parentName = name
          this._addModule(m)
        }
      }
    }
  }

  _makeService(services) {
    // 服务名称生成规则： $模块名Service
    services.forEach(this._injectService.bind(this))
  }
  _injectService({ name, data }) {
    this.extendVue(`$${name}Service`, data)
  }

  /**
   * 扩展vue原型链
   *
   * @param {String} key 名称
   * @param {any} value 值
   */
  extendVue(key, value) {
    Vue.prototype[key] = value
    return this
  }
  /**
   * 开始创建
   */
  static start() {
    if (!app) {
      app = new Application()
    }
    return app
  }
  get _routes() {
    return this.modules.map(item => {
      return ({
        name: item.name,
        parentName: item.parentName,
        route: item.route
      })
    })
  }
  get _store() {
    return this.modules.map(item => {
      return ({
        name: item.name,
        parentName: item.parentName,
        store: item.store
      })
    })
  }
  get _services() {
    return this.modules.map(item => {
      return {
        name: item.name,
        data: item.service && item.service(this.service)
      }
    }).filter(item => item.data)
  }

  /**
   * 运行程序
   * @param {VueComponent} rootComponent 根组件
   */
  run(rootComponent) {
    this._makeService(this._services)
    const routes = makeRoutes(this._routes)
    const storeModules = makeStore(this._store)
    const storeOptions = {
      modules: storeModules
    }
    Vue.use(VueRouter)
    Vue.use(Vuex)
    this.router.addRoutes(routes)
    this.store = new Vuex.Store(storeOptions)
    this.extendVue('$app', this)
    new Vue({
      router: this.router,
      store: this.store,
      render: h => h(rootComponent)
    }).$mount('#app')
    this._status = 'start'
    return this
  }
  /**
   * 添加路由守卫函数
   * @param {Function} fn 路由守卫函数
   * @returns {Application}
   */
  addRouterGuard(fn) {
    fn(this.router)
    return this
  }
}
