import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// ─── Constants ───
const MOCK_AGENT_ENDPOINT = 'http://127.0.0.1:3999'
const BACKEND_URL = 'http://127.0.0.1:3001'

// ─── Helpers ───

/** Clean up all sessions and agents via API before each test. */
async function cleanupAll(request: APIRequestContext) {
  // Delete all sessions (any status)
  const sessionsResp = await request.get(`${BACKEND_URL}/api/sessions?status=all`)
  const sessionsJson = await sessionsResp.json()
  for (const s of sessionsJson.data || []) {
    await request.delete(`${BACKEND_URL}/api/sessions/${s.id}`)
  }
  // Delete all agents (cascade deletes skills)
  const agentsResp = await request.get(`${BACKEND_URL}/api/agents`)
  const agentsJson = await agentsResp.json()
  for (const a of agentsJson.data || []) {
    await request.delete(`${BACKEND_URL}/api/agents/${a.id}`)
  }
  // Reset feishu config to defaults
  await request.put(`${BACKEND_URL}/api/feishu/config`, {
    data: { webhook_url: '', bot_app_id: '', bot_app_secret: '', enabled: false },
  })
}

/** Reset feishu push logs. */
async function clearFeishuLogs(request: APIRequestContext) {
  await request.delete(`${BACKEND_URL}/api/feishu/logs`)
}

/** Create an agent via API (faster than UI form for non-REQ-001 tests). */
async function createAgentViaAPI(
  request: APIRequestContext,
  name: string,
  endpoint: string = MOCK_AGENT_ENDPOINT,
  type: 'codex_appserver' | 'trae_cli' = 'codex_appserver',
) {
  const resp = await request.post(`${BACKEND_URL}/api/agents`, {
    data: { name, type, endpoint },
  })
  const json = await resp.json()
  return json.data
}

/** Create an agent via the UI form. */
async function createAgentViaUI(
  page: Page,
  name: string,
  endpoint: string = MOCK_AGENT_ENDPOINT,
) {
  await page.getByRole('button', { name: '新增 Agent' }).click()
  await page.getByPlaceholder('例如：codex-prod').fill(name)
  await page.getByPlaceholder('http://localhost:3000').fill(endpoint)
  await page.getByRole('button', { name: '验证并保存' }).click()
}

// ─── Test Setup ───

test.beforeEach(async ({ request }) => {
  await cleanupAll(request)
})

// ─── REQ-001: Agent 纳管配置 ───

test.describe('REQ-001: Agent 纳管配置', () => {
  test('REQ-001.1: 通过表单成功纳管 Codex AppServer Agent', async ({ page }) => {
    await page.goto('/agents')

    await createAgentViaUI(page, 'codex-test', MOCK_AGENT_ENDPOINT)

    // Wait for toast success notification
    await expect(page.getByText('Agent 创建成功')).toBeVisible({ timeout: 10000 })

    // Agent card should appear in list with online status
    await expect(page.getByText('codex-test')).toBeVisible()
    await expect(page.getByText('Codex AppServer').first()).toBeVisible()
    // Status badge should show "online"
    await expect(page.getByText('online').first()).toBeVisible()
  })

  test('REQ-001.2: 无效端点地址连接验证失败', async ({ page }) => {
    await page.goto('/agents')

    await page.getByRole('button', { name: '新增 Agent' }).click()
    await page.getByPlaceholder('例如：codex-prod').fill('bad-agent')
    await page.getByPlaceholder('http://localhost:3000').fill('http://localhost:9999')
    await page.getByRole('button', { name: '验证并保存' }).click()

    // Agent created but status should NOT be online (offline or error)
    await expect(page.getByText('Agent 创建成功')).toBeVisible({ timeout: 10000 })

    // Agent should appear in list but not online
    await expect(page.getByText('bad-agent')).toBeVisible()
    // Status should be offline or error (not online)
    const statusBadge = page.locator('span:has-text("offline"), span:has-text("error")')
    await expect(statusBadge.first()).toBeVisible()
  })

  test('REQ-001.4: 重复 Agent 名称被拒绝', async ({ page, request }) => {
    // Pre-create an agent with the same name via API
    await createAgentViaAPI(request, 'duplicate-name')

    await page.goto('/agents')
    await page.getByRole('button', { name: '新增 Agent' }).click()
    await page.getByPlaceholder('例如：codex-prod').fill('duplicate-name')
    await page.getByPlaceholder('http://localhost:3000').fill(MOCK_AGENT_ENDPOINT)
    await page.getByRole('button', { name: '验证并保存' }).click()

    // Should see error about name conflict (in form error or toast)
    await expect(page.getByText(/已存在/).first()).toBeVisible({ timeout: 10000 })
  })

  test('REQ-001.5: 删除已注册 Agent', async ({ page, request }) => {
    await createAgentViaAPI(request, 'to-delete')

    await page.goto('/agents')
    await expect(page.getByText('to-delete', { exact: true })).toBeVisible()

    // Click delete (trash icon) on the agent card
    const card = page.locator('div', { hasText: 'to-delete' }).filter({ hasText: 'Codex AppServer' }).first()
    // The trash button is the last button without text in the card actions
    await card.locator('button').filter({ hasNot: page.getByText(/对话|编辑/) }).last().click()

    // Confirm deletion
    await expect(page.getByText('确认删除')).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()

    // Agent should be removed from list - check the agent name in card context is gone
    await expect(page.getByText('to-delete', { exact: true })).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('已删除')).toBeVisible()
  })
})

