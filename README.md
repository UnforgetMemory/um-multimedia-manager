<p align="center">
  <a href="README.en.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="UMM Logo" width="128" height="128">
</p>

<h1 align="center">UMM — 多媒体管理器</h1>

<p align="center">
  <a href="https://github.com/um-2023/um-multimedia-manager/releases"><img src="https://img.shields.io/badge/version-5.4.0-blue?logo=git" alt="Version"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Chrome-88%2B-brightgreen?logo=googlechrome" alt="Chrome"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest_V3-orange?logo=googlechrome" alt="MV3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-green?logo=apache" alt="License"></a>
  <a href="https://ko-fi.com/unforgetmemory"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi" alt="Ko-fi"></a>
</p>

<p align="center">
  <b>一款 Chrome 扩展，帮你统一管理豆瓣、IMDb、NeoDB、TMDB 及 PT 站点的观影和收听记录，支持跨平台同步、PT 种子自动淡化、WebDAV 云端备份。</b>
</p>

<p align="center">
  <sub>Vue 3 · TypeScript · WXT · Tailwind CSS v4</sub>
</p>

---

## 功能特性

| | |
|---|---|
| 🎯 **跨平台标记** | 在豆瓣、IMDb、NeoDB、TMDB 页面一键标记状态和评分 |
| 🔗 **ID 关联** | 自动建立多平台 ID 映射，一份记录关联所有平台 |
| 🌙 **PT 自动淡化** | 已看种子在支持的 PT 站点自动置灰 |
| 📦 **WebDAV 备份** | 自动备份到任意 WebDAV 服务器，支持 ZIP 导出/导入 |
| 🧩 **NeoDB 集成** | 从 NeoDB 拉取评分元数据，支持推送评分 |
| 🎨 **主题切换** | 亮色、暗色、跟随系统三种主题 |
| 📊 **统计看板** | 弹窗概览 + 完整选项页（热力图、分布图、评分管理） |
| 🔞 **成人内容支持** | 统一管理 JavDB、Sehuatang 的观看记录 |
| 🌐 **国际化** | 中英文双语支持 |

## 支持的站点

| 类型 | 站点 |
|------|------|
| 影视 | `movie.douban.com` `imdb.com` `neodb.social` `themoviedb.org` |
| 音乐 | `music.douban.com` `neodb.social/album` |
| 书籍 | `book.douban.com` |
| 游戏 | `game.douban.com` |
| PT 站点 | M-Team、Audiences、HDHome、HDArea、OurBits、PTerClub 等 |
| 成人 | JavDB、Sehuatang |

## 快速开始

```bash
git clone https://github.com/UnforgetMemory/um-multimedia-manager.git
cd um-multimedia-manager
npm install
npm run build
```

在 Chrome 的 `chrome://extensions/` 中开启开发者模式，加载 `dist/chrome-mv3` 目录。

## 配置

### WebDAV 备份

在扩展设置面板中配置：

| 字段 | 说明 |
|------|------|
| 服务器地址 | WebDAV 服务地址（如 `https://example.com/remote.php/dav/`） |
| 用户名 | WebDAV 登录用户名 |
| 密码 | WebDAV 密码或应用专用密码 |

### NeoDB Token

1. 登录 [NeoDB](https://neodb.social)
2. 在个人设置中生成 API Token
3. 填入扩展设置对应字段

## 开发

需要 Node.js >= 22 和 npm >= 10。

```bash
npm run dev          # 开发模式（热更新）
npm run build        # 生产构建
npm run type-check   # TypeScript 类型检查
npm test             # 运行 Playwright 测试
npm run zip          # 构建并打包
```

## 贡献

- **报告问题** — 提交 GitHub Issue 描述 bug 或功能建议
- **提交 PR** — Fork 仓库，创建特性分支，提交 Pull Request
- **翻译** — 帮助完善或添加语言支持
- **测试** — 编写或改进 Playwright E2E 测试

提交前请运行 `npm run type-check`，TypeScript 类型检查是项目的质量门禁。

## 许可

[Apache 2.0](LICENSE)

---

<p align="center">
  <a href="https://ko-fi.com/unforgetmemory">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=3" alt="Support on Ko-fi" width="180" height="36">
  </a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="UMM Logo" width="48" height="48">
  <br/>
  <em>统一管理你的多媒体记录。</em>
</p>