# UMM - 多媒体管理器 (Chrome Extension)

基于 Vue 3 + TypeScript + shadcn/ui 开发的现代 Chrome 浏览器扩展,用于管理多平台观影/收听记录。

## 功能特性

### 🎯 核心功能
- **多平台支持**: 支持豆瓣电影/音乐、IMDB、NeoDB、TMDB
- **快速标记**: 在浏览页面时快速标记状态(已完成/想看/未标记)
- **评分管理**: 为每个项目添加 0-10 的评分
- **悬浮面板**: 优雅的悬浮 UI,可拖拽、最小化
- **数据同步**: 使用 Chrome Storage 自动保存数据
- **智能识别**: 自动识别当前页面的媒体信息

### 📊 数据管理
- **本地存储**: 所有数据保存在本地,保护隐私
- **云端同步**: 支持 WebDAV 自动备份和同步
- **元数据增强**: 集成 NeoDB API 自动获取评分和详情
- **导入导出**: 支持数据的导入和导出
- **隔离区机制**: 自动处理无效或待验证的记录
- **智能合并**: 更新记录时自动保留最新数据

### 🎨 用户体验
- **响应式设计**: 适配不同屏幕尺寸
- **完整主题系统**: 支持亮色/暗色/跟随系统三种模式，零闪烁切换
- **Bioluminescent Glow**: 暗色模式下独特的生物发光效果
- **流畅动画**: 平滑的过渡效果
- **友好提示**: 清晰的状态反馈和通知

## 技术栈

- **框架**: Vue 3 (Composition API) + TypeScript
- **构建工具**: Vite + @crxjs/vite-plugin
- **UI 组件**: shadcn/ui + Tailwind CSS
- **图标**: Lucide Icons
- **架构**: Manifest V3 (Service Worker + Content Scripts + Popup)

## 使用说明

### 📥 安装扩展

1. **构建项目**
   ```bash
   npm run build
   ```

2. **加载到 Chrome**
   - 打开 Chrome 浏览器,访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `dist` 目录

### 🎬 使用悬浮面板

1. **访问支持的网站**
   - 豆瓣电影: `movie.douban.com/subject/*`
   - 豆瓣音乐: `music.douban.com/subject/*`
   - IMDB: `imdb.com/title/*`
   - NeoDB: `neodb.social/movie/*/`, `neodb.social/tv/*/`, `neodb.social/music/*/`
   - TMDB: `themoviedb.org/movie/*`, `themoviedb.org/tv/*`

2. **操作面板**
   - 面板会自动出现在页面右上角
   - 可以拖拽面板到任意位置
   - 点击最小化按钮隐藏内容
   - 点击关闭按钮关闭面板

3. **标记状态**
   - 点击"已完成"、"想看"或"清除"按钮
   - 调整评分(0-10,步长 0.5)
   - 点击"保存"按钮

4. **查看统计**
   - 点击浏览器工具栏的 UMM 图标
   - 查看所有记录的统计信息
   - 搜索和过滤记录

### 💾 数据管理

所有数据自动保存在 Chrome Storage 中,无需手动保存。

## 主题系统

UMM 现已升级为**完整的三层令牌架构主题系统**，基于 Radix UI Colors + Material Design 3。

### ✨ 核心特性

- ✅ **三种主题模式**: 亮色 / 暗色 / 跟随系统
- ✅ **FOWT 防护**: Flash of Wrong Theme - 零闪烁主题切换
- ✅ **WCAG 2.1 AA/AAA 合规**: 文字对比度 ≥ 4.5:1
- ✅ **Bioluminescent Glow**: 暗色模式下的生物发光效果
- ✅ **Tonal Elevation**: 暗色模式使用 lighter surface 替代阴影
- ✅ **Atmospheric Colors**: 海洋/天空/生物发光配色

### 📚 文档

