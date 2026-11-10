import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ToastContextProvider } from '@/components/ui/toast'
import { AgentsPage } from '@/components/agents/AgentsPage'
import { AgentDetailPage } from '@/components/agents/AgentDetailPage'
import { ChatPage } from '@/components/chat/ChatPage'
import { SessionsPage } from '@/components/sessions/SessionsPage'
import { FeishuPage } from '@/components/feishu/FeishuPage'

export default function App() {
  return (
    <ToastContextProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/agents" replace />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:id" element={<AgentDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/feishu" element={<FeishuPage />} />
        </Routes>
      </Layout>
    </ToastContextProvider>
  )
}