// ─── REQ-002: Agent 列表展示与状态监控 ───

test.describe('REQ-002: Agent 列表展示与状态监控', () => {
  test('REQ-002.1: Agent 列表展示名称、类型、状态、端点地址', async ({ page, request }) => {
    await createAgentViaAPI(request, 'agent-list-1')
    await createAgentViaAPI(request, 'bad-endpoint', 'http://localhost:9999')

    await page.goto('/agents')

    // Both agents should appear
    await expect(page.getByText('agent-list-1')).toBeVisible()
    await expect(page.getByText('bad-endpoint')).toBeVisible()

    // Verify endpoint is displayed
    await expect(page.getByText(MOCK_AGENT_ENDPOINT).first()).toBeVisible()

    // KPI cards should show counts
    await expect(page.getByText('Agent 总数')).toBeVisible()
    await expect(page.getByText('2').first()).toBeVisible() // total = 2
  })

  test('REQ-002.2: KPI 卡片正确统计在线/离线/异常数量', async ({ page, request }) => {
    await createAgentViaAPI(request, 'online-agent')
    await createAgentViaAPI(request, 'offline-agent', 'http://localhost:9999')

    await page.goto('/agents')

    // KPI cards: 1 online, 1 offline/error
    const kpiCards = page.locator('.grid > div')
    await expect(kpiCards.nth(0).getByText('2')).toBeVisible() // total

    // Online count should be 1
    const onlineCard = kpiCards.nth(1)
    await expect(onlineCard.getByText('在线')).toBeVisible()
    await expect(onlineCard.getByText('1')).toBeVisible()
  })

  test('REQ-002.3: 离线 Agent 不可点击进入对话', async ({ page, request }) => {
    await createAgentViaAPI(request, 'offline-agent', 'http://localhost:9999')

    await page.goto('/agents')

    // Click "对话" button on the offline agent card
    const card = page.locator('div', { hasText: 'offline-agent' }).filter({ hasText: 'Codex AppServer' }).first()
    await card.getByRole('button', { name: /对话/ }).click()

    // Should see error toast about agent unavailable
    await expect(page.getByText('Agent 不可用').first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── REQ-003: 对话交互 ───

test.describe('REQ-003: 对话交互', () => {
  test('REQ-003.1: 选择在线 Agent 发起对话并接收流式回复', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'chat-agent')

    await page.goto('/agents')

    // Click "对话" button on the agent card
    const card = page.locator('div', { hasText: 'chat-agent' }).filter({ hasText: 'Codex AppServer' }).first()
    await card.getByRole('button', { name: /对话/ }).click()

    // Should navigate to chat page
    await expect(page).toHaveURL('/chat')

    // Agent should be selected in sidebar
    await expect(page.getByText('chat-agent').first()).toBeVisible()

    // Type a message and send
    const textarea = page.getByPlaceholder('输入消息，Enter 发送，Shift+Enter 换行')
    await textarea.fill('请帮我写一个快速排序')
    await textarea.press('Enter')

    // User message should appear
    await expect(page.getByText('请帮我写一个快速排序')).toBeVisible()

    // Wait for streaming response to complete (loading indicator should disappear)
    await expect(page.getByText('正在思考...')).not.toBeVisible({ timeout: 15000 })
    await expect(page.getByText('生成中...')).not.toBeVisible({ timeout: 15000 })

    // Assistant response should contain code block with syntax highlighting
    await expect(page.locator('pre code')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('quickSort').first()).toBeVisible()
  })

  test('REQ-003.6: 离线 Agent 在对话页面不可选', async ({ page, request }) => {
    await createAgentViaAPI(request, 'online-agent')
    await createAgentViaAPI(request, 'offline-agent', 'http://localhost:9999')

    await page.goto('/chat')

    // Online agent button should be enabled
    const onlineBtn = page.getByRole('button', { name: 'online-agent' })
    await expect(onlineBtn).toBeEnabled()

    // Offline agent button should be disabled
    const offlineBtn = page.getByRole('button', { name: 'offline-agent' })
    await expect(offlineBtn).toBeDisabled()
  })
})

// ─── REQ-004: Agent Skill 管理 ───

test.describe('REQ-004: Agent Skill 管理', () => {
  test('REQ-004.1: 查看 Agent 已注册的 Skill 列表', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'skill-agent')

    await page.goto(`/agents/${agent.id}`)

    // Agent detail page should show skills
    await expect(page.getByText('Skill 列表')).toBeVisible()
    await expect(page.getByText('code-search')).toBeVisible()
    await expect(page.getByText('auto-test')).toBeVisible()
    await expect(page.getByText('doc-gen')).toBeVisible()
  })

  test('REQ-004.4: 启用/禁用 Skill', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'skill-toggle-agent')

    await page.goto(`/agents/${agent.id}`)

    // Find the doc-gen skill row - it's the 3rd skill in the list
    // Each skill row is a div with border containing the skill name
    const skillRows = page.locator('div.rounded-lg.border.border-brand-200:has(span)').filter({ hasText: /code-search|auto-test|doc-gen/ })
    const docGenRow = skillRows.filter({ hasText: 'doc-gen' })

    // The switch is inside this row
    const skillSwitch = docGenRow.getByRole('switch')

    // doc-gen should be initially off (unchecked)
    await expect(skillSwitch).toHaveAttribute('data-state', 'unchecked')

    // Enable it
    await skillSwitch.click()

    // Should see success toast
    await expect(page.getByText(/已启用/).first()).toBeVisible({ timeout: 5000 })

    // Switch should now be checked
    await expect(skillSwitch).toHaveAttribute('data-state', 'checked')
  })

  test('REQ-004.3: 配置 Skill 参数', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'skill-config-agent')

    await page.goto(`/agents/${agent.id}`)

    // Find the code-search skill row specifically
    const skillRows = page.locator('div.rounded-lg.border.border-brand-200:has(span)').filter({ hasText: /code-search|auto-test|doc-gen/ })
    const codeSearchRow = skillRows.filter({ hasText: 'code-search' })

    // Click "配置" button within this row
    await codeSearchRow.getByRole('button', { name: /配置/ }).click()

    // Config dialog should appear
    await expect(page.getByText('Skill 配置')).toBeVisible()

    // Edit config textarea
    const configTextarea = page.locator('textarea.font-mono')
    await configTextarea.fill('{"scope":"local"}')

    // Save
    await page.getByRole('button', { name: '保存配置' }).click()

    // Should see success toast
    await expect(page.getByText('Skill 配置已保存').first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── REQ-005: 对话 Session 持久化管理 ───

test.describe('REQ-005: 对话 Session 持久化管理', () => {
  test('REQ-005.1: 对话后 Session 出现在 Session 列表', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'session-agent')

    // Start a chat and send a message to create a session
    await page.goto('/chat')
    await page.getByRole('button', { name: 'session-agent' }).click()

    const textarea = page.getByPlaceholder('输入消息，Enter 发送，Shift+Enter 换行')
    await textarea.fill('测试消息')
    await textarea.press('Enter')

    // Wait for response to start (confirms session created)
    await expect(page.getByText('测试消息')).toBeVisible({ timeout: 5000 })

    // Navigate to sessions page
    await page.goto('/sessions')

    // Should see at least one session
    await expect(page.getByText('session-agent').first()).toBeVisible({ timeout: 5000 })
  })

  test('REQ-005.5: 归档 Session', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'archive-agent')

    // Create a session via chat
    await page.goto('/chat')
    await page.getByRole('button', { name: 'archive-agent' }).click()
    const textarea = page.getByPlaceholder('输入消息，Enter 发送，Shift+Enter 换行')
    await textarea.fill('测试归档')
    await textarea.press('Enter')
    await expect(page.getByText('测试归档')).toBeVisible({ timeout: 5000 })

    // Go to sessions page
    await page.goto('/sessions')

    // Session should be in active list
    await expect(page.getByText('archive-agent').first()).toBeVisible()

    // Click archive button
    const row = page.locator('tr', { hasText: 'archive-agent' }).first()
    await row.getByRole('button', { name: /归档/ }).click()

    // Should see success toast
    await expect(page.getByText('已归档')).toBeVisible({ timeout: 5000 })

    // Switch to archived tab
    await page.getByRole('button', { name: '已归档' }).click()

    // Session should now appear in archived list
    await expect(page.getByText('archive-agent').first()).toBeVisible()
  })

  test('REQ-005.6: 页面刷新后 Session 数据不丢失', async ({ page, request }) => {
    const agent = await createAgentViaAPI(request, 'persist-agent')

    // Create a session via chat
    await page.goto('/chat')
    await page.getByRole('button', { name: 'persist-agent' }).click()
    const textarea = page.getByPlaceholder('输入消息，Enter 发送，Shift+Enter 换行')
    await textarea.fill('持久化测试')
    await textarea.press('Enter')
    await expect(page.getByText('持久化测试')).toBeVisible({ timeout: 5000 })

    // Reload the sessions page
    await page.goto('/sessions')
    await expect(page.getByText('persist-agent').first()).toBeVisible()

    // Reload page
    await page.reload()

    // Session should still be visible after refresh
    await expect(page.getByText('persist-agent').first()).toBeVisible()
  })
})

