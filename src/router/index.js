import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
    {
        path: '/',
        redirect: '/home'
    },
    {
        path: '/home',
        name: 'home',
        component: () => import('../views/Layout.vue'),
    },
    {
        path: '/print',
        name: 'print',
        props: true,
        component: () => import('../views/Print.vue'),
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('../views/TestView.vue'),
    },
    {
        path: '/reset',
        name: 'reset',
        component: () => import('../views/ResetData.vue'),
    }
];


const baseUrl = import.meta.env.BASE_URL
export const router = createRouter({
    history: createWebHistory(baseUrl),
    // history: createWebHashHistory(),
    routes,
})

// E3: 兜底清理 /print 路由的 sessionStorage print 临时数据
// 避免用户关闭 tab / 强退时 onUnmounted 不触发的残留
// (路径 4: sessionStorage + key in query)
router.beforeEach((to, from) => {
    if (from.path === '/print' && from.query.key && to.path !== '/print') {
        try { sessionStorage.removeItem(from.query.key) } catch {}
    }
})