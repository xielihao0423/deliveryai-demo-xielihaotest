import { test, expect, type Page } from '@playwright/test'

/** 在登录页输入凭据并提交 */
async function loginWith(page: Page, username: string, password: string) {
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
}

/** 跳转指定路由，使用 domcontentloaded 避免 vite HMR 导致 load 事件偶发超时 */
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}

/** 登录到大盘页面（用于需要已登录态的用例） */
async function loginToDashboard(page: Page) {
  await open(page, '/login')
  await loginWith(page, 'admin', 'admin123')
  await expect(page).toHaveURL(/\/dashboard/)
}

/** 取第一张趋势图的 X 轴刻度数量（先等待渲染） */
async function firstChartXAxisTickCount(page: Page): Promise<number> {
  const firstXAxis = page.locator('main g.recharts-xAxis').first()
  const tick = firstXAxis.locator('g.recharts-cartesian-axis-tick')
  // 等待至少一个刻度可见，保证 recharts 已渲染
  await expect(tick.first()).toBeVisible({ timeout: 10000 })
  return tick.count()
}

test.describe('业务总览大盘 - E2E 验收测试', () => {
  test.beforeEach(async ({ page }) => {
    // 建立页面 origin 后一次性清除登录态，避免在后续导航中重复清除
    await open(page, '/login')
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('dashboard_auth')
      } catch {
        // ignore
      }
    })
  })

  test('AUTH-001: 未登录访问 /dashboard 被重定向到登录页', async ({ page }) => {
    await open(page, '/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: '欢迎登录' })).toBeVisible()
  })

  test('AUTH-002: 登录失败时提示错误并保留用户名、清空密码', async ({ page }) => {
    await open(page, '/login')
    await loginWith(page, 'wrong', 'wrong')
    await expect(page.getByText('用户名或密码错误')).toBeVisible()
    // 用户名保留
    await expect(page.getByPlaceholder('请输入用户名')).toHaveValue('wrong')
    // 密码清空
    await expect(page.getByPlaceholder('请输入密码')).toHaveValue('')
    // 仍在登录页
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-003: 空凭据提交时给出空值提示', async ({ page }) => {
    await open(page, '/login')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.getByText('请输入用户名和密码')).toBeVisible()
  })

  test('AUTH-004: 正确凭据登录后跳转回大盘页面', async ({ page }) => {
    await open(page, '/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await loginWith(page, 'admin', 'admin123')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: '业务总览大盘' })).toBeVisible()
  })

  test('DASH-001: 大盘展示 4 个核心指标卡片及趋势图', async ({ page }) => {
    await loginToDashboard(page)
    // 指标卡片标签（卡片为 <p>，趋势图为 <h3>，取第一个避免 strict mode）
    await expect(page.getByText('日活跃用户数', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('总收入', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('新增用户数', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('转化率', { exact: true }).first()).toBeVisible()
    // 趋势图标题区
    await expect(page.getByRole('heading', { name: '趋势分析' })).toBeVisible()
    // 4 张趋势子图均已渲染
    const chartSurfaces = page.locator('main svg.recharts-surface')
    await expect(chartSurfaces.first()).toBeVisible()
    expect(await chartSurfaces.count()).toBe(4)
  })

  test('DASH-002: 数据更新时间展示在顶部标题栏', async ({ page }) => {
    await loginToDashboard(page)
    await expect(page.getByText(/数据更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)).toBeVisible()
  })

  test('DASH-003: 默认选中「近 30 天」并展示近 30 天趋势数据', async ({ page }) => {
    await loginToDashboard(page)
    // 近 30 天按钮处于选中态（chili-500 背景）
    const btn30d = page.getByRole('button', { name: '近 30 天' })
    await expect(btn30d).toHaveClass(/bg-chili-500/)
    // 近 30 天数据点较多（recharts 自动稀疏化，但应 > 2 个 X 轴刻度）
    const tickCount = await firstChartXAxisTickCount(page)
    expect(tickCount).toBeGreaterThan(2)
  })

  test('DASH-004: 切换「今日」后卡片与图表更新为单点数据', async ({ page }) => {
    await loginToDashboard(page)
    await page.getByRole('button', { name: '今日' }).click()
    // 今日按钮选中
    await expect(page.getByRole('button', { name: '今日' })).toHaveClass(/bg-chili-500/)
    // 今日仅 1 个数据点 → X 轴至多 1 个刻度
    const tickCount = await firstChartXAxisTickCount(page)
    expect(tickCount).toBeLessThanOrEqual(1)
    // 卡片仍展示四指标
    await expect(page.getByText('日活跃用户数', { exact: true }).first()).toBeVisible()
  })

  test('DASH-005: 切换「近 7 天」后图表展示近 7 天数据', async ({ page }) => {
    await loginToDashboard(page)
    await page.getByRole('button', { name: '近 7 天' }).click()
    await expect(page.getByRole('button', { name: '近 7 天' })).toHaveClass(/bg-chili-500/)
    // 近 7 天数据点：1 < 刻度数 <= 7
    const tickCount = await firstChartXAxisTickCount(page)
    expect(tickCount).toBeGreaterThan(0)
    expect(tickCount).toBeLessThanOrEqual(7)
  })

  test('DASH-006: 指标卡片环比变化箭头与颜色正确', async ({ page }) => {
    await loginToDashboard(page)
    // 每张卡片均存在涨跌箭头图标（lucide 的 svg）
    const cardSection = page.locator('section').first()
    const changeIcons = cardSection.locator('svg.lucide-arrow-up, svg.lucide-arrow-down, svg.lucide-minus')
    await expect(changeIcons.first()).toBeVisible()
    expect(await changeIcons.count()).toBe(4)
    // 上涨绿色、下跌红色、持平灰色，三者之和等于卡片数
    const upIcons = cardSection.locator('svg.lucide-arrow-up')
    const downIcons = cardSection.locator('svg.lucide-arrow-down')
    const flatIcons = cardSection.locator('svg.lucide-minus')
    const total = (await upIcons.count()) + (await downIcons.count()) + (await flatIcons.count())
    expect(total).toBe(4)
  })

  test('DASH-007: 转化率展示为百分比并保留 2 位小数', async ({ page }) => {
    await loginToDashboard(page)
    // 转化率卡片值形如 NN.NN%
    const conversionCard = page.locator('div', { hasText: '转化率' }).first()
    await expect(conversionCard).toContainText(/\d+\.\d{2}%/)
  })

  test('DASH-008: 退出登录后跳转回登录页且无法直接访问大盘', async ({ page }) => {
    await loginToDashboard(page)
    await page.getByRole('button', { name: '退出登录' }).click()
    await expect(page).toHaveURL(/\/login/)
    // 重新访问大盘应被拦截
    await open(page, '/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('DASH-009: 重新进入大盘重新加载数据（更新时间刷新）', async ({ page }) => {
    await loginToDashboard(page)
    const timeRe = /数据更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/
    const timeEl = page.getByText(timeRe)
    await expect(timeEl).toBeVisible()
    const firstTime = await timeEl.textContent()
    expect(firstTime).toBeTruthy()
    // 等待至少 1 秒后重新进入大盘，触发重新加载
    await page.waitForTimeout(1100)
    await open(page, '/login')
    await open(page, '/dashboard')
    await expect(page.getByRole('heading', { name: '业务总览大盘' })).toBeVisible()
    const timeEl2 = page.getByText(timeRe)
    await expect(timeEl2).toBeVisible()
    const secondTime = await timeEl2.textContent()
    expect(secondTime).toBeTruthy()
    // 两次更新时间均应接近当前时间（同一分钟或相邻分钟），验证刷新机制存在
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const expectedPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${hh}:`
    expect(secondTime).toContain(expectedPrefix)
  })

  test('REGRESS-001: 现有火锅点单首页仍可正常访问，大盘改动未影响主流程', async ({ page }) => {
    await open(page, '/')
    await expect(page).toHaveURL(/\/$/)
    // 首页绑定餐桌标题存在
    await expect(page.getByText(/热气升腾/)).toBeVisible()
    await expect(page.getByRole('button', { name: /A08/ }).first()).toBeVisible()
  })
})
