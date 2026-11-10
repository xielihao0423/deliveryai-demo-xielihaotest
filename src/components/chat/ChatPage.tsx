import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, MessageSquare, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { agentApi, sessionApi, streamMessage } from '@/api/client'
import type { Agent, Session, Message } from '@/types'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const agentTypeLabels: Record<string, string> = {
  codex_appserver: 'Codex AppServer',
  trae_cli: 'Trae CLI',
}

export function ChatPage() {
  const location = useLocation()
  const { show } = useToast()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectAgent = useCallback(async (agent: Agent) => {
    if (agent.status !== 'online') {
      show({ title: 'Agent 不可用', description: '该 Agent 当前不在线', variant: 'error' })
      return
    }

    // Abort any ongoing stream
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    setSelectedAgent(agent)
    setMessages([])
    setCurrentSession(null)
    setInterrupted(false)

    try {
      // Create a new session for this agent
      const session = await sessionApi.create(agent.id)
      setCurrentSession(session)
    } catch (err) {
      show({ title: '创建 Session 失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }, [show])

  useEffect(() => {
    agentApi.list().then(data => {
      setAgents(data)
      // Auto-select agent from navigation state
      const state = location.state as { agentId?: string } | null
      if (state?.agentId) {
        const agent = data.find(a => a.id === state.agentId && a.status === 'online')
        if (agent) selectAgent(agent)
      }
    }).catch(err => {
      show({ title: '加载 Agent 列表失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    })
  }, [location.state, show, selectAgent])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])


  async function handleSend() {
    if (!input.trim() || !selectedAgent || !currentSession || streaming) return

    const content = input.trim()
    setInput('')
    setInterrupted(false)
    setStreaming(true)

    // Optimistically add user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      session_id: currentSession.id,
      role: 'user',
      content,
      streaming_completed: true,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    // Add placeholder assistant message
    const assistantId = `temp-assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      session_id: currentSession.id,
      role: 'assistant',
      content: '',
      streaming_completed: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantMsg])

    const controller = streamMessage(
      currentSession.id,
      content,
      (chunk) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m
        ))
      },
      (data) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: data.content, streaming_completed: true, id: data.messageId }
            : m
        ))
        setStreaming(false)
        setInterrupted(data.interrupted)
        abortRef.current = null
      },
      (err) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: m.content + `\n[连接中断: ${err.message}]`, streaming_completed: true }
            : m
        ))
        setStreaming(false)
        setInterrupted(true)
        abortRef.current = null
      },
    )
    abortRef.current = controller
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleRetry() {
    if (interrupted && !streaming) {
      // Remove last interrupted assistant message
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.streaming_completed) {
          return prev.slice(0, -1)
        }
        return prev
      })
      setInterrupted(false)
      // Get last user message for retry
      const lastUser = messages.filter(m => m.role === 'user').pop()
      if (lastUser) {
        setInput(lastUser.content)
      }
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4" style={{ height: 'calc(100vh - 130px)' }}>
      {/* Agent selection sidebar */}
      <div className="overflow-y-auto rounded-xl border border-brand-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-400">选择 Agent</h3>
        <div className="space-y-1">
          {agents.map(agent => (
            <button
              key={agent.id}
              disabled={agent.status !== 'online'}
              onClick={() => selectAgent(agent)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                agent.status !== 'online' && 'cursor-not-allowed opacity-50',
                selectedAgent?.id === agent.id ? 'bg-brand-100 font-medium text-brand-900' : 'text-brand-600 hover:bg-brand-50',
              )}
            >
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                agent.status === 'online' ? 'bg-success-500' : agent.status === 'error' ? 'bg-danger-500' : 'bg-brand-300',
              )} />
              {agent.name}
            </button>
          ))}
          {agents.length === 0 && (
            <p className="px-3 py-4 text-xs text-brand-400">暂无 Agent，请先纳管 Agent</p>
          )}
        </div>
      </div>

      {/* Chat main area */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-brand-200 bg-white">
        {selectedAgent ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-brand-100 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-brand-900">{selectedAgent.name}</span>
                <span className="text-xs text-brand-400">{agentTypeLabels[selectedAgent.type]}</span>
                <StatusBadge status={selectedAgent.status} />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-4">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn('flex max-w-[85%] gap-3', msg.role === 'user' && 'self-end flex-row-reverse')}
                  >
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      msg.role === 'user' ? 'bg-brand-900 text-white' : 'bg-brand-100 text-brand-700',
                    )}>
                      {msg.role === 'user' ? '你' : 'AI'}
                    </div>
                    <div className={cn(
                      'rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-brand-900 text-white rounded-br-sm'
                        : 'bg-brand-50 border border-brand-100 text-brand-800 rounded-bl-sm',
                    )}>
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <div className="prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                              {msg.content}
                            </ReactMarkdown>
                            {!msg.streaming_completed && (
                              <span className="inline-flex items-center gap-1 text-xs text-brand-400">
                                <Loader2 className="h-3 w-3 animate-spin" /> 生成中...
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm text-brand-400">
                            <Loader2 className="h-4 w-4 animate-spin" /> 正在思考...
                          </span>
                        )
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Interrupted banner */}
            {interrupted && (
              <div className="flex items-center justify-between border-t border-danger-200 bg-danger-50 px-5 py-2 text-xs text-danger-700">
                <span>连接中断，可重试</span>
                <Button variant="ghost" size="xs" onClick={handleRetry}>重试</Button>
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-brand-100 p-4">
              <div className="flex items-end gap-2">
                <textarea
                  className="flex-1 resize-none rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900 disabled:bg-brand-50"
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                  disabled={streaming}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || streaming || !currentSession}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-brand-400">
            <MessageSquare className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-base font-medium text-brand-600">选择一个在线 Agent 开始对话</p>
            <p className="mt-1 text-sm">从左侧列表选择在线状态的 Agent</p>
          </div>
        )}
      </div>
    </div>
  )
}
