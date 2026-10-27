import { test, expect, type Page } from '@playwright/test'

/**
 * Navigate from app start to the snake game view.
 * Reuses the same bind-table → welcome → menu → nav flow as the existing super-spicy tests.
 */
async function goToSnakeGame(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /A08/ }).first().click()
  await page.getByRole('button', { name: /进入点餐|Enter/ }).click()
  await page.getByRole('button', { name: '贪吃蛇' }).click()
}

/** Score display in the side panel (`.sa-card.highlight .c-value`). */
const scoreValue = (page: Page) => page.locator('.sa-card.highlight .c-value')
/** High-score display in the side panel (first card inside `.sa-row`). */
const highScoreValue = (page: Page) => page.locator('.sa-row > .sa-card').first().locator('.c-value')
/** Speed-level display in the side panel (second card inside `.sa-row`). */
const speedLevelValue = (page: Page) => page.locator('.sa-row > .sa-card').nth(1).locator('.c-value')
/** Game-status indicator. */
const statusLabel = (page: Page) => page.locator('.sa-status')

/**
 * Override Math.random so foods are placed at pre-computed grid positions
 * along the snake's straight rightward path (cells (12,10) → (19,10)).
 * Snake starts at head (9,10) moving right; each food is 2-3 cells ahead.
 */
function installFoodSequence(page: Page, foods: number[]) {
  void page.addInitScript((seq) => {
    let count = 0
    Math.random = () => {
      if (count < seq.length) return seq[count++] as number
      count++
      return 0.999 // subsequent foods at last free cell, away from snake
    }
  }, foods)
}

