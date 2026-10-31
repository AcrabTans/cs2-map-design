Map Design Portable 0.1

界面源码src、测试tests、构建脚本build-offline.mjs。桌面主进程及preload位于../resources/app。
运行测试：node --test tests/*.test.mjs
重新构建：node build-offline.mjs --output ../resources/app/index.html --storage-key map-design-portable-v1

desktop-runtime.js提供原生文件适配和轻量撤销快照；native-lod.js只读GLB目录，几何按accessor范围读取。
主进程使用系统选择对话框和不透明文件令牌；资源文件只读，工程/项目目录授权写入，写入采用临时文件替换。
沙箱及contextIsolation保持开启，renderer不暴露Node.js，禁止跳转到外部页面。
本版独立模型引用通过project-file.js externalLods字段保存，旧项目嵌入的GLB可导入迁移。