- **完整技术文档**: [THEME_SYSTEM.md](./THEME_SYSTEM.md) - 架构设计、颜色系统、最佳实践
- **快速参考指南**: [THEME_QUICK_REFERENCE.md](./THEME_QUICK_REFERENCE.md) - CSS 变量速查表、代码片段

### 🎯 使用方法

在设置页面中可以切换主题：

1. 点击浏览器工具栏的 UMM 图标打开 Popup
2. 进入「⚙️ 设置」标签页
3. 在「主题外观」区域选择：
   - 🌗 **自动**: 跟随系统主题
   - ☀️ **亮色**: 强制亮色模式
   - 🌙 **暗色**: 强制暗色模式
4. 点击「应用主题」按钮保存

主题切换会立即生效，无需刷新页面！

---

## 开发指南

### 环境要求

- Node.js >= 18
- npm >= 9
- Chrome >= 88

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

**注意**: 构建过程中会自动执行 postbuild 脚本，该脚本会：
- ✅ 复制图标文件到 `dist/icons/` 目录
- ✅ 修复 popup.html 中的资源路径
- ✅ 修正 Background Service Worker loader

### 加载到 Chrome

1. 打开 Chrome 浏览器,访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist` 目录

## 项目结构

```
um-multimedia-manager/
├── manifest.json              # 扩展配置
├── components.json            # shadcn/ui 配置
├── src/
│   ├── background/            # Service Worker
│   │   └── index.ts
│   ├── content/               # Content Scripts
│   │   └── index.ts           # 悬浮面板主逻辑
│   ├── popup/                 # Popup 界面
│   │   ├── App.vue            # 主应用组件
│   │   └── main.ts
│   ├── shared/                # 共享模块
│   │   ├── config.ts          # 配置常量
│   │   ├── types/             # TypeScript 类型定义
│   │   ├── models/            # 数据模型
│   │   │   ├── identity.ts    # URL 身份识别
│   │   │   ├── record.ts      # 记录处理
│   │   │   └── store.ts       # 存储管理
│   │   └── utils/             # 工具函数
│   ├── lib/
│   │   └── utils.ts           # UI 工具函数
│   ├── components/            # UI 组件
│   │   └── ui/                # shadcn/ui 组件
│   └── style.css              # 全局样式
├── icons/                     # 图标资源
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## 从 Tampermonkey 迁移

本扩展是 [um-multimedia-manager.js](https://github.com/UnforgetMemory/Tampermonkey-Scripts/blob/main/um-multimedia-manager.js) 的现代化重构版本,主要改进:

- ✅ Manifest V3 架构,符合 Chrome 最新规范
- ✅ TypeScript 类型安全
- ✅ 模块化设计,可维护性更强
- ✅ 现代化 UI (shadcn/ui + Tailwind)
- ✅ 更好的性能和用户体验

## 开发进度

### ✅ 已完成
- [x] Step 1: 项目初始化 - Vue 3 + TypeScript + Vite + CRX
- [x] Step 2: 核心数据层 - Config, Types, Identity, RecordModel, Store
- [x] Step 3: UI 组件库 - shadcn/ui 集成,基础组件
- [x] Step 4: Popup 界面 - 数据展示、搜索过滤
- [x] Step 5: Content Script - 悬浮面板、快速标记
- [x] Step 6: Background Service Worker - 消息处理、定时任务
- [x] Step 7.1: WebDAV 同步 - 云端备份和同步
- [x] Step 7.2: NeoDB API 集成 - 元数据增强

### 🚧 进行中
- [ ] Step 8.2: 单元测试编写
- [ ] Step 8.3: 性能优化

详细进度请查看 [PROGRESS.md](./PROGRESS.md)

## 许可证

GNU GPLv3

## 贡献

欢迎提交 Issue 和 Pull Request!

## 致谢

原始灵感来自 [UMM Tampermonkey Script](https://github.com/UnforgetMemory/Tampermonkey-Scripts)
