// ─── Agent Types ───

export type AgentType = 'codex_appserver' | 'trae_cli'
export type AgentStatus = 'online' | 'offline' | 'error'

export interface Agent {
  id: string
  name: string
  type: AgentType
  endpoint: string
  auth_config: string | null // encrypted auth info (API Key / Token)
  note: string | null
  status: AgentStatus
  last_check_at: string | null
  created_at: string
  updated_at: string
}

export interface AgentInput {
  name: string
  type: AgentType
  endpoint: string
  auth_config?: string
  note?: string
}

// ─── Skill Types ───

export interface Skill {
  id: string
  agent_id: string
  name: string
  description: string
  config: string // JSON string
  enabled: boolean
  synced_at: string
}

// ─── Session Types ───

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
}

// ─── Message Types ───

export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  session_id: string
  role: MessageRole
  content: string
  streaming_completed: boolean
  created_at: string
}

export interface MessageInput {
  content: string
}

// ─── Feishu Types ───

export interface FeishuConfig {
  id: string
  webhook_url: string
  bot_app_id: string
  bot_app_secret: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export type FeishuEventType = 'agent_online' | 'agent_offline' | 'agent_error' | 'session_completed'

export interface FeishuEvent {
  event_type: FeishuEventType
  enabled: boolean
}

export interface PushLog {
  id: string
  event_type: string
  message: string
  status: 'success' | 'failed'
  created_at: string
}

// ─── API Response ───

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface AgentWithSkills extends Agent {
  skill_count: number
}
