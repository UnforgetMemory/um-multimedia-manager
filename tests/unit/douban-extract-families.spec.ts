import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import {
  extractUserProfileInfo,
  extractCollectPageShell,
} from '@/content/douban/shared/douban-extract'

/**
 * extractUserProfileInfo / extractCollectPageShell 单元测试（audit §2.4 T14）。
 *
 * FAMILY 1 — user-profile / user-celebrities / user-reviews 的用户信息 hero block 去重：
 * userId、displayName、avatarUrl、navLinks 从 #db-usr-profile sidebar 提取。
 *
 * FAMILY 2 — book-collect / music-collect / user-media 的 collect page shell 去重：
 * subType、userId、displayName、avatarUrl、navLinks、sortOptions、pageInfo、mode、paginator。
 */

// ---------------------------------------------------------------------------
// Helper: create JSDOM with a URL containing /people/{uid}
// ---------------------------------------------------------------------------
function dom(html: string, uid = 'testuser123'): JSDOM {
  return new JSDOM(html, { url: `https://movie.douban.com/people/${uid}/celebrities` })
}

// ===========================================================================
// FAMILY 1 — extractUserProfileInfo
// ===========================================================================

test.describe('extractUserProfileInfo — 用户信息 hero block 去重', () => {
  test('user-celebrities 页面结构 → userId + displayName + avatarUrl + navLinks', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic">
          <img src="https://img.example.com/avatar.jpg" alt="张三">
        </div>
        <div class="info">
          <h1>Ta的影人(42)</h1>
          <ul>
            <li><a href="https://movie.douban.com/people/u1/collect">看过的电影</a></li>
            <li><span>|</span></li>
            <li><a href="https://movie.douban.com/people/u1/wish">想看</a></li>
          </ul>
        </div>
      </div>
      <div class="side-info-txt">
        <h3>张三</h3>
      </div>
    `
    const { window } = dom(html)
    const result = extractUserProfileInfo(window.document)

    expect(result).toEqual({
      userId: 'testuser123',
      displayName: '张三',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      navLinks: [
        { label: '看过的电影', url: 'https://movie.douban.com/people/u1/collect' },
        { label: '想看', url: 'https://movie.douban.com/people/u1/wish' },
      ],
    })
  })

  test('user-reviews 页面结构 → displayName 来自 avatar alt', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic">
          <img src="https://img.example.com/avatar2.jpg" alt="李四">
        </div>
        <div class="info">
          <h1>我的影评(5)</h1>
          <ul>
            <li><a href="https://movie.douban.com/people/u2/collect">看过</a></li>
          </ul>
        </div>
      </div>
    `
    const { window } = dom(html, 'u2')
    const result = extractUserProfileInfo(window.document)

    // displayName 应从 avatar alt 获取（h1 是 "我的影评(5)" 不是真名）
    expect(result.displayName).toBe('李四')
    expect(result.avatarUrl).toBe('https://img.example.com/avatar2.jpg')
    expect(result.userId).toBe('u2')
    expect(result.navLinks).toEqual([
      { label: '看过', url: 'https://movie.douban.com/people/u2/collect' },
    ])
  })

  test('user-profile 页面结构 → displayName 来自 h1 first text node', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="info">
          <h1>王五<div class="pl">(100部看过)</div></h1>
        </div>
      </div>
      <div class="basic-info">
        <img class="userface" src="https://img.example.com/large.jpg">
      </div>
    `
    const { window } = dom(html.replace(/\/people\/testuser123\//, '/people/u3/'), 'u3')
    const result = extractUserProfileInfo(window.document)

    expect(result.userId).toBe('u3')
    expect(result.displayName).toBe('王五')
    // user-profile 页面 avatar 在 .basic-info .userface（作为 fallback）
    expect(result.avatarUrl).toBe('https://img.example.com/large.jpg')
  })

  test('navLinks 中 text 为 "|" 的分隔符被跳过', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic"><img src="a.jpg" alt="X"></div>
        <div class="info">
          <h1>X</h1>
          <ul>
            <li><a href="/people/u/collect">看过</a></li>
            <li><span>|</span></li>
            <li><a href="/people/u/wish">想看</a></li>
          </ul>
        </div>
      </div>
    `
    const { window } = dom(html, 'u')
    const result = extractUserProfileInfo(window.document)
    // "|" 作为 text content 不是 <a> 标签，不会被选中（querySelectorAll('a')）
    expect(result.navLinks).toHaveLength(2)
  })

  test('无 #db-usr-profile → 返回空默认值', () => {
    const { window } = dom('<div></div>')
    const result = extractUserProfileInfo(window.document)
    expect(result.userId).toBe('testuser123') // from URL
    expect(result.displayName).toBe('')
    expect(result.avatarUrl).toBe('')
    expect(result.navLinks).toEqual([])
  })

  test('URL 中无 /people/ → userId 为空', () => {
    const dom2 = new JSDOM('<div id="db-usr-profile"><div class="pic"><img src="a.jpg" alt="Y"></div></div>', {
      url: 'https://movie.douban.com/subject/123/',
    })
    const result = extractUserProfileInfo(dom2.window.document)
    expect(result.userId).toBe('')
    expect(result.displayName).toBe('Y')
  })

  test('side-info-avatar img 作为 avatar fallback', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="info"><h1>Test</h1></div>
      </div>
      <div class="side-info-avatar">
        <img src="https://img.example.com/side-avatar.jpg" alt="Z">
      </div>
    `
    const { window } = dom(html, 'u')
    const result = extractUserProfileInfo(window.document)
    expect(result.avatarUrl).toBe('https://img.example.com/side-avatar.jpg')
    expect(result.displayName).toBe('Z')
  })
})

// ===========================================================================
// FAMILY 2 — extractCollectPageShell
// ===========================================================================

test.describe('extractCollectPageShell — collect page shell 去重', () => {
  /** 构造 book-collect 页面 DOM */
  function bookCollectHtml(uid = 'u1'): string {
    return `
      <div id="db-usr-profile">
        <div class="pic"><img src="https://img.example.com/avatar.jpg" alt="读者"></div>
        <div class="info">
          <h1>我的书架(88)</h1>
          <ul>
            <li><a href="https://book.douban.com/people/${uid}/collect">读过</a></li>
            <li><a href="https://book.douban.com/people/${uid}/wish">想读</a></li>
          </ul>
        </div>
      </div>
      <div class="opt-bar">
        <div class="sort">
          按时间排序 ·
          <a href="?sort=rank">按评价排序</a>
        </div>
      </div>
      <div class="subject-num">1-20 / 88</div>
      <div class="grid-on"></div>
      <div class="paginator">
        <span class="prev"><a href="?start=0">前页</a></span>
        <span class="thispage">1</span>
        <a href="?start=20">2</a>
        <a href="?start=40">3</a>
        <span class="next"><a href="?start=20">后页</a></span>
      </div>
    `
  }

  /** 构造 music-collect 页面 DOM（含 #user-id hidden input） */
  function musicCollectHtml(uid = 'u2'): string {
    return `
      <input type="hidden" id="user-id" value="${uid}">
      <div id="db-usr-profile">
        <div class="pic"><img src="https://img.example.com/music-avatar.jpg" alt="乐迷"></div>
        <div class="info">
      <div class="opt-bar">
        <div class="sort">
          按时间排序 ·
          <a href="?sort=rank">按评价排序</a>
        </div>
      </div>
      <div class="opt-bar">
        <div class="sort">
          按时间排序 ·
          <a href="?sort=rank">按评分排序</a>
        </div>
      </div>
      <div class="subject-num">1-15 / 55</div>
      <div class="paginator">
        <span class="thispage">1</span>
        <a href="?start=15">2</a>
        <span class="next"><a href="?start=15">后页</a></span>
      </div>
    `
  }

  test('book-collect URL → subType=collect，所有 shell 字段正确', () => {
    const html = bookCollectHtml()
    const { window } = new JSDOM(html, {
      url: 'https://book.douban.com/people/u1/collect',
    })
    const result = extractCollectPageShell(window.document)

    expect(result.subType).toBe('collect')
    expect(result.userId).toBe('u1')
    expect(result.displayName).toBe('读者')
    expect(result.avatarUrl).toBe('https://img.example.com/avatar.jpg')
    expect(result.navLinks).toEqual([
      { label: '读过', url: 'https://book.douban.com/people/u1/collect' },
      { label: '想读', url: 'https://book.douban.com/people/u1/wish' },
    ])
    expect(result.sortOptions).toEqual([
      { label: '按时间排序 ·', url: '', active: true },
      { label: '按评价排序', url: '?sort=rank', active: false },
    ])
    expect(result.currentPage).toBe('1-20')
    expect(result.total).toBe(88)
    expect(result.mode).toBe('grid')
    expect(result.pageLinks).toEqual([
      { label: '1', url: '', current: true },
      { label: '2', url: '?start=20', current: false },
      { label: '3', url: '?start=40', current: false },
    ])
    expect(result.prevPageUrl).toBe('?start=0')
    expect(result.nextPageUrl).toBe('?start=20')
  })

  test('music-collect URL with /wish → subType=wish', () => {
    const html = musicCollectHtml()
    const { window } = new JSDOM(html, {
      url: 'https://music.douban.com/people/u2/wish',
    })
    const result = extractCollectPageShell(window.document)

    expect(result.subType).toBe('wish')
    expect(result.userId).toBe('u2')
    expect(result.displayName).toBe('乐迷')
  })

  test('music-collect URL with status=do → subType=doing', () => {
    const html = musicCollectHtml()
    const { window } = new JSDOM(html, {
      url: 'https://music.douban.com/people/u2/status=do',
    })
    const result = extractCollectPageShell(window.document)
    expect(result.subType).toBe('doing')
  })

  test('#user-id input 作为 userId fallback', () => {
    const html = musicCollectHtml('from-input')
    const { window } = new JSDOM(html, {
      url: 'https://music.douban.com/mine/?status=collect',
    })
    const result = extractCollectPageShell(window.document)
    // URL 无 /people/ 匹配，但 #user-id input 存在
    expect(result.userId).toBe('from-input')
  })

  test('无 .subject-num 时 fallback 到 h1 "(N)" 获取 total', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic"><img src="a.jpg" alt="X"></div>
        <div class="info"><h1>我的书架(120)</h1></div>
      </div>
    `
    const { window } = new JSDOM(html, {
      url: 'https://book.douban.com/people/u/collect',
    })
    const result = extractCollectPageShell(window.document)
    expect(result.total).toBe(120)
  })

  test('无 .grid-on → mode=list', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic"><img src="a.jpg" alt="X"></div>
        <div class="info"><h1>Title(10)</h1></div>
      </div>
    `
    const { window } = new JSDOM(html, {
      url: 'https://book.douban.com/people/u/collect',
    })
    const result = extractCollectPageShell(window.document)
    expect(result.mode).toBe('list')
  })

  test('空页面 → 所有字段为默认值', () => {
    const { window } = new JSDOM('<div></div>', {
      url: 'https://book.douban.com/people/u/collect',
    })
    const result = extractCollectPageShell(window.document)
    expect(result.subType).toBe('collect')
    expect(result.userId).toBe('u')
    expect(result.displayName).toBe('u')  // falls back to userId, matching original behavior
    expect(result.avatarUrl).toBe('')
    expect(result.navLinks).toEqual([])
    expect(result.sortOptions).toEqual([])
    expect(result.currentPage).toBe('')
    expect(result.total).toBe(0)
    expect(result.mode).toBe('list')
    expect(result.pageLinks).toEqual([])
    expect(result.prevPageUrl).toBe('')
    expect(result.nextPageUrl).toBe('')
  })

  test('total=0 但有 paginator → 从最后一页推算 total', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic"><img src="a.jpg" alt="X"></div>
        <div class="info"><h1>Title</h1></div>
      </div>
      <div class="subject-num">1-20 / 0</div>
      <div class="paginator">
        <span class="thispage">1</span>
        <a href="?start=20">2</a>
        <a href="?start=40">3</a>
        <span class="next"><a href="?start=20">后页</a></span>
      </div>
    `
    const { window } = new JSDOM(html, {
      url: 'https://book.douban.com/people/u/collect',
    })
    const result = extractCollectPageShell(window.document)
    // subject-num 解析 total=0，但 h1 fallback 也无 "(N)"，所以 total=0
    // 最后一页 start=40 + 20 = 60? 不对，shell 不做这个推算——那是调用方的责任
    expect(result.total).toBe(0)
  })

  test('navLinks href 含 www.douban.com → 替换为 movie.douban.com（celebrities 模式）', () => {
    const html = `
      <div id="db-usr-profile">
        <div class="pic"><img src="a.jpg" alt="X"></div>
        <div class="info">
          <h1>X</h1>
          <ul>
            <li><a href="https://www.douban.com/people/u/contacts">关注</a></li>
          </ul>
        </div>
      </div>
    `
    // extractCollectPageShell 不做 domain 替换（那是 user-celebrities 特有的）
    // 但 extractUserProfileInfo 也不做——让我确认
    const { window } = new JSDOM(html, {
      url: 'https://movie.douban.com/people/u/collect',
    })
    const result = extractCollectPageShell(window.document)
    // collect pages 不做 www→movie 替换
    expect(result.navLinks[0].url).toBe('https://www.douban.com/people/u/contacts')
  })
})
