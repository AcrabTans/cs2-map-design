# Windows 构建与打包

在本目录执行 `npm test` 和 `npm run build`，然后执行 `cargo build --locked --release --manifest-path src-tauri/Cargo.toml`。Windows 构建需要 Rust 与对应的 C++ 工具链。常规 MSVC 构建可使用 Visual Studio Build Tools。GNU 构建需提供适配的 MinGW 编译器和 windres，并指定 `--target x86_64-pc-windows-gnu`。

`src` 是地图与 3D 视图前端，`src-tauri` 是 Windows 宿主，`dist` 是生成网页。构建后执行 `python package-release.py --binary <map-design.exe路径> --cargo-cache <Cargo缓存路径>`，在项目相邻的 `releases` 目录生成独立目录、ZIP 和校验值。Cargo 缓存用于收录依赖许可。GNU 构建的 WebView2Loader.dll 会一并复制。首次运行若缺少 WebView2，程序会提示打开微软下载页。

绿色版 ZIP 提供空的 `lod` 和 `projects` 目录。官方 GLB 可作为独立 Release 附件下载，放到 `lod` 即可使用。

离线网页单独使用 `node build-offline.mjs --output <路径>` 生成。项目文件、底图和用户导入的资产存放在自己的项目目录。独立资产提取器在仓库根目录的 `tools/资产提取器`。
