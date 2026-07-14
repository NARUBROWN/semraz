import { useEffect, useState } from 'react'
import './AdminDashboard.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

const TOKEN_KEY = 'semraz-admin-token'
const USER_KEY = 'semraz-admin-user'

function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/**
 * fetch wrapper that attaches the admin bearer token and, on an expired/invalid
 * session (401), clears the stored credentials and reloads back to the login screen.
 */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })

  if (res.status === 401) {
    clearAdminSession()
    window.location.reload()
    throw new Error('Session expired')
  }

  return res
}

type AdminUser = {
  name: string
  email: string
  role: string
}

type DashboardOverview = {
  totalUsers: number
  totalWorkspaces: number
  totalLlmCalls: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  avgDurationMs: number
  totalCostKrw: number
  dailyUsage: Array<{ date: string; calls: number; tokens: number }>
  usageByModel: Array<{ model: string; calls: number; totalTokens: number; costKrw: number }>
  usageByCaller: Array<{ caller: string; calls: number; tokens: number }>
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'blocked'
  createdAt: string
  workspaces: {
    total: number
    planning: number
    verified: number
    compileFailed: number
  }
}

type WorkspaceRow = {
  id: string
  name: string
  ownerName: string
  ownerEmail: string
  status: string
  currentStep: string
  entitiesCount: number
  operationsCount: number
  generationWorkspaceId: string | null
  createdAt: string
  usage: {
    calls: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costKrw: number
  }
}

type LlmCallRow = {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  userStatus: 'active' | 'blocked' | null
  workspaceId: string | null
  model: string
  caller: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  durationMs: number
  costKrw: number
  createdAt: string
}

type FeedbackRow = {
  id: string
  userId: string | null
  userEmail: string
  userName: string
  page: string
  description: string
  logs: string | null
  serverLogs: string | null
  userAgent: string
  viewport: string
  createdAt: string
  hasScreenshot: boolean
}

type AdminTab = 'overview' | 'users' | 'workspaces' | 'llm-calls' | 'feedback'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatKrw(n: number): string {
  if (n >= 10000) return `${Math.round(n).toLocaleString('ko-KR')}원`
  if (n >= 1) return `${n.toFixed(1)}원`
  if (n > 0) return `${n.toFixed(2)}원`
  return '0원'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function setUserBlocked(userId: string, blocked: boolean): Promise<boolean> {
  const action = blocked ? 'block' : 'unblock'
  const res = await adminFetch(`/api/admin/users/${userId}/${action}`, {
    method: 'POST',
  })
  return res.ok
}

async function deleteUser(userId: string): Promise<boolean> {
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  })
  return res.ok
}

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? (JSON.parse(stored) as AdminUser) : null
  })
  const [adminToken, setAdminToken] = useState<string | null>(() => getAdminToken())

  if (!adminUser || !adminToken) {
    return <AdminLogin onLogin={(user, token) => { setAdminUser(user); setAdminToken(token) }} />
  }

  return (
    <AdminApp
      user={adminUser}
      onLogout={() => {
        clearAdminSession()
        setAdminUser(null)
        setAdminToken(null)
      }}
    />
  )
}

