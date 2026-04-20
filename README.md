# 三体实验室

《三体》主题的电影化桌面实验项目。现在包含两种体验：

- `观演模式`：延续原始的八大天象分镜演示
- `实验室模式`：通过右侧控制舱分别调整 4 个天体的初始条件与视觉参数

## 当前结构

- `src/App.jsx`：桌面版首页与模式切换入口
- `src/modes/StoryScene.jsx`：观演模式场景
- `src/modes/LabMode.jsx`：实验室模式与控制舱
- `src/lib/animations.jsx`：时间轴与播放控件
- `src/lib/simulation.jsx`：仿真核心与预设场景缓存
- `src/lib/labState.js`：实验室状态、随机化与预设映射
- `electron/`：Electron 主进程与 preload
- `tests/`：Vitest 单测

## 开发运行

安装依赖：

```bash
npm install
```

启动前端开发环境：

```bash
npm run dev:web
```

构建前端产物：

```bash
npm run build
```

运行测试：

```bash
npm test
```

## 桌面打包

桌面壳基于 Electron，脚本已预留：

```bash
npm run package:mac
npm run package:win
```

如果要一次性生成当前已验证过的 4 类产物，可以直接跑：

```bash
npm run package:release
```

它会做这些事：

- 把当前仓库同步到 `/tmp/threebody-build`
- 用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 安装依赖
- 断点续传下载已验证过 checksum 的 Electron 运行时压缩包
- 运行 `npm test` 与 `npm run build`
- 生成
  - `macOS arm64 zip`
  - `macOS arm64 dmg`
  - `Windows arm64 portable`
  - `Windows arm64 NSIS`
- 把产物收集到仓库的 `release/` 目录

### 当前机器的已知限制

- 仓库所在外接卷上直接处理 `node_modules` 不稳定，所以脚本默认在 `/tmp` 副本里构建。
- `dmg` 依赖 `hdiutil`，在当前 Codex 沙箱中会失败；真实运行时需要有系统级执行权限。
- Windows 打包会写 `~/Library/Caches/electron-builder`，在当前 Codex 沙箱中也会失败；真实运行时需要有系统级执行权限。

如果安装阶段遇到 Electron binary 下载中断，可先设置：

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install
```

这允许先完成前端测试与构建；真正的桌面打包需要 Electron 二进制下载成功。