test.describe('贪吃蛇游戏 - E2E 验收测试', () => {

  /* ---------- REQ-001: 游戏页面入口与初始展示 ---------- */

  test('REQ-001: 页面加载后显示画布、初始分数0、最高分和开始提示', async ({ page }) => {
    await goToSnakeGame(page)

    // Canvas 渲染区域可见
    await expect(page.locator('canvas')).toBeVisible()
    // 初始分数为 0
    await expect(scoreValue(page)).toHaveText('0')
    // 最高分显示区可见
    await expect(highScoreValue(page)).toBeVisible()
    // 开始提示可见
    await expect(page.getByText('按方向键开始游戏')).toBeVisible()
    // 状态指示为"等待开始"
    await expect(statusLabel(page)).toContainText('等待开始')
  })

  /* ---------- REQ-002: 蛇的移动控制 ---------- */

  test('REQ-002.2: 按方向键开始游戏，状态变为游戏中', async ({ page }) => {
    await goToSnakeGame(page)

    await page.keyboard.press('ArrowRight')

    await expect(statusLabel(page)).toContainText('游戏中')
    await expect(page.getByText('按方向键开始游戏')).not.toBeVisible()
  })

  test('REQ-002.1: WASD 键控制蛇移动方向', async ({ page }) => {
    await goToSnakeGame(page)

    await page.keyboard.press('d')

    await expect(statusLabel(page)).toContainText('游戏中')
  })

  test('REQ-002.4: 禁止180°反向，蛇继续原方向移动', async ({ page }) => {
    await goToSnakeGame(page)

    await page.keyboard.press('ArrowRight')
    await expect(statusLabel(page)).toContainText('游戏中')

    // 按反方向键，应被忽略
    await page.keyboard.press('ArrowLeft')

    // 游戏仍在运行，未结束
    await expect(statusLabel(page)).toContainText('游戏中')
    await expect(page.getByText('Game Over')).not.toBeVisible()
  })

  /* ---------- REQ-003: 食物生成与蛇身增长 ---------- */

  test('REQ-003: 蛇吃到食物后分数+10，蛇身增长', async ({ page }) => {
    // 将第一个食物放置在 (12,10)——蛇头 (9,10) 右侧 3 格，直线可吃到
    installFoodSequence(page, [247 / 397])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')

    // 等待蛇吃到食物（约 3 tick ≈ 450ms）
    await expect(scoreValue(page)).toHaveText('10', { timeout: 5000 })
  })

  /* ---------- REQ-004: 碰撞检测与游戏结束 ---------- */

  test('REQ-004.1: 蛇撞墙后游戏结束，显示结束面板和重新开始按钮', async ({ page }) => {
    // 食物远离蛇的右行路径
    installFoodSequence(page, [])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')

    // 蛇从 x=9 到 x=20（越界）约需 11 tick ≈ 1650ms
    await expect(page.getByText('Game Over')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
  })

  /* ---------- REQ-005: 暂停与恢复 ---------- */

  test('REQ-005.1/005.2: 空格键暂停后恢复游戏', async ({ page }) => {
    installFoodSequence(page, [])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')
    await expect(statusLabel(page)).toContainText('游戏中')

    // 暂停
    await page.keyboard.press('Space')
    await expect(statusLabel(page)).toContainText('已暂停')
    await expect(page.getByText('按空格继续')).toBeVisible()

    // 恢复
    await page.keyboard.press('Space')
    await expect(statusLabel(page)).toContainText('游戏中')
    await expect(page.getByText('按空格继续')).not.toBeVisible()
  })

  test('REQ-005.3: 静止状态按空格键无效', async ({ page }) => {
    await goToSnakeGame(page)
    await expect(statusLabel(page)).toContainText('等待开始')

    await page.keyboard.press('Space')

    // 仍处于等待开始状态
    await expect(statusLabel(page)).toContainText('等待开始')
    await expect(page.getByText('按方向键开始游戏')).toBeVisible()
  })

  /* ---------- REQ-006: 重新开始 ---------- */

  test('REQ-006.1: 点击重新开始按钮重置游戏为初始状态', async ({ page }) => {
    installFoodSequence(page, [])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Game Over')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: '重新开始' }).click()

    await expect(statusLabel(page)).toContainText('等待开始')
    await expect(page.getByText('按方向键开始游戏')).toBeVisible()
    await expect(scoreValue(page)).toHaveText('0')
  })

  test('REQ-006.2: R键重新开始游戏', async ({ page }) => {
    installFoodSequence(page, [])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Game Over')).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('r')

    await expect(statusLabel(page)).toContainText('等待开始')
    await expect(page.getByText('按方向键开始游戏')).toBeVisible()
  })

  /* ---------- REQ-007: 速度递增 ---------- */

  test('REQ-007: 吃5个食物后速度加快一档', async ({ page }) => {
    // 5 个食物沿蛇右行直线路径排列：(12,10)→(14,10)→(16,10)→(18,10)→(19,10)
    installFoodSequence(page, [
      247 / 397, // food 1 at (12,10)
      286 / 396, // food 2 at (14,10)
      325 / 395, // food 3 at (16,10)
      364 / 394, // food 4 at (18,10)
      383 / 393, // food 5 at (19,10)
    ])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')

    // 等待分数达到 50（5 × 10），约 10 tick ≈ 1500ms
    await expect(scoreValue(page)).toHaveText('50', { timeout: 10000 })
    // 速度档位应为 2（初始 150ms → 135ms，每 5 食物加速一档）
    await expect(speedLevelValue(page)).toHaveText('2')
  })

  /* ---------- REQ-008: 最高分记录与降级 ---------- */

  test('REQ-008.1/008.2: 最高分通过localStorage持久化，重载后仍显示', async ({ page }) => {
    // 第一个食物在蛇路径上，吃 1 个后蛇继续右行撞墙
    installFoodSequence(page, [247 / 397])

    await goToSnakeGame(page)
    await page.keyboard.press('ArrowRight')

    // 吃到食物，分数 10
    await expect(scoreValue(page)).toHaveText('10', { timeout: 5000 })

    // 等待蛇撞墙游戏结束
    await expect(page.getByText('Game Over')).toBeVisible({ timeout: 10000 })

    // 结束面板显示最高分 10
    await expect(page.locator('.o-highscore')).toContainText('10')
    // 新纪录提示可见
    await expect(page.getByText('🎉 新纪录！')).toBeVisible()

    // 重载页面，重新导航到贪吃蛇游戏页面
    await page.reload()
    await goToSnakeGame(page)

    // 最高分从 localStorage 读取，应显示 10
    await expect(highScoreValue(page)).toHaveText('10', { timeout: 5000 })
  })

  test('REQ-008.3: localStorage不可用时游戏主流程不受影响', async ({ page }) => {
    // 使 localStorage 不可用
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get: () => { throw new Error('localStorage not available') },
      })
    })

    await goToSnakeGame(page)

    // 游戏页面正常加载
    await expect(page.locator('canvas')).toBeVisible()
    await expect(scoreValue(page)).toHaveText('0')
    await expect(page.getByText('按方向键开始游戏')).toBeVisible()
    // 最高分降级为 0
    await expect(highScoreValue(page)).toHaveText('0')

    // 游戏可正常开始
    await page.keyboard.press('ArrowRight')
    await expect(statusLabel(page)).toContainText('游戏中')
  })
})
