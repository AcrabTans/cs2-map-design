# 第三方组件说明

本文件为组件位置索引，不替代各组件原始许可证。

| 组件 | 位置与声明 |
| --- | --- |
| Electron 45.2.1 / Chromium / Node.js | 根目录 LICENSE、LICENSES.chromium.html；运行库随包携带 |
| Three.js | docs/licenses/Three.js-LICENSE.txt；代码合并在 resources/app/index.html |
| Python 3.13 运行环境及 Tcl/Tk | tools/资产提取器/runtime/python/LICENSE.txt，及 tcl、Lib 对应组件目录 |
| NumPy、Shapely | Python 运行环境 Lib/site-packages 下的 dist-info、licenses 等原始声明 |
| UnityPy 及其依赖 | tools/资产提取器/依赖/python 下的 dist-info、licenses 等原始声明 |
| Meshoptimizer 解码器 | tools/资产提取器/依赖/vendor 下源文件中的版权与许可证声明 |

Python 包名、版本、元数据位置见 docs/THIRD_PARTY_COMPONENTS.json。依赖目录中的原始声明文件一并保留。

本仓库根目录 LICENSE 为本项目 MIT 许可证，APPLICATION_LICENSE.txt 为同一协议副本。Electron 原始许可见 docs/licenses/Electron-LICENSE.txt。v0.1.0 运行包根目录 LICENSE 仍是 Electron 的许可，应用许可另附于 Release。其他依赖保留原始版权和许可，不因本项目采用 MIT 而改变。发布包内置本体建筑派生数据，不含原始游戏资源包或第三方模组资产。


本版附带从本机游戏提取的本体建筑二维轮廓及部分 LOD2 派生数据；相关权利归游戏及资产原权利人所有，不属于本项目 MIT 程序代码的许可范围。未附带原始 .cok 游戏资源包或第三方模组资产。

当前 main 分支还附带 DLC 及官方地区资产包的派生投影和可用 LOD2，相关权利归游戏及资产原权利人，不属于本项目 MIT 程序许可。没有附带原始 COK、个人工程或第三方导入资产。
