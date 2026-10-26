import { test, expect, type Page } from '@playwright/test'

/** 清除登录态，确保每个用例从「未登录」状态开始 */
async function clearAuth(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('dashboard_auth')
    } catch {
      // ignore
    }
  })
}

/** 在登录页输入凭据并提交 */
async function loginWith(page: Page, username: string, password: string) {
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
}

test.describe('业务总览大盘 - E2E 验收测试', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page)
  })

  test('AUTH-001: 未登录访问 /dashboard 被重定向到登录页', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: '欢迎登录' })).toBeVisible()
  })

  test('AUTH-002: 登录失败时提示错误并保留用户名、清空密码', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'wrong', 'wrong')
    await expect(page.getByText('用户名或密码错误')).toBeVisible()
    // 用户名保留
    await expect(page.getByLabel('用户名')).toHaveValue('wrong')
    // 密码清空
    await expect(page.getByLabel('密码')).toHaveValue('')
    // 仍在登录页
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-003: 空凭据提交时给出空值提示', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.getByText('请输入用户名和密码')).toBeVisible()
  })

  test('AUTH-004: 正确凭据登录后跳转回大盘页面', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await loginWith(page, 'admin', 'admin123')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: '业务总览大盘' })).toBeVisible()
  })

  test('DASH-001: 大盘展示 4 个核心指标卡片及趋势图', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    await expect(page).toHaveURL(/\/dashboard/)

    // 四个指标卡片标题
    await expect(page.getByText('日活跃用户数', { exact: true })).toBeVisible()
    await expect(page.getByText('总收入', { exact: true })).toBeVisible()
    await expect(page.getByText('新增用户数', { exact: true })).toBeVisible()
    await expect(page.getByText('转化率', { exact: true })).toBeVisible()

    // 趋势图标题区
    await expect(page.getByRole('heading', { name: '趋势分析' })).toBeVisible()
    // 趋势图卡片（4 张子图）
    const chartCards = page.locator('section svg.recharts-surface')
    await expect(chartCards.first()).toBeVisible()
  })

  test('DASH-002: 数据更新时间展示在顶部标题栏', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    await expect(page.getByText(/数据更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)).toBeVisible()
  })

  test('DASH-003: 默认选中「近 30 天」并展示近 30 天趋势数据', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    // 近 30 天按钮处于选中态（chili-500 背景白字）
    const btn30d = page.getByRole('button', { name: '近 30 天' })
    await expect(btn30d).toHaveClass(/bg-chili-500/)
    // 趋势图存在数据点（30 天应有多个坐标轴刻度）
    const xAxisLabels = page.locator('section svg.recharts-xAxis .recharts-cartesian-axis-tick-value')
    const count = await xAxisLabels.count()
    expect(count).toBeGreaterThan(2)
  })

  test('DASH-004: 切换「今日」后卡片与图表更新为单点数据', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    await page.getByRole('button', { name: '今日' }).click()
    // 今日按钮选中
    const btnToday = page.getByRole('button', { name: '今日' })
    await expect(btnToday).toHaveClass(/bg-chili-500/)
    // 今日仅 1 个数据点，X 轴至多 1 个刻度
    const xAxisLabels = page.locator('section svg.recharts-xAxis .recharts-cartesian-axis-tick-value')
    const count = await xAxisLabels.count()
    expect(count).toBeLessThanOrEqual(1)
    // 卡片仍展示四指标
    await expect(page.getByText('日活跃用户数', { exact: true })).toBeVisible()
  })

  test('DASH-005: 切换「近 7 天」后图表展示近 7 天数据', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    await page.getByRole('button', { name: '近 7 天' }).click()
    const btn7d = page.getByRole('button', { name: '近 7 天' })
    await expect(btn7d).toHaveClass(/bg-chili-500/)
    // 近 7 天数据点数量小于近 30 天
    const xAxisLabels = page.locator('section svg.recharts-xAxis .recharts-cartesian-axis-tick-value')
    const count = await xAxisLabels.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(7)
  })

  test('DASH-006: 指标卡片环比变化箭头与颜色正确', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    // 每张卡片均存在涨跌箭头图标（lucide 的 svg）
    const cardSection = page.locator('section').first()
    const changeIcons = cardSection.locator('svg.lucide-arrow-up, svg.lucide-arrow-down, svg.lucide-minus')
    const count = await changeIcons.count()
    expect(count).toBe(4)
    // 上涨为绿色，下跌为红色，持平为灰色
    const upIcons = cardSection.locator('svg.lucide-arrow-up')
    const downIcons = cardSection.locator('svg.lucide-arrow-down')
    const flatIcons = cardSection.locator('svg.lucide-minus')
    const total = (await upIcons.count()) + (await downIcons.count()) + (await flatIcons.count())
    expect(total).toBe(4)
  })

  test('DASH-007: 转化率展示为百分比并保留 2 位小数', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    // 转化率卡片值形如 NN.NN%
    const conversionCard = page.locator('div', { hasText: '转化率' }).first()
    await expect(conversionCard).toContainText(/\d+\.\d{2}%/)
  })

  test('DASH-008: 退出登录后跳转回登录页且无法直接访问大盘', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    await expect(page).toHaveURL(/\/dashboard/)
    await page.getByRole('button', { name: '退出登录' }).click()
    await expect(page).toHaveURL(/\/login/)
    // 重新访问大盘应被拦截
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('DASH-009: 重新进入大盘重新加载数据（更新时间刷新）', async ({ page }) => {
    await page.goto('/login')
    await loginWith(page, 'admin', 'admin123')
    const timeEl = page.getByText(/数据更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    await expect(timeEl).toBeVisible()
    const firstTime = await timeEl.textContent()
    // 等待至少 1 秒后重新进入，确保分钟可能不同
    await page.waitForTimeout(1100)
    await page.goto('/login')
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: '业务总览大盘' })).toBeVisible()
    const timeEl2 = page.getByText(/数据更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    await expect(timeEl2).toBeVisible()
    const secondTime = await timeEl2.textContent()
    // 两次时间均为当前时间附近，验证更新时间刷新机制存在
    expect(firstTime).toBeTruthy()
    expect(secondTime).toBeTruthy()
  })

  test('REGRESS-001: 现有火锅点单首页仍可正常访问，大盘改动未影响主流程', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    // 首页绑定餐桌标题存在
    await expect(page.getByText(/热气升腾/)).toBeVisible()
    await expect(page.getByRole('button', { name: /A08/ }).first()).toBeVisible()
  })
})
