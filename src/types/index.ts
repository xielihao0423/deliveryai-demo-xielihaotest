export type AgentType = 'codex_appserver' | 'trae_cli'
export type AgentStatus = 'online' | 'offline' | 'error'

export interface Agent {
  id: string
  name: string
  type: AgentType
  endpoint: string
  auth_config: string | null
  note: string | null
  status: AgentStatus
  last_check_at: string | null
  created_at: string
  updated_at: string
  skill_count?: number
}

export interface AgentInput {
  name: string
  type: AgentType
  endpoint: string
  auth_config?: string
  note?: string
}

export interface Skill {
  id: string
  agent_id: string
  name: string
  description: string
  config: string
  enabled: boolean
  synced_at: string
}

export type SessionSource = 'web' | 'feishu'
export type SessionStatus = 'active' | 'archived'

export interface Session {
  id: string
  agent_id: string
  source: SessionSource
  status: SessionStatus
  title: string | null
  created_at: string
  last_active_at: string
  archived_at: string | null
  agent_name?: string | null
  agent_status?: string | null
  agent_type?: string | null
  message_count?: number
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  streaming_completed: boolean
  created_at: string
}

export interface SessionDetail extends Session {
  messages: Message[]
}

export interface FeishuConfig {
  webhook_url: string
  bot_app_id: string
  bot_app_secret: string
  enabled: boolean
}

export interface FeishuEvent {
  event_type: string
  enabled: boolean
}

export interface PushLog {
  id: string
  event_type: string
  message: string
  status: 'success' | 'failed'
  created_at: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
