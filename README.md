# UMM - 多媒体管理器 (Chrome Extension)

基于 Vue 3 + TypeScript + shadcn/ui 开发的现代 Chrome 浏览器扩展,用于管理多平台观影/收听记录。

## 功能特性

- **多平台支持**: 豆瓣、IMDB、NeoDB、TMDB
- **快速标记**: 悬浮面板一键标记状态和评分
- **数据同步**: WebDAV 云端备份与 ZIP 格式导入导出
- **元数据增强**: NeoDB API 自动获取评分
- **主题系统**: 亮色/暗色/跟随系统模式

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

构建产物将输出到 `dist/chrome-mv3` 目录。

### 加载到 Chrome

1. 打开 Chrome 浏览器,访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist/chrome-mv3` 目录

## 项目结构

```
um-multimedia-manager/
├── wxt.config.ts              # WXT 配置（替代 manifest.json）
├── components.json            # shadcn/ui 配置
├── src/
│   ├── entrypoints/           # WXT 入口点
│   │   ├── background.ts      # Service Worker
│   │   ├── content.ts         # Content Script
│   │   └── popup/             # Popup UI
│   │       ├── main.ts
│   │       └── App.vue
│   ├── content/               # Content Script 业务逻辑
│   │   ├── router.ts          # URL 路由器
│   │   ├── handlers/          # 页面处理器
│   │   ├── styles/            # 样式注入
│   │   └── utils/             # 工具函数
│   ├── shared/                # 共享模块
│   │   ├── config.ts          # 配置常量
│   │   ├── types/             # TypeScript 类型定义
│   │   ├── models/            # 数据模型
│   │   │   ├── identity.ts    # URL 身份识别
│   │   │   ├── record.ts      # 记录处理
│   │   │   ├── database.ts    # IndexedDB 数据库
│   │   │   └── migration.ts   # 数据迁移
│   │   ├── api/               # API 客户端
│   │   │   ├── webdav.ts      # WebDAV 同步
│   │   │   └── neodb.ts       # NeoDB API
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



## 许可证

GNU GPLv3

## 贡献

欢迎提交 Issue 和 Pull Request!