function AdminLogin({ onLogin }: { onLogin: (user: AdminUser, token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? 'Login failed')
      }

      const data = await res.json()
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      onLogin(data.user, data.token)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <span className="admin-brand">S<i>.</i></span>
          <h1>Admin Console</h1>
          <p className="admin-login-hint">Sign in with your admin account</p>
        </div>
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="admin-error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AdminApp({ user, onLogout }: { user: AdminUser; onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('overview')

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="admin-brand">S<i>.</i></span>
          <span className="admin-sidebar-title">Admin</span>
        </div>
        <nav className="admin-sidebar-nav">
          {([
            ['overview', 'Overview'],
            ['users', 'Users'],
            ['workspaces', 'Workspaces'],
            ['llm-calls', 'LLM Calls'],
            ['feedback', 'Feedback'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`admin-nav-item${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <span className="admin-nav-dot" />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <div className="admin-sidebar-user">
            <div className="admin-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="admin-user-meta">
              <span className="admin-user-name">{user.name}</span>
              <span className="admin-user-role">{user.role}</span>
            </div>
          </div>
          <button type="button" className="admin-logout-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'workspaces' && <WorkspacesTab />}
        {tab === 'llm-calls' && <LlmCallsTab />}
        {tab === 'feedback' && <FeedbackTab />}
      </main>
    </div>
  )
}

function OverviewTab() {
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch(`/api/admin/dashboard`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Loading...</div>
  if (!data) return <div className="admin-loading">Failed to load data</div>

  const maxDailyTokens = Math.max(...data.dailyUsage.map((d) => d.tokens), 1)

  return (
    <div className="admin-content">
      <h2>Overview</h2>

      <div className="admin-stat-grid">
        <StatCard label="Total Users" value={data.totalUsers} />
        <StatCard label="Total Workspaces" value={data.totalWorkspaces} />
        <StatCard label="LLM Calls" value={data.totalLlmCalls} />
        <StatCard label="Total Tokens" value={formatNumber(data.totalTokens)} />
        <StatCard label="Total Cost" value={formatKrw(data.totalCostKrw)} highlight />
        <StatCard label="Prompt Tokens" value={formatNumber(data.totalPromptTokens)} />
        <StatCard label="Completion Tokens" value={formatNumber(data.totalCompletionTokens)} />
        <StatCard label="Avg Duration" value={`${data.avgDurationMs}ms`} />
      </div>

      <div className="admin-panels">
        <section className="admin-panel">
          <h3>Daily Usage (last 30 days)</h3>
          {data.dailyUsage.length === 0 ? (
            <p className="admin-empty">No usage data yet</p>
          ) : (
            <div className="admin-bar-chart">
              {data.dailyUsage.slice().reverse().map((day) => (
                <div className="admin-bar-col" key={day.date}>
                  <div
                    className="admin-bar"
                    style={{ height: `${Math.max((day.tokens / maxDailyTokens) * 100, 2)}%` }}
                    title={`${day.date}: ${formatNumber(day.tokens)} tokens, ${day.calls} calls`}
                  />
                  <span className="admin-bar-label">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-panel">
          <h3>Usage by Caller</h3>
          {data.usageByCaller.length === 0 ? (
            <p className="admin-empty">No usage data yet</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Calls</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.usageByCaller.map((row) => (
                  <tr key={row.caller}>
                    <td><code>{row.caller}</code></td>
                    <td>{row.calls}</td>
                    <td>{formatNumber(row.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {data.usageByModel.length > 0 && (
        <section className="admin-panel" style={{ marginTop: 20 }}>
          <h3>Cost by Model</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Calls</th>
                <th>Tokens</th>
                <th>Cost (KRW)</th>
              </tr>
            </thead>
            <tbody>
              {data.usageByModel.map((row) => (
                <tr key={row.model}>
                  <td><code>{row.model}</code></td>
                  <td className="num">{row.calls}</td>
                  <td className="num">{formatNumber(row.totalTokens)}</td>
                  <td className="num admin-cost">{formatKrw(row.costKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  function loadUsers() {
    adminFetch(`/api/admin/users`)
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function toggleBlock(user: UserRow) {
    const nextBlocked = user.status !== 'blocked'
    if (nextBlocked && !window.confirm(`${user.name} (${user.email}) 계정을 차단할까요?`)) {
      return
    }
    setPendingId(user.id)
    const ok = await setUserBlocked(user.id, nextBlocked)
    if (ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: nextBlocked ? 'blocked' : 'active' } : u)),
      )
    }
    setPendingId(null)
  }

  async function removeUser(user: UserRow) {
    if (
      !window.confirm(
        `${user.name} (${user.email}) 계정을 삭제할까요?\n워크스페이스와 세션이 모두 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return
    }
    setPendingId(user.id)
    const ok = await deleteUser(user.id)
    if (ok) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    }
    setPendingId(null)
  }

  if (loading) return <div className="admin-loading">Loading...</div>

  return (
    <div className="admin-content">
      <h2>Users ({users.length})</h2>
      {users.length === 0 ? (
        <p className="admin-empty">No users registered yet</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Workspaces</th>
                <th>Planning</th>
                <th>Verified</th>
                <th>Failed</th>
                <th>Joined</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td><code>{u.role}</code></td>
                  <td>
                    <span className={`admin-status-pill admin-status-${u.status === 'blocked' ? 'compile_failed' : 'verified'}`}>
                      {u.status === 'blocked' ? 'blocked' : 'active'}
                    </span>
                  </td>
                  <td className="num">{u.workspaces.total}</td>
                  <td className="num">{u.workspaces.planning}</td>
                  <td className="num">{u.workspaces.verified}</td>
                  <td className="num">{u.workspaces.compileFailed}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <div className="admin-action-group">
                      <button
                        type="button"
                        className={u.status === 'blocked' ? 'admin-unblock-btn' : 'admin-block-btn'}
                        disabled={pendingId === u.id}
                        onClick={() => toggleBlock(u)}
                      >
                        {pendingId === u.id ? '...' : u.status === 'blocked' ? 'Unblock' : 'Block'}
                      </button>
                      <button
                        type="button"
                        className="admin-delete-btn"
                        disabled={pendingId === u.id}
                        onClick={() => removeUser(u)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WorkspacesTab() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch(`/api/admin/workspaces`)
      .then((r) => r.json())
      .then(setWorkspaces)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Loading...</div>

  return (
    <div className="admin-content">
      <h2>Workspaces ({workspaces.length})</h2>
      {workspaces.length === 0 ? (
        <p className="admin-empty">No workspaces yet</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Step</th>
                <th>Entities</th>
                <th>Endpoints</th>
                <th>LLM Calls</th>
                <th>Tokens Used</th>
                <th>Cost (KRW)</th>
                <th>Created</th>
                <th>App</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id}>
                  <td><strong>{ws.name}</strong></td>
                  <td>
                    <span className="admin-owner-cell">
                      {ws.ownerName}
                      <span className="admin-owner-email">{ws.ownerEmail}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`admin-status-pill admin-status-${ws.status}`}>
                      {ws.status}
                    </span>
                  </td>
                  <td>{ws.currentStep}</td>
                  <td className="num">{ws.entitiesCount}</td>
                  <td className="num">{ws.operationsCount}</td>
                  <td className="num">{ws.usage.calls}</td>
                  <td className="num">{formatNumber(ws.usage.totalTokens)}</td>
                  <td className="num admin-cost">{formatKrw(ws.usage.costKrw)}</td>
                  <td>{formatDate(ws.createdAt)}</td>
                  <td>
                    {ws.generationWorkspaceId ? (
                      <a
                        className="admin-download-btn"
                        href={`${apiBaseUrl}/api/generate/workspace/${ws.generationWorkspaceId}/nestjs/download`}
                        download
                      >
                        Download
                      </a>
                    ) : (
                      <span className="admin-no-app">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LlmCallsTab() {
  const [calls, setCalls] = useState<LlmCallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    adminFetch(`/api/admin/llm-calls`)
      .then((r) => r.json())
      .then(setCalls)
      .finally(() => setLoading(false))
  }, [])

  async function toggleBlock(call: LlmCallRow) {
    if (!call.userId) return
    const nextBlocked = call.userStatus !== 'blocked'
    if (
      nextBlocked &&
      !window.confirm(`${call.userName ?? '이 사용자'} (${call.userEmail ?? call.userId}) 계정을 차단할까요?`)
    ) {
      return
    }
    setPendingId(call.userId)
    const ok = await setUserBlocked(call.userId, nextBlocked)
    if (ok) {
      const targetUserId = call.userId
      setCalls((prev) =>
        prev.map((c) =>
          c.userId === targetUserId ? { ...c, userStatus: nextBlocked ? 'blocked' : 'active' } : c,
        ),
      )
    }
    setPendingId(null)
  }

  async function removeUser(call: LlmCallRow) {
    if (!call.userId) return
    if (
      !window.confirm(
        `${call.userName ?? '이 사용자'} (${call.userEmail ?? call.userId}) 계정을 삭제할까요?\n워크스페이스와 세션이 모두 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return
    }
    const targetUserId = call.userId
    setPendingId(targetUserId)
    const ok = await deleteUser(targetUserId)
    if (ok) {
      setCalls((prev) =>
        prev.map((c) =>
          c.userId === targetUserId
            ? { ...c, userId: null, userName: null, userEmail: null, userStatus: null }
            : c,
        ),
      )
    }
    setPendingId(null)
  }

  if (loading) return <div className="admin-loading">Loading...</div>

  return (
    <div className="admin-content">
      <h2>Recent LLM Calls ({calls.length})</h2>
      {calls.length === 0 ? (
        <p className="admin-empty">No LLM calls recorded yet</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Model</th>
                <th>Caller</th>
                <th>Prompt</th>
                <th>Completion</th>
                <th>Total</th>
                <th>Cost (KRW)</th>
                <th>Duration</th>
                <th>Workspace</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td>{formatDateTime(call.createdAt)}</td>
                  <td>
                    {call.userName || call.userEmail ? (
                      <span className="admin-owner-cell">
                        {call.userName || '-'}
                        <span className="admin-owner-email">{call.userEmail}</span>
                      </span>
                    ) : (
                      <span className="admin-no-app">-</span>
                    )}
                  </td>
                  <td><code>{call.model}</code></td>
                  <td><code>{call.caller}</code></td>
                  <td className="num">{formatNumber(call.promptTokens)}</td>
                  <td className="num">{formatNumber(call.completionTokens)}</td>
                  <td className="num"><strong>{formatNumber(call.totalTokens)}</strong></td>
                  <td className="num admin-cost">{formatKrw(call.costKrw)}</td>
                  <td className="num">{call.durationMs}ms</td>
                  <td>{call.workspaceId ? call.workspaceId.slice(0, 8) + '...' : '-'}</td>
                  <td>
                    {call.userId ? (
                      <div className="admin-action-group">
                        <button
                          type="button"
                          className={call.userStatus === 'blocked' ? 'admin-unblock-btn' : 'admin-block-btn'}
                          disabled={pendingId === call.userId}
                          onClick={() => toggleBlock(call)}
                        >
                          {pendingId === call.userId
                            ? '...'
                            : call.userStatus === 'blocked'
                              ? 'Unblock'
                              : 'Block'}
                        </button>
                        <button
                          type="button"
                          className="admin-delete-btn"
                          disabled={pendingId === call.userId}
                          onClick={() => removeUser(call)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="admin-no-app">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FeedbackTab() {
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FeedbackRow | null>(null)

  useEffect(() => {
    adminFetch(`/api/admin/feedback`)
      .then((r) => r.json())
      .then(setFeedbacks)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Loading...</div>

  return (
    <div className="admin-content">
      <h2>Feedback ({feedbacks.length})</h2>
      {feedbacks.length === 0 ? (
        <p className="admin-empty">No feedback submitted yet</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Page</th>
                <th>Description</th>
                <th>Viewport</th>
                <th>Screenshot</th>
                <th>Logs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {feedbacks.map((fb) => (
                <tr key={fb.id}>
                  <td>{formatDateTime(fb.createdAt)}</td>
                  <td>
                    <span className="admin-owner-cell">
                      {fb.userName || '-'}
                      <span className="admin-owner-email">{fb.userEmail}</span>
                    </span>
                  </td>
                  <td><code>{fb.page || '-'}</code></td>
                  <td className="admin-feedback-desc" title={fb.description}>
                    {fb.description.length > 80 ? `${fb.description.slice(0, 80)}...` : fb.description}
                  </td>
                  <td>{fb.viewport || '-'}</td>
                  <td>{fb.hasScreenshot ? 'Yes' : '-'}</td>
                  <td>{fb.logs || fb.serverLogs ? 'Yes' : '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-download-btn"
                      onClick={() => setSelected(fb)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="admin-feedback-backdrop" onClick={() => setSelected(null)}>
          <div className="admin-feedback-detail" onClick={(e) => e.stopPropagation()}>
            <div className="admin-feedback-detail-head">
              <h3>Feedback detail</h3>
              <button type="button" className="admin-feedback-close" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <dl className="admin-feedback-meta">
              <div><dt>User</dt><dd>{selected.userName || '-'} ({selected.userEmail})</dd></div>
              <div><dt>Page</dt><dd><code>{selected.page || '-'}</code></dd></div>
              <div><dt>Time</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
              <div><dt>Viewport</dt><dd>{selected.viewport || '-'}</dd></div>
              <div><dt>User Agent</dt><dd className="admin-feedback-ua">{selected.userAgent || '-'}</dd></div>
            </dl>
            <h4>Description</h4>
            <p className="admin-feedback-description">{selected.description}</p>
            {selected.hasScreenshot ? (
              <>
                <h4>Screenshot</h4>
                <img
                  className="admin-feedback-screenshot"
                  src={`${apiBaseUrl}/api/admin/feedback/${selected.id}/screenshot?token=${encodeURIComponent(getAdminToken() ?? '')}`}
                  alt="Feedback screenshot"
                />
              </>
            ) : null}
            {selected.logs ? (
              <>
                <h4>Browser logs</h4>
                <pre className="admin-feedback-logs">{selected.logs}</pre>
              </>
            ) : null}
            {selected.serverLogs ? (
              <>
                <h4>Server logs</h4>
                <pre className="admin-feedback-logs">{selected.serverLogs}</pre>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`admin-stat-card${highlight ? ' admin-stat-highlight' : ''}`}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{value}</span>
    </div>
  )
}
