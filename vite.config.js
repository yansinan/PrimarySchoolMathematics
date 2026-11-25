import path from "path";
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createHtmlPlugin} from "vite-plugin-html";
import {viteStaticCopy} from "vite-plugin-static-copy";

const srcPath = path.resolve(__dirname, 'src')

export default defineConfig({
    server: {
        port: 8080, // 指定开发服务器端口
        host:true, // 允许外部访问
        strictPort: true, // 如果端口被占用则直接退出，而不是尝试下一个可用端口
        // 同源反代到自建快照同步服务（indexDB-snapshot-sync）。
        // 走同源是为了 HttpOnly cookie 能用：浏览器只对设置它的 origin 发 cookie。
        // 家庭 compose 里用 SYNC_SERVER_URL=http://helix:4010 覆盖默认值。
        proxy: {
            '/sync': {
                target: process.env.SYNC_SERVER_URL || 'http://127.0.0.1:4010',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/sync/, ''),
            },
        },
    },
    watch:{
        usePolling: true, // 使用轮询方式监听文件变化
    },
    allowHosts: true, // 允许所有主机访问
    resolve: {
        alias: {
            '@/': `${srcPath}/`,
        }
    },
    plugins: [
        vue(),
        createHtmlPlugin({
            inject: {
                data: {
                    title: '小学数学口算题 | Primary School Mathematics'
                }
            }
        }),
        viteStaticCopy({
            silent: true,
            targets: [
                {
                    src: 'dist/*',
                    dest: path.resolve(__dirname, 'docs')
                }
            ]
        })
    ],
    base:'./',
    build: {
        chunkSizeWarningLimit: 1500,
    },
})