// ─── REQ-006: 飞书消息通知 ───

test.describe('REQ-006: 飞书消息通知配置', () => {
  test.beforeEach(async ({ request }) => {
    await clearFeishuLogs(request)
  })

  test('REQ-006.1: 配置飞书机器人并保存', async ({ page }) => {
    await page.goto('/feishu')

    // Enable feishu integration
    const enableSwitch = page.getByText('启用飞书集成').locator('..').getByRole('switch')
    await enableSwitch.click()

    // Fill webhook URL with mock endpoint
    await page.getByPlaceholder('https://open.feishu.cn').fill(`${MOCK_AGENT_ENDPOINT}/feishu-webhook`)

    // Fill App ID
    await page.getByPlaceholder('飞书应用 App ID').fill('test-app-id')

    // Fill App Secret
    await page.getByPlaceholder('飞书应用 App Secret').fill('test-app-secret')

    // Save
    await page.getByRole('button', { name: '保存配置' }).click()

    // Should see success toast
    await expect(page.getByText('配置已保存')).toBeVisible({ timeout: 5000 })
  })

  test('REQ-006.2: 切换通知事件启停', async ({ page, request }) => {
    // First configure feishu via API
    await request.put(`${BACKEND_URL}/api/feishu/config`, {
      data: {
        webhook_url: `${MOCK_AGENT_ENDPOINT}/feishu-webhook`,
        bot_app_id: 'test-id',
        bot_app_secret: 'test-secret',
        enabled: true,
      },
    })

    await page.goto('/feishu')

    // Find the event toggle rows in the notification events card
    // Each event row has a label and a switch
    const eventRows = page.locator('div.flex.items-center.justify-between.border-b:has(span)')
    const agentOnlineRow = eventRows.filter({ hasText: 'Agent 上线' })
    const eventSwitch = agentOnlineRow.getByRole('switch')

    // Get initial state
    await expect(eventSwitch).toBeVisible({ timeout: 5000 })
    const initialState = await eventSwitch.getAttribute('data-state')

    // Toggle it
    await eventSwitch.click()

    // Wait for state to change (Radix Switch updates asynchronously)
    await page.waitForTimeout(500)
    const newState = await eventSwitch.getAttribute('data-state')
    expect(newState).not.toBe(initialState)
  })

  test('REQ-006.3: 测试飞书连接并查看推送日志', async ({ page, request }) => {
    // Configure feishu with mock endpoint via API
    await request.put(`${BACKEND_URL}/api/feishu/config`, {
      data: {
        webhook_url: `${MOCK_AGENT_ENDPOINT}/feishu-webhook`,
        bot_app_id: 'test-id',
        bot_app_secret: 'test-secret',
        enabled: true,
      },
    })

    // Test feishu connection via API (verifies backend can push to mock webhook)
    const testResp = await request.post(`${BACKEND_URL}/api/feishu/test`)
    const testJson = await testResp.json()
    expect(testJson.success).toBe(true)

    // Verify push logs show a success entry via API
    const logsResp = await request.get(`${BACKEND_URL}/api/feishu/logs`)
    const logsJson = await logsResp.json()
    expect(logsJson.data.length).toBeGreaterThan(0)
    expect(logsJson.data[0].status).toBe('success')

    // Verify in UI that logs are visible
    await page.goto('/feishu')
    await expect(page.getByText('成功').first()).toBeVisible({ timeout: 5000 })
  })
})
