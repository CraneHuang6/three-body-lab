# 三体实验室

一个以《三体》为灵感的桌面互动项目。

它不是专业天体模拟器，更像一个可观看、可上手调参的“科幻演示实验室”。

## 这是什么

项目目前有两种体验：

- `观演模式`：直接播放整理好的八大天象演示，适合展示和沉浸观看
- `实验室模式`：手动调整 4 个天体的参数，观察轨迹、碰撞和画面变化

如果你只是想快速理解这个项目，可以把它当成：

- 一个《三体》风格的动态演示作品
- 一个可以自己“拨动宇宙参数”的小实验

## 适合谁

- 喜欢《三体》题材和科幻视觉的人
- 想做演示、展示或概念验证的人
- 想继续开发这个项目的前端/Electron 开发者

## 如何开始

先安装依赖：

```bash
npm install
```

启动网页开发模式：

```bash
npm run dev:web
```

如果要同时启动桌面壳：

```bash
npm run dev
```

打开后，首页可以选择：

- `观演模式`
- `实验室模式`

## 常用命令

```bash
npm run dev:web   # 只启动网页界面
npm run dev       # 启动网页界面 + Electron 桌面壳
npm run build     # 构建前端产物
npm test          # 运行测试
```

## 打包说明

如果你只是体验项目，通常不需要打包。

需要生成桌面安装包时可用：

```bash
npm run package:mac
npm run package:win
```

如果要一次性生成当前脚本支持的发布产物，可运行：

```bash
npm run package:release
```

当前机器上已知有两个限制：

- 外接磁盘环境下直接处理 `node_modules` 可能不稳定
- `dmg` 和部分 Electron 打包步骤需要更高的系统权限

## 项目结构

- `src/App.jsx`：首页和模式切换入口
- `src/modes/StoryScene.jsx`：观演模式
- `src/modes/LabMode.jsx`：实验室模式
- `src/lib/simulation.jsx`：仿真逻辑
- `src/lib/labState.js`：实验室参数状态
- `electron/`：桌面壳
- `tests/`：测试文件

## 一句话总结

这是一个把《三体》视觉演示和可调参数实验放在一起的桌面项目，既能看，也能自己动手试。
