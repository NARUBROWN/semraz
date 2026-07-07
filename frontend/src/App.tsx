import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent } from 'react'
import './App.css'

type User = {
  id: string
  name: string
  email: string
  role: string
}

type Project = {
  id: string
  name: string
  description: string
  framework: string
  database: string
  status: 'planning' | 'compile_failed' | 'verified'
  currentStep: string
  updatedAt: string
  metrics: {
    entities: number
    operations: number
    tests: number
  }
}

type DraftProject = {
  name: string
  description: string
  framework: 'NestJS'
  database: 'PostgreSQL' | 'MySQL'
  planning: {
    purpose: string
    constraints: string
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

const statusLabels: Record<Project['status'], string> = {
  planning: 'Planning',
  compile_failed: 'Compile failed',
  verified: 'Verified',
}

const flowSteps = [
  'Project',
  'Planning',
  'ERD',
  'Operations',
  'Generate',
  'Test',
] as const

function buildSkillsMarkdown(draftProject: DraftProject) {
  return `# ${draftProject.name}

## Purpose
${draftProject.planning.purpose}

## Constraints
${draftProject.planning.constraints}

## Target stack
- Framework: NestJS
- Language: TypeScript
- Database: ${draftProject.database}
- Verification: generated code must compile before tests are created`
}

function App() {
  const [email, setEmail] = useState('builder@semraz.dev')
  const [password, setPassword] = useState('semraz')
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [flowStep, setFlowStep] = useState(0)
  const [draftProject, setDraftProject] = useState<DraftProject>({
    name: 'Commerce Backend',
    description: 'Orders, payments, shipments, and member-facing service APIs.',
    framework: 'NestJS',
    database: 'PostgreSQL',
    planning: {
      purpose:
        'Build a reliable commerce backend for orders, payments, shipments, and member-facing service APIs.',
      constraints:
        '- Use NestJS module/controller/service structure\n- Use DTO classes for request validation\n- Generate compile-safe TypeScript\n- Keep the project spec as the source of truth',
    },
  })

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const loginResponse = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!loginResponse.ok) {
        throw new Error('Mock login failed.')
      }

      const loginData = (await loginResponse.json()) as { accessToken: string; user: User }
      const projectsResponse = await fetch(`${apiBaseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
      })

      if (!projectsResponse.ok) {
        throw new Error('Could not load projects.')
      }

      const projectData = (await projectsResponse.json()) as Project[]
      setToken(loginData.accessToken)
      setUser(loginData.user)
      setProjects(projectData)
      setSelectedProjectId(projectData[0]?.id ?? null)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unexpected login error.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleLogout() {
    setToken(null)
    setUser(null)
    setProjects([])
    setSelectedProjectId(null)
    setIsCreating(false)
  }

  function startCreateFlow() {
    setFlowStep(0)
    setIsCreating(true)
  }

  function finishCreateFlow() {
    const newProject: Project = {
      id: `prj_${Date.now()}`,
      name: draftProject.name,
      description: draftProject.description,
      framework: draftProject.framework,
      database: draftProject.database,
      status: 'verified',
      currentStep: 'Test',
      updatedAt: new Date().toISOString(),
      metrics: {
        entities: 4,
        operations: 16,
        tests: 12,
      },
    }

    setProjects((currentProjects) => [newProject, ...currentProjects])
    setSelectedProjectId(newProject.id)
    setIsCreating(false)
    setFlowStep(0)
  }

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="brand-mark">S</div>
          <p className="eyebrow">Semraz backend builder</p>
          <h1>Measure the spec. Generate the backend.</h1>
          <p className="auth-copy">
            A design-first workspace for planning entities, operations, generated code,
            compile checks, and tests from one source of truth.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in with mock auth'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="brand-mark">S</div>
            <div>
              <p className="eyebrow">Mock authenticated as {user.role}</p>
              <h1>{isCreating ? 'New backend application' : 'Backend workspaces'}</h1>
            </div>
          </div>
          <div className="profile">
            <span>{user.email}</span>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        {isCreating ? (
          <CreateFlow
            draftProject={draftProject}
            flowStep={flowStep}
            onBack={() => setFlowStep((currentStep) => Math.max(currentStep - 1, 0))}
            onCancel={() => setIsCreating(false)}
            onChangeDraft={setDraftProject}
            onFinish={finishCreateFlow}
            onGoToStep={setFlowStep}
            onNext={() =>
              setFlowStep((currentStep) => Math.min(currentStep + 1, flowSteps.length - 1))
            }
          />
        ) : (
          <Dashboard
            projects={projects}
            selectedProject={selectedProject}
            onNewBackend={startCreateFlow}
            onSelectProject={setSelectedProjectId}
          />
        )}
      </section>
    </main>
  )
}

type DashboardProps = {
  projects: Project[]
  selectedProject?: Project
  onNewBackend: () => void
  onSelectProject: (projectId: string) => void
}

function Dashboard({ projects, selectedProject, onNewBackend, onSelectProject }: DashboardProps) {
  return (
    <section className="dashboard-grid">
      <div className="project-list" aria-label="Project list">
        <div className="section-heading">
          <h2>Projects</h2>
          <button type="button" onClick={onNewBackend}>
            New backend
          </button>
        </div>
        {projects.map((project) => (
          <button
            key={project.id}
            className={project.id === selectedProject?.id ? 'project-card selected' : 'project-card'}
            type="button"
            onClick={() => onSelectProject(project.id)}
          >
            <span className={`status ${project.status}`}>{statusLabels[project.status]}</span>
            <strong>{project.name}</strong>
            <p>{project.description}</p>
            <div className="project-meta">
              <span>{project.framework}</span>
              <span>{project.database}</span>
              <span>{project.currentStep}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedProject ? (
        <div className="workspace-preview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{selectedProject.framework} target</p>
              <h2>{selectedProject.name}</h2>
            </div>
            <span className={`status ${selectedProject.status}`}>
              {statusLabels[selectedProject.status]}
            </span>
          </div>

          <div className="metrics">
            <div>
              <span>{selectedProject.metrics.entities}</span>
              Entities
            </div>
            <div>
              <span>{selectedProject.metrics.operations}</span>
              Operations
            </div>
            <div>
              <span>{selectedProject.metrics.tests}</span>
              Tests
            </div>
          </div>

          <div className="spec-panel">
            <h3>skills.md draft</h3>
            <pre>{`# ${selectedProject.name}

## Purpose
Generate a reliable backend from a reviewed Semraz spec.

## Domain model
- Entities are measured in the ERD step.
- CRUD and custom operations are defined before generation.

## Verification
- Compile before test generation.
- Preserve the project spec as the source of truth.`}</pre>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type CreateFlowProps = {
  draftProject: DraftProject
  flowStep: number
  onBack: () => void
  onCancel: () => void
  onChangeDraft: (draftProject: DraftProject) => void
  onFinish: () => void
  onGoToStep: (step: number) => void
  onNext: () => void
}

function CreateFlow({
  draftProject,
  flowStep,
  onBack,
  onCancel,
  onChangeDraft,
  onFinish,
  onGoToStep,
  onNext,
}: CreateFlowProps) {
  const isLastStep = flowStep === flowSteps.length - 1
  const [entities, setEntities] = useState<ErdEntity[]>(initialEntities)
  const [relations, setRelations] = useState<ErdRelation[]>(initialRelations)
  const [operations, setOperations] = useState<BackendOperation[]>(() =>
    createDefaultOperations(initialEntities),
  )
  const [isNestJsAppReady, setIsNestJsAppReady] = useState(false)
  const mustCreateNestJsApp = flowStep === 4 && !isNestJsAppReady

  useEffect(() => {
    setIsNestJsAppReady(false)
    setOperations((currentOperations) => {
      const entityIds = new Set(entities.map((entity) => entity.id))
      const activeOperations = currentOperations
        .filter((operation) => entityIds.has(operation.entityId))
        .map((operation) => {
          const entity = entities.find((currentEntity) => currentEntity.id === operation.entityId)

          return entity
            ? {
                ...operation,
                payloadFieldIds: operation.payloadFieldIds.filter((fieldId) =>
                  entity.fields.some((field) => field.id === fieldId),
                ),
                requestFieldIds: (operation.requestFieldIds ?? operation.payloadFieldIds).filter(
                  (fieldId) => entity.fields.some((field) => field.id === fieldId),
                ),
                responseFieldIds: (operation.responseFieldIds ?? entity.fields.map((field) => field.id)).filter(
                  (fieldId) => entity.fields.some((field) => field.id === fieldId),
                ),
                requestCustomFields: operation.requestCustomFields ?? [],
                responseCustomFields: operation.responseCustomFields ?? [],
              }
            : operation
        })
      const operationIds = new Set(activeOperations.map((operation) => operation.id))
      const missingDefaults = createDefaultOperations(entities).filter(
        (operation) => !operationIds.has(operation.id),
      )

      return [...activeOperations, ...missingDefaults]
    })
  }, [entities])

  useEffect(() => {
    setIsNestJsAppReady(false)
  }, [draftProject, relations, operations])

  return (
    <section className="flow-shell">
      <div className="flow-header">
        <div>
          <p className="eyebrow">Measure seven times</p>
          <h2>{flowSteps[flowStep]}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onCancel}>
          Close
        </button>
      </div>

      <div className="flow-progress" aria-label="Create backend flow progress">
        {flowSteps.map((step, index) => (
          <button
            key={step}
            className={index === flowStep ? 'active' : index < flowStep ? 'done' : ''}
            disabled={index > flowStep}
            type="button"
            onClick={() => onGoToStep(index)}
          >
            <span>{index + 1}</span>
            {step}
          </button>
        ))}
      </div>

      <div className="flow-body">
        {flowStep === 0 ? (
          <ProjectSetup draftProject={draftProject} onChangeDraft={onChangeDraft} />
        ) : null}
        {flowStep === 1 ? (
          <PlanningStep draftProject={draftProject} onChangeDraft={onChangeDraft} />
        ) : null}
        {flowStep === 2 ? (
          <ErdStep
            entities={entities}
            relations={relations}
            onChangeEntities={setEntities}
            onChangeRelations={setRelations}
          />
        ) : null}
        {flowStep === 3 ? (
          <OperationsStep
            entities={entities}
            operations={operations}
            onChangeOperations={setOperations}
          />
        ) : null}
        {flowStep === 4 ? (
          <GenerateStep
            draftProject={draftProject}
            entities={entities}
            relations={relations}
            operations={operations}
            onNestJsAppReadyChange={setIsNestJsAppReady}
          />
        ) : null}
        {flowStep === 5 ? <TestStep draftProject={draftProject} /> : null}
      </div>

      <footer className="flow-actions">
        <button className="ghost-button" type="button" onClick={flowStep === 0 ? onCancel : onBack}>
          {flowStep === 0 ? 'Cancel' : 'Back'}
        </button>
        <button type="button" disabled={mustCreateNestJsApp} onClick={isLastStep ? onFinish : onNext}>
          {isLastStep ? 'Finish mock project' : 'Next'}
        </button>
      </footer>
    </section>
  )
}

type ProjectSetupProps = {
  draftProject: DraftProject
  onChangeDraft: (draftProject: DraftProject) => void
}

function ProjectSetup({ draftProject, onChangeDraft }: ProjectSetupProps) {
  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>Project basics</h3>
        <div className="field-grid">
          <label>
            Name
            <input
              value={draftProject.name}
              onChange={(event) => onChangeDraft({ ...draftProject, name: event.target.value })}
            />
          </label>
          <label>
            Database
            <select
              value={draftProject.database}
              onChange={(event) =>
                onChangeDraft({
                  ...draftProject,
                  database: event.target.value as DraftProject['database'],
                })
              }
            >
              <option>PostgreSQL</option>
              <option>MySQL</option>
            </select>
          </label>
          <label className="wide-field">
            Description
            <textarea
              value={draftProject.description}
              onChange={(event) =>
                onChangeDraft({ ...draftProject, description: event.target.value })
              }
            />
          </label>
        </div>
      </section>

      <section className="flow-panel">
        <h3>Target framework</h3>
        <div className="framework-grid">
          <button className="framework-card selected" type="button">
            <span>TypeScript</span>
            <strong>NestJS</strong>
            <p>
              Module, controller, service, DTO, validation, compile, and Jest test
              flow for the first Semraz MVP.
            </p>
          </button>
          <button className="framework-card disabled" type="button" disabled>
            <span>Go</span>
            <strong>Spine</strong>
            <p>Static, fast, compile-checked service generation.</p>
            <em>Coming soon</em>
          </button>
          <button className="framework-card disabled" type="button" disabled>
            <span>Python</span>
            <strong>FastAPI</strong>
            <p>Pydantic models, routers, OpenAPI, and quick iteration.</p>
            <em>Coming soon</em>
          </button>
        </div>
      </section>
    </div>
  )
}

function PlanningStep({
  draftProject,
  onChangeDraft,
}: {
  draftProject: DraftProject
  onChangeDraft: (draftProject: DraftProject) => void
}) {
  function updatePlanning(key: keyof DraftProject['planning'], value: string) {
    onChangeDraft({
      ...draftProject,
      planning: {
        ...draftProject.planning,
        [key]: value,
      },
    })
  }

  return (
    <div className="flow-grid">
      <section className="flow-panel planning-form-panel">
        <div className="section-heading">
          <h3>Planning inputs</h3>
          <button
            type="button"
            onClick={() =>
              onChangeDraft({
                ...draftProject,
                planning: {
                  purpose:
                    'Build a reliable NestJS backend from a reviewed Semraz specification.',
                  constraints:
                    '- Generate NestJS modules, controllers, services, DTOs, and tests\n- Compile before test generation\n- Preserve user-owned logic blocks on regeneration',
                },
              })
            }
          >
            Scaffold sections
          </button>
        </div>
        <label>
          Purpose
          <textarea
            value={draftProject.planning.purpose}
            onChange={(event) => updatePlanning('purpose', event.target.value)}
          />
        </label>
        <label>
          Constraints
          <textarea
            value={draftProject.planning.constraints}
            onChange={(event) => updatePlanning('constraints', event.target.value)}
          />
        </label>
      </section>

      <section className="flow-panel editor-panel">
        <div className="section-heading">
          <h3>skills.md preview</h3>
          <span className="autosave-pill">Autosaved locally</span>
        </div>
        <pre>{buildSkillsMarkdown(draftProject)}</pre>
        <h3>Assistant checks</h3>
        <ul className="check-list compact">
          <li>Purpose is present and project-specific</li>
          <li>Constraints define the NestJS generation boundary</li>
          <li>NestJS compile/test constraints are explicit</li>
        </ul>
      </section>
    </div>
  )
}

type FieldType = 'uuid' | 'string' | 'int' | 'datetime' | 'boolean' | 'enum'
type Cardinality = '1' | 'N'
type RelationDirection = 'one-way' | 'two-way'

type ErdField = {
  id: string
  name: string
  type: FieldType
  isPrimaryKey: boolean
  isNotNull: boolean
  isForeignKey?: boolean
  referencesEntityId?: string
}

type ErdEntity = {
  id: string
  name: string
  x: number
  y: number
  fields: ErdField[]
}

type ErdRelation = {
  id: string
  sourceId: string
  targetId: string
  sourceCardinality: Cardinality
  targetCardinality: Cardinality
  direction: RelationDirection
  foreignKeyOwnerId?: string
  foreignKeyFieldName?: string
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type OperationKind = 'crud' | 'custom'

type OperationCustomField = {
  id: string
  name: string
  type: FieldType | string
}

type BackendOperation = {
  id: string
  entityId: string
  kind: OperationKind
  label: string
  method: HttpMethod
  path: string
  enabled: boolean
  payloadFieldIds: string[]
  requestFieldIds: string[]
  responseFieldIds: string[]
  requestCustomFields: OperationCustomField[]
  responseCustomFields: OperationCustomField[]
  description: string
}

type GenerateWorkspace = {
  workspaceId: string
  workspacePath: string
  files: string[]
}

type NestJsAgentResult = {
  workspaceId: string
  appPath: string
  files: string[]
  build?: {
    success: boolean
    commands: Array<{
      command: string
      success: boolean
      exitCode: number | null
    }>
    errorSummary?: string
  }
  completedTasks?: Array<{
    taskId: string
    title: string
    success: boolean
    attempts: number
    changedFiles: string[]
  }>
  repairAttempts?: number
}

type AgentProgressEvent = {
  stage: 'started' | 'completed' | 'failed'
  message: string
  detail?: Record<string, unknown>
}

type TerminalLogLine = {
  id: string
  status: 'idle' | 'running' | 'success' | 'error'
  text: string
}

const fieldTypes: FieldType[] = ['uuid', 'string', 'int', 'datetime', 'boolean', 'enum']
const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function toForeignKeyName(entityName: string) {
  return `${entityName
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase())
    .replace(/^\w/, (letter) => letter.toLowerCase())}Id`
}

const initialEntities: ErdEntity[] = [
  {
    id: 'customer',
    name: 'Customer',
    x: 8,
    y: 24,
    fields: [
      { id: 'customer_id', name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
      { id: 'customer_email', name: 'email', type: 'string', isPrimaryKey: false, isNotNull: true },
    ],
  },
  {
    id: 'order',
    name: 'Order',
    x: 38,
    y: 40,
    fields: [
      { id: 'order_id', name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
      {
        id: 'order_customer_id',
        name: 'customerId',
        type: 'uuid',
        isPrimaryKey: false,
        isNotNull: true,
        isForeignKey: true,
        referencesEntityId: 'customer',
      },
      { id: 'order_status', name: 'status', type: 'enum', isPrimaryKey: false, isNotNull: true },
    ],
  },
  {
    id: 'payment',
    name: 'Payment',
    x: 67,
    y: 22,
    fields: [
      { id: 'payment_id', name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
      { id: 'payment_amount', name: 'amount', type: 'int', isPrimaryKey: false, isNotNull: true },
    ],
  },
]

const initialRelations: ErdRelation[] = [
  {
    id: 'rel_customer_order',
    sourceId: 'customer',
    targetId: 'order',
    sourceCardinality: '1',
    targetCardinality: 'N',
    direction: 'two-way',
    foreignKeyOwnerId: 'order',
    foreignKeyFieldName: 'customerId',
  },
]

function toRouteSegment(entityName: string) {
  return entityName
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function createDefaultOperations(entities: ErdEntity[]) {
  return entities.flatMap((entity) => {
    const route = toRouteSegment(entity.name)
    const writableFields = entity.fields
      .filter((field) => !field.isPrimaryKey)
      .map((field) => field.id)

    return [
      {
        id: `${entity.id}_create`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: 'Create',
        method: 'POST' as const,
        path: `/${route}`,
        enabled: true,
        payloadFieldIds: writableFields,
        requestFieldIds: writableFields,
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Creates a new ${entity.name} from the request body, validates required fields, and returns the persisted resource.`,
      },
      {
        id: `${entity.id}_list`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: 'List',
        method: 'GET' as const,
        path: `/${route}`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Returns a paginated collection of ${entity.name} records for browse and admin list screens.`,
      },
      {
        id: `${entity.id}_detail`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: 'Detail',
        method: 'GET' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Returns a single ${entity.name} by id, including the fields needed for a detail view.`,
      },
      {
        id: `${entity.id}_update`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: 'Update',
        method: 'PATCH' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: writableFields,
        requestFieldIds: writableFields,
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Applies partial changes to an existing ${entity.name} and returns the updated resource.`,
      },
      {
        id: `${entity.id}_delete`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: 'Delete',
        method: 'DELETE' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: [],
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Deletes or archives a ${entity.name} by id and returns an operation result for client-side confirmation.`,
      },
    ]
  })
}

function ErdStep({
  entities,
  relations,
  onChangeEntities,
  onChangeRelations,
}: {
  entities: ErdEntity[]
  relations: ErdRelation[]
  onChangeEntities: (entities: ErdEntity[]) => void
  onChangeRelations: (relations: ErdRelation[]) => void
}) {
  const canvasRef = useRef<HTMLElement | null>(null)
  const dragStateRef = useRef<{
    entityId: string
    offsetX: number
    offsetY: number
  } | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id ?? '')
  const [relationDraft, setRelationDraft] = useState<{
    sourceCardinality: Cardinality
    direction: RelationDirection
    targetIds: string[]
  }>({
    sourceCardinality: '1',
    direction: 'two-way',
    targetIds: [],
  })

  function setEntities(nextEntities: ErdEntity[] | ((currentEntities: ErdEntity[]) => ErdEntity[])) {
    onChangeEntities(typeof nextEntities === 'function' ? nextEntities(entities) : nextEntities)
  }

  function setRelations(
    nextRelations: ErdRelation[] | ((currentRelations: ErdRelation[]) => ErdRelation[]),
  ) {
    onChangeRelations(typeof nextRelations === 'function' ? nextRelations(relations) : nextRelations)
  }

  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId)
  const availableTargets = entities.filter((entity) => entity.id !== selectedEntityId)
  const totalColumns = entities.reduce((sum, entity) => sum + entity.fields.length, 0)
  const missingPrimaryKeys = entities.filter(
    (entity) => !entity.fields.some((field) => field.isPrimaryKey),
  )
  const inferredTargetCardinality: Cardinality = relationDraft.targetIds.length > 1 ? 'N' : '1'
  const relationBuilderStyle = selectedEntity
    ? {
        left: `${Math.max(2, Math.min(58, selectedEntity.x))}%`,
        top: `${Math.max(18, selectedEntity.y)}%`,
      }
    : undefined

  useEffect(() => {
    function handleWindowMouseMove(event: MouseEvent) {
      const canvas = canvasRef.current
      const dragState = dragStateRef.current

      if (!canvas || !dragState) {
        return
      }

      const canvasRect = canvas.getBoundingClientRect()
      const pointerX = ((event.clientX - canvasRect.left) / canvasRect.width) * 100
      const pointerY = ((event.clientY - canvasRect.top) / canvasRect.height) * 100

      moveEntity(dragState.entityId, pointerX - dragState.offsetX, pointerY - dragState.offsetY)
    }

    function handleWindowMouseUp() {
      dragStateRef.current = null
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  })

  function addEntity() {
    const nextIndex = entities.length + 1
    const id = `entity_${Date.now()}`
    setEntities((currentEntities) => [
      ...currentEntities,
      {
        id,
        name: `Entity${nextIndex}`,
        x: 12 + ((nextIndex * 17) % 58),
        y: 18 + ((nextIndex * 13) % 46),
        fields: [
          {
            id: `${id}_id`,
            name: 'id',
            type: 'uuid',
            isPrimaryKey: true,
            isNotNull: true,
          },
        ],
      },
    ])
    setSelectedEntityId(id)
    setRelationDraft((currentDraft) => ({ ...currentDraft, targetIds: [] }))
  }

  function updateEntity(entityId: string, updates: Partial<ErdEntity>) {
    setEntities((currentEntities) =>
      currentEntities.map((entity) =>
        entity.id === entityId ? { ...entity, ...updates } : entity,
      ),
    )
  }

  function moveEntity(entityId: string, x: number, y: number) {
    updateEntity(entityId, {
      x: Math.max(1, Math.min(76, x)),
      y: Math.max(10, Math.min(82, y)),
    })
  }

  function startEntityDrag(entityId: string, clientX: number, clientY: number) {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const entity = entities.find((currentEntity) => currentEntity.id === entityId)

    if (!entity) {
      return
    }

    const canvasRect = canvas.getBoundingClientRect()
    const pointerX = ((clientX - canvasRect.left) / canvasRect.width) * 100
    const pointerY = ((clientY - canvasRect.top) / canvasRect.height) * 100

    dragStateRef.current = {
      entityId,
      offsetX: pointerX - entity.x,
      offsetY: pointerY - entity.y,
    }
    setSelectedEntityId(entityId)
  }

  function handleEntityDragStart(entityId: string, event: PointerEvent<HTMLElement>) {
    startEntityDrag(entityId, event.clientX, event.clientY)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleEntityMouseDragStart(entityId: string, event: ReactMouseEvent<HTMLElement>) {
    startEntityDrag(entityId, event.clientX, event.clientY)
    event.preventDefault()
  }

  function handleEntityDrag(entityId: string, event: PointerEvent<HTMLElement>) {
    const canvas = canvasRef.current
    const dragState = dragStateRef.current

    if (!canvas || !dragState || dragState.entityId !== entityId) {
      return
    }

    const canvasRect = canvas.getBoundingClientRect()
    const pointerX = ((event.clientX - canvasRect.left) / canvasRect.width) * 100
    const pointerY = ((event.clientY - canvasRect.top) / canvasRect.height) * 100

    moveEntity(entityId, pointerX - dragState.offsetX, pointerY - dragState.offsetY)
  }

  function handleEntityDragEnd(entityId: string, event: PointerEvent<HTMLElement>) {
    if (dragStateRef.current?.entityId === entityId) {
      dragStateRef.current = null
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function addField(entityId: string) {
    setEntities((currentEntities) =>
      currentEntities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              fields: [
                ...entity.fields,
                {
                  id: `${entityId}_field_${Date.now()}`,
                  name: `column${entity.fields.length + 1}`,
                  type: 'string',
                  isPrimaryKey: false,
                  isNotNull: false,
                },
              ],
            }
          : entity,
      ),
    )
  }

  function updateField(entityId: string, fieldId: string, updates: Partial<ErdField>) {
    setEntities((currentEntities) =>
      currentEntities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              fields: entity.fields.map((field) =>
                field.id === fieldId ? { ...field, ...updates } : field,
              ),
            }
          : entity,
      ),
    )
  }

  function deleteField(entityId: string, fieldId: string) {
    const field = entities
      .find((entity) => entity.id === entityId)
      ?.fields.find((currentField) => currentField.id === fieldId)

    setEntities((currentEntities) =>
      currentEntities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              fields: entity.fields.filter((currentField) => currentField.id !== fieldId),
            }
          : entity,
      ),
    )

    if (field?.isForeignKey) {
      setRelations((currentRelations) =>
        currentRelations.filter(
          (relation) =>
            !(
              relation.foreignKeyOwnerId === entityId &&
              relation.foreignKeyFieldName === field.name
            ),
        ),
      )
    }
  }

  function deleteEntity(entityId: string) {
    const nextEntities = entities.filter((entity) => entity.id !== entityId)
    const nextSelectedEntityId =
      selectedEntityId === entityId ? (nextEntities[0]?.id ?? '') : selectedEntityId

    setEntities(
      nextEntities.map((entity) => ({
        ...entity,
        fields: entity.fields.filter((field) => field.referencesEntityId !== entityId),
      })),
    )
    setRelations((currentRelations) =>
      currentRelations.filter(
        (relation) => relation.sourceId !== entityId && relation.targetId !== entityId,
      ),
    )
    setSelectedEntityId(nextSelectedEntityId)
    setRelationDraft((currentDraft) => ({
      ...currentDraft,
      targetIds: currentDraft.targetIds.filter((targetId) => targetId !== entityId),
    }))
  }

  function deleteRelation(relationId: string) {
    const relation = relations.find((currentRelation) => currentRelation.id === relationId)

    setRelations((currentRelations) =>
      currentRelations.filter((currentRelation) => currentRelation.id !== relationId),
    )

    if (relation?.foreignKeyOwnerId && relation.foreignKeyFieldName) {
      const referencedEntityId =
        relation.foreignKeyOwnerId === relation.sourceId ? relation.targetId : relation.sourceId

      setEntities((currentEntities) =>
        currentEntities.map((entity) =>
          entity.id === relation.foreignKeyOwnerId
            ? {
                ...entity,
                fields: entity.fields.filter(
                  (field) =>
                    !(
                      field.isForeignKey &&
                      field.name === relation.foreignKeyFieldName &&
                      field.referencesEntityId === referencedEntityId
                    ),
                ),
              }
            : entity,
        ),
      )
    }
  }

  function toggleRelationTarget(targetId: string) {
    setRelationDraft((currentDraft) => ({
      ...currentDraft,
      targetIds: currentDraft.targetIds.includes(targetId)
        ? currentDraft.targetIds.filter((id) => id !== targetId)
        : [...currentDraft.targetIds, targetId],
    }))
  }

  function createRelations() {
    if (!selectedEntity || relationDraft.targetIds.length === 0) {
      return
    }

    const nextRelations: ErdRelation[] = relationDraft.targetIds.map((targetId) => {
      const targetEntity = entities.find((entity) => entity.id === targetId)
      const foreignKeyOwnerId =
        relationDraft.sourceCardinality === 'N' ? selectedEntity.id : targetId
      const parentEntity =
        relationDraft.sourceCardinality === 'N' ? targetEntity : selectedEntity

      return {
        id: `rel_${selectedEntity.id}_${targetId}_${Date.now()}`,
        sourceId: selectedEntity.id,
        targetId,
        sourceCardinality: relationDraft.sourceCardinality,
        targetCardinality: inferredTargetCardinality,
        direction: relationDraft.direction,
        foreignKeyOwnerId,
        foreignKeyFieldName: parentEntity ? toForeignKeyName(parentEntity.name) : undefined,
      }
    })

    setRelations((currentRelations) => [...currentRelations, ...nextRelations])
    setEntities((currentEntities) =>
      currentEntities.map((entity) => {
        const fieldsToAdd = nextRelations.reduce<ErdField[]>((fields, relation) => {
            if (relation.sourceCardinality === 'N') {
              if (entity.id !== relation.sourceId) {
                return fields
              }
            } else if (relation.targetCardinality === 'N') {
              if (entity.id !== relation.targetId) {
                return fields
              }
            } else if (entity.id !== relation.targetId) {
              return fields
            }

            const parentEntity =
              relation.sourceCardinality === 'N'
                ? currentEntities.find((candidate) => candidate.id === relation.targetId)
                : currentEntities.find((candidate) => candidate.id === relation.sourceId)

            if (!parentEntity) {
              return fields
            }

            const fieldName = toForeignKeyName(parentEntity.name)
            const alreadyExists = entity.fields.some((field) => field.name === fieldName)

            if (alreadyExists) {
              return fields
            }

            fields.push({
              id: `${entity.id}_${fieldName}_${Date.now()}`,
              name: fieldName,
              type: 'uuid',
              isPrimaryKey: false,
              isNotNull: relation.targetCardinality === 'N',
              isForeignKey: true,
              referencesEntityId: parentEntity.id,
            })

            return fields
          }, [])

        return fieldsToAdd.length > 0
          ? {
              ...entity,
              fields: [...entity.fields, ...fieldsToAdd],
            }
          : entity
      }),
    )
    setRelationDraft((currentDraft) => ({ ...currentDraft, targetIds: [] }))
  }

  function clearSelectionFromCanvas(event: ReactMouseEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return
    }

    setSelectedEntityId('')
    setRelationDraft((currentDraft) => ({ ...currentDraft, targetIds: [] }))
  }

  return (
    <div className="erd-layout">
      <section className="canvas-panel" ref={canvasRef} onClick={clearSelectionFromCanvas}>
        <div className="erd-toolbar">
          <button type="button" onClick={addEntity}>
            Add entity
          </button>
        </div>

        {selectedEntity ? (
          <div className="relation-builder floating" style={relationBuilderStyle}>
            <div className="relation-builder-header">
              <span>Relation from</span>
              <strong>{selectedEntity.name}</strong>
            </div>
            <div className="relation-controls">
              <label>
                Side
                <select
                  value={relationDraft.sourceCardinality}
                  onChange={(event) =>
                    setRelationDraft({
                      ...relationDraft,
                      sourceCardinality: event.target.value as Cardinality,
                    })
                  }
                >
                  <option value="1">1</option>
                  <option value="N">N</option>
                </select>
              </label>
              <label>
                Direction
                <select
                  value={relationDraft.direction}
                  onChange={(event) =>
                    setRelationDraft({
                      ...relationDraft,
                      direction: event.target.value as RelationDirection,
                    })
                  }
                >
                  <option value="two-way">Bidirectional</option>
                  <option value="one-way">Unidirectional</option>
                </select>
              </label>
            </div>
            <div className="target-picker">
              {availableTargets.map((entity) => (
                <label key={entity.id}>
                  <input
                    checked={relationDraft.targetIds.includes(entity.id)}
                    type="checkbox"
                    onChange={() => toggleRelationTarget(entity.id)}
                  />
                  {entity.name}
                </label>
              ))}
            </div>
            <div className="relation-builder-footer">
              <span className="relation-hint">
                Opposite: {relationDraft.targetIds.length === 0 ? '?' : inferredTargetCardinality}
              </span>
              <button
                type="button"
                disabled={relationDraft.targetIds.length === 0}
                onClick={createRelations}
              >
                Set relation
              </button>
            </div>
          </div>
        ) : null}

        <svg className="relation-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="arrow-end" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
              <path d="M0,0 L6,3 L0,6 Z" />
            </marker>
            <marker id="arrow-start" markerHeight="6" markerWidth="6" orient="auto" refX="1" refY="3">
              <path d="M6,0 L0,3 L6,6 Z" />
            </marker>
          </defs>
          {relations.map((relation) => {
            const source = entities.find((entity) => entity.id === relation.sourceId)
            const target = entities.find((entity) => entity.id === relation.targetId)

            if (!source || !target) {
              return null
            }

            const sourceX = source.x + 13
            const sourceY = source.y + 10
            const targetX = target.x + 13
            const targetY = target.y + 10
            const labelX = (sourceX + targetX) / 2
            const labelY = (sourceY + targetY) / 2

            return (
              <g key={relation.id}>
                <line
                  markerEnd="url(#arrow-end)"
                  markerStart={relation.direction === 'two-way' ? 'url(#arrow-start)' : undefined}
                  x1={sourceX}
                  x2={targetX}
                  y1={sourceY}
                  y2={targetY}
                />
                <text x={labelX} y={labelY}>
                  {relation.sourceCardinality}:{relation.targetCardinality}
                </text>
              </g>
            )
          })}
        </svg>

        {entities.map((entity) => (
          <EntityNode
            key={entity.id}
            entity={entity}
            isSelected={entity.id === selectedEntityId}
            onAddField={addField}
            onDeleteEntity={deleteEntity}
            onDeleteField={deleteField}
            onDrag={handleEntityDrag}
            onDragEnd={handleEntityDragEnd}
            onMouseDragStart={handleEntityMouseDragStart}
            onDragStart={handleEntityDragStart}
            onSelect={setSelectedEntityId}
            onUpdateEntity={updateEntity}
            onUpdateField={updateField}
          />
        ))}
      </section>
      <section className="flow-panel">
        <h3>Properties</h3>
        <div className="property-list">
          <span>Entities: {entities.length}</span>
          <span>Columns: {totalColumns}</span>
          <span>Relations: {relations.length}</span>
          <span>
            Selected: {selectedEntity ? `${selectedEntity.name} (${selectedEntity.fields.length} columns)` : 'None'}
          </span>
          <span>
            PK warnings:{' '}
            {missingPrimaryKeys.length === 0
              ? 'none'
              : missingPrimaryKeys.map((entity) => entity.name).join(', ')}
          </span>
        </div>
        <div className="relation-summary">
          <h3>Relations</h3>
          {relations.length === 0 ? (
            <p className="muted-copy">No relations yet.</p>
          ) : (
            relations.map((relation) => {
              const source = entities.find((entity) => entity.id === relation.sourceId)
              const target = entities.find((entity) => entity.id === relation.targetId)

              return (
                <div className="relation-summary-row" key={relation.id}>
                  <span>
                    {source?.name ?? 'Unknown'} {relation.sourceCardinality}:
                    {relation.targetCardinality} {relation.direction === 'two-way' ? '<->' : '->'}{' '}
                    {target?.name ?? 'Unknown'}
                  </span>
                  <button type="button" onClick={() => deleteRelation(relation.id)}>
                    Delete
                  </button>
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

function EntityNode({
  entity,
  isSelected,
  onAddField,
  onDeleteEntity,
  onDeleteField,
  onDrag,
  onDragEnd,
  onDragStart,
  onMouseDragStart,
  onSelect,
  onUpdateEntity,
  onUpdateField,
}: {
  entity: ErdEntity
  isSelected: boolean
  onAddField: (entityId: string) => void
  onDeleteEntity: (entityId: string) => void
  onDeleteField: (entityId: string, fieldId: string) => void
  onDrag: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onDragEnd: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onDragStart: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onMouseDragStart: (entityId: string, event: ReactMouseEvent<HTMLElement>) => void
  onSelect: (entityId: string) => void
  onUpdateEntity: (entityId: string, updates: Partial<ErdEntity>) => void
  onUpdateField: (entityId: string, fieldId: string, updates: Partial<ErdField>) => void
}) {
  return (
    <div
      className={isSelected ? 'entity-node selected' : 'entity-node'}
      style={{ left: `${entity.x}%`, top: `${entity.y}%` }}
      onClick={() => onSelect(entity.id)}
    >
      <div
        className="entity-header"
        onMouseDown={(event) => onMouseDragStart(entity.id, event)}
        onPointerDown={(event) => onDragStart(entity.id, event)}
        onPointerMove={(event) => onDrag(entity.id, event)}
        onPointerUp={(event) => onDragEnd(entity.id, event)}
      >
        <span className="entity-drag-handle" aria-label={`Drag ${entity.name}`}>
          Drag
        </span>
        <input
          className="entity-name-input"
          value={entity.name}
          onChange={(event) => onUpdateEntity(entity.id, { name: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
        <button
          className="entity-delete-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDeleteEntity(entity.id)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          Delete
        </button>
      </div>
      <div className="field-table">
        {entity.fields.map((field) => (
          <div
            className="field-row"
            key={field.id}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              aria-label={`${entity.name} ${field.name} column name`}
              value={field.name}
              onChange={(event) => onUpdateField(entity.id, field.id, { name: event.target.value })}
            />
            <select
              aria-label={`${entity.name} ${field.name} type`}
              value={field.type}
              onChange={(event) =>
                onUpdateField(entity.id, field.id, { type: event.target.value as FieldType })
              }
            >
              {fieldTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <label title="Primary key">
              <input
                checked={field.isPrimaryKey}
                type="checkbox"
                onChange={(event) =>
                  onUpdateField(entity.id, field.id, {
                    isPrimaryKey: event.target.checked,
                    isNotNull: event.target.checked ? true : field.isNotNull,
                  })
                }
              />
              PK
            </label>
            <label title="Not null">
              <input
                checked={field.isNotNull}
                type="checkbox"
                onChange={(event) =>
                  onUpdateField(entity.id, field.id, { isNotNull: event.target.checked })
                }
              />
              NN
            </label>
            <span className={field.isForeignKey ? 'field-fk-badge' : 'field-fk-badge empty'}>
              {field.isForeignKey ? 'FK' : ''}
            </span>
            <button
              className="field-delete-button"
              type="button"
              onClick={() => onDeleteField(entity.id, field.id)}
            >
              X
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAddField(entity.id)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        Add column
      </button>
    </div>
  )
}

function OperationsStep({
  entities,
  operations,
  onChangeOperations,
}: {
  entities: ErdEntity[]
  operations: BackendOperation[]
  onChangeOperations: (operations: BackendOperation[]) => void
}) {
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id ?? '')
  const [fieldTab, setFieldTab] = useState<'request' | 'response'>('request')
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? entities[0]
  const selectedOperations = selectedEntity
    ? operations.filter((operation) => operation.entityId === selectedEntity.id)
    : []
  const enabledOperations = selectedOperations.filter((operation) => operation.enabled)

  useEffect(() => {
    if (!selectedEntityId && entities[0]) {
      setSelectedEntityId(entities[0].id)
      return
    }

    if (selectedEntityId && !entities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(entities[0]?.id ?? '')
    }
  }, [entities, selectedEntityId])

  function updateOperation(operationId: string, updates: Partial<BackendOperation>) {
    onChangeOperations(
      operations.map((operation) =>
        operation.id === operationId ? { ...operation, ...updates } : operation,
      ),
    )
  }

  function selectedFieldIds(operation: BackendOperation, tab: 'request' | 'response') {
    if (tab === 'request') {
      return operation.requestFieldIds ?? operation.payloadFieldIds
    }

    return operation.responseFieldIds ?? selectedEntity?.fields.map((field) => field.id) ?? []
  }

  function toggleOperationField(
    operation: BackendOperation,
    fieldId: string,
    tab: 'request' | 'response',
  ) {
    const currentFieldIds = selectedFieldIds(operation, tab)
    const nextFieldIds = currentFieldIds.includes(fieldId)
      ? currentFieldIds.filter((currentFieldId) => currentFieldId !== fieldId)
      : [...currentFieldIds, fieldId]

    updateOperation(operation.id, {
      ...(tab === 'request'
        ? { requestFieldIds: nextFieldIds, payloadFieldIds: nextFieldIds }
        : { responseFieldIds: nextFieldIds }),
    })
  }

  function customFields(operation: BackendOperation, tab: 'request' | 'response') {
    return tab === 'request'
      ? operation.requestCustomFields ?? []
      : operation.responseCustomFields ?? []
  }

  function updateCustomFields(
    operation: BackendOperation,
    tab: 'request' | 'response',
    fields: OperationCustomField[],
  ) {
    updateOperation(operation.id, {
      ...(tab === 'request'
        ? { requestCustomFields: fields }
        : { responseCustomFields: fields }),
    })
  }

  function addCustomField(operation: BackendOperation, tab: 'request' | 'response') {
    const fields = customFields(operation, tab)
    updateCustomFields(operation, tab, [
      ...fields,
      {
        id: `custom_${Date.now()}`,
        name: `customField${fields.length + 1}`,
        type: 'string',
      },
    ])
  }

  function updateCustomField(
    operation: BackendOperation,
    tab: 'request' | 'response',
    fieldId: string,
    updates: Partial<OperationCustomField>,
  ) {
    updateCustomFields(
      operation,
      tab,
      customFields(operation, tab).map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    )
  }

  function deleteCustomField(
    operation: BackendOperation,
    tab: 'request' | 'response',
    fieldId: string,
  ) {
    updateCustomFields(
      operation,
      tab,
      customFields(operation, tab).filter((field) => field.id !== fieldId),
    )
  }

  function addCustomOperation() {
    if (!selectedEntity) {
      return
    }

    const route = toRouteSegment(selectedEntity.name)
    const customCount =
      operations.filter(
        (operation) => operation.entityId === selectedEntity.id && operation.kind === 'custom',
      ).length + 1

    onChangeOperations([
      ...operations,
      {
        id: `${selectedEntity.id}_custom_${Date.now()}`,
        entityId: selectedEntity.id,
        kind: 'custom',
        label: `Custom action ${customCount}`,
        method: 'POST',
        path: `/${route}/action-${customCount}`,
        enabled: true,
        payloadFieldIds: selectedEntity.fields
          .filter((field) => !field.isPrimaryKey)
          .map((field) => field.id),
        requestFieldIds: selectedEntity.fields
          .filter((field) => !field.isPrimaryKey)
          .map((field) => field.id),
        responseFieldIds: selectedEntity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: `Runs a domain-specific ${selectedEntity.name} action and returns the workflow result for the caller.`,
      },
    ])
  }

  function deleteCustomOperation(operationId: string) {
    onChangeOperations(operations.filter((operation) => operation.id !== operationId))
  }

  return (
    <div className="operations-layout">
      <section className="flow-panel entity-operation-list">
        <div className="section-heading">
          <h3>Entities</h3>
          <span className="autosave-pill">{entities.length} mapped</span>
        </div>
        {entities.map((entity) => (
          <button
            key={entity.id}
            className={entity.id === selectedEntity?.id ? 'selected' : ''}
            type="button"
            onClick={() => setSelectedEntityId(entity.id)}
          >
            <strong>{entity.name}</strong>
            <span>
              {operations.filter((operation) => operation.entityId === entity.id && operation.enabled)
                .length}{' '}
              ops
            </span>
          </button>
        ))}
      </section>

      <section className="flow-panel operation-config-panel">
        <div className="section-heading">
          <h3>{selectedEntity ? `${selectedEntity.name} operations` : 'Operations'}</h3>
          <button type="button" onClick={addCustomOperation} disabled={!selectedEntity}>
            Add custom
          </button>
        </div>
        {selectedEntity ? (
          <div className="operation-editor-list">
            {selectedOperations.map((operation) => (
              <article className="operation-editor" key={operation.id}>
                <div className="operation-editor-title">
                  <label>
                    <input
                      checked={operation.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateOperation(operation.id, { enabled: event.target.checked })
                      }
                    />
                    <span>{operation.kind === 'crud' ? 'CRUD' : 'Custom'}</span>
                  </label>
                  {operation.kind === 'custom' ? (
                    <button type="button" onClick={() => deleteCustomOperation(operation.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>

                <div className="operation-fields">
                  <label>
                    Name
                    <input
                      value={operation.label}
                      onChange={(event) =>
                        updateOperation(operation.id, { label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Method
                    <select
                      value={operation.method}
                      onChange={(event) =>
                        updateOperation(operation.id, {
                          method: event.target.value as HttpMethod,
                        })
                      }
                    >
                      {httpMethods.map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label className="operation-path-field">
                    Path
                    <input
                      value={operation.path}
                      onChange={(event) =>
                        updateOperation(operation.id, { path: event.target.value })
                      }
                    />
                  </label>
                  <label className="operation-description-field">
                    API description
                    <textarea
                      value={operation.description ?? ''}
                      onChange={(event) =>
                        updateOperation(operation.id, { description: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="payload-picker">
                  <div className="field-tab-list" role="tablist" aria-label="API field direction">
                    <button
                      className={fieldTab === 'request' ? 'active' : ''}
                      type="button"
                      onClick={() => setFieldTab('request')}
                    >
                      Request
                    </button>
                    <button
                      className={fieldTab === 'response' ? 'active' : ''}
                      type="button"
                      onClick={() => setFieldTab('response')}
                    >
                      Response
                    </button>
                  </div>
                  {selectedEntity.fields.map((field) => (
                    <label key={field.id}>
                      <input
                        checked={selectedFieldIds(operation, fieldTab).includes(field.id)}
                        type="checkbox"
                        onChange={() => toggleOperationField(operation, field.id, fieldTab)}
                      />
                      {field.name}
                      <em>{field.type}</em>
                    </label>
                  ))}
                  <div className="custom-field-editor">
                    <div className="custom-field-heading">
                      <span>Custom fields</span>
                      <button
                        type="button"
                        onClick={() => addCustomField(operation, fieldTab)}
                      >
                        Add field
                      </button>
                    </div>
                    {customFields(operation, fieldTab).map((field) => (
                      <div className="custom-field-row" key={field.id}>
                        <input
                          aria-label="Custom field name"
                          value={field.name}
                          onChange={(event) =>
                            updateCustomField(operation, fieldTab, field.id, {
                              name: event.target.value,
                            })
                          }
                        />
                        <select
                          aria-label="Custom field type"
                          value={field.type}
                          onChange={(event) =>
                            updateCustomField(operation, fieldTab, field.id, {
                              type: event.target.value,
                            })
                          }
                        >
                          {fieldTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                          <option>object</option>
                          <option>array</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => deleteCustomField(operation, fieldTab, field.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">Add entities in the ERD step first.</p>
        )}
      </section>

      <section className="flow-panel operation-preview-panel">
        <h3>API Preview</h3>
        <div className="api-preview">
          {enabledOperations.length === 0 ? (
            <p className="muted-copy">No enabled operations for this entity.</p>
          ) : (
            enabledOperations.map((operation) => (
              <div className="api-preview-block" key={operation.id}>
                <strong>
                  {operation.method} {operation.path}
                </strong>
                {operation.description ? <p>{operation.description}</p> : null}
                <span>Request</span>
                <code>{formatFieldPreview(selectedEntity, operation, 'request')}</code>
                <span>Response</span>
                <code>{formatFieldPreview(selectedEntity, operation, 'response')}</code>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function formatFieldPreview(
  entity: ErdEntity | undefined,
  operation: BackendOperation,
  direction: 'request' | 'response',
) {
  const fieldIds =
    direction === 'request'
      ? operation.requestFieldIds ?? operation.payloadFieldIds
      : operation.responseFieldIds ?? entity?.fields.map((field) => field.id) ?? []

  if (!entity || fieldIds.length === 0) {
    const customOnlyPayload = (direction === 'request'
      ? operation.requestCustomFields ?? []
      : operation.responseCustomFields ?? []
    ).map((field) => `  "${field.name}": "${field.type}"`)

    return customOnlyPayload.length > 0 ? `{\n${customOnlyPayload.join(',\n')}\n}` : '{}'
  }

  const payload = entity.fields
    .filter((field) => fieldIds.includes(field.id))
    .map((field) => `  "${field.name}": "${field.type}"`)
  const customPayload = (direction === 'request'
    ? operation.requestCustomFields ?? []
    : operation.responseCustomFields ?? []
  ).map((field) => `  "${field.name}": "${field.type}"`)

  return `{\n${[...payload, ...customPayload].join(',\n')}\n}`
}

function GenerateStep({
  draftProject,
  entities,
  relations,
  operations,
  onNestJsAppReadyChange,
}: {
  draftProject: DraftProject
  entities: ErdEntity[]
  relations: ErdRelation[]
  operations: BackendOperation[]
  onNestJsAppReadyChange: (isReady: boolean) => void
}) {
  const hasRequestedWorkspace = useRef(false)
  const [workspace, setWorkspace] = useState<GenerateWorkspace | null>(null)
  const [agentResult, setAgentResult] = useState<NestJsAgentResult | null>(null)
  const [isGeneratingWorkspace, setIsGeneratingWorkspace] = useState(false)
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLogLine[]>([])
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const enabledOperations = operations.filter((operation) => operation.enabled)

  function makeTerminalLine(
    status: TerminalLogLine['status'],
    text: string,
  ): TerminalLogLine {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      status,
      text,
    }
  }

  function setProgressLine(progress: AgentProgressEvent) {
    setTerminalLines((currentLines) => {
      const lastLine = currentLines[currentLines.length - 1]

      if (
        progress.stage === 'started' &&
        lastLine?.status === 'running' &&
        lastLine.text === progress.message
      ) {
        return currentLines
      }

      if (
        progress.stage === 'completed' &&
        lastLine?.status === 'running' &&
        lastLine.text === progress.message
      ) {
        return [
          ...currentLines.slice(0, -1),
          { ...lastLine, status: 'success' },
        ]
      }

      if (
        progress.stage === 'failed' &&
        lastLine?.status === 'running' &&
        lastLine.text === progress.message
      ) {
        return [
          ...currentLines.slice(0, -1),
          { ...lastLine, status: 'error' },
        ]
      }

      const status =
        progress.stage === 'completed'
          ? 'success'
          : progress.stage === 'failed'
            ? 'error'
            : 'running'

      return [...currentLines, makeTerminalLine(status, progress.message)]
    })
  }

  async function createWorkspaceSnapshot() {
    setIsGeneratingWorkspace(true)
    setGenerateError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/generate/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: draftProject,
          entities,
          relations,
          operations,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not create generation workspace.')
      }

      const workspaceData = (await response.json()) as GenerateWorkspace
      setWorkspace(workspaceData)
      setAgentResult(null)
      setTerminalLines([
        makeTerminalLine('success', 'Current workspace snapshot created'),
        makeTerminalLine('idle', workspaceData.workspacePath),
        makeTerminalLine('success', `Wrote markdown inputs: ${workspaceData.files.join(', ')}`),
        makeTerminalLine('idle', 'Next: Create NestJS app'),
      ])
      onNestJsAppReadyChange(false)
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Unexpected generate error.')
      hasRequestedWorkspace.current = false
    } finally {
      setIsGeneratingWorkspace(false)
    }
  }

  function runNestJsAgent() {
    if (!workspace) {
      return
    }

    setIsRunningAgent(true)
    setGenerateError(null)
    setAgentResult(null)
    onNestJsAppReadyChange(false)
    setTerminalLines((currentLines) => [
      ...currentLines.filter((line) => line.status !== 'running'),
      makeTerminalLine('running', 'Starting NestJS app generation agent'),
    ])

    const source = new EventSource(
      `${apiBaseUrl}/api/generate/workspace/${workspace.workspaceId}/nestjs/events`,
    )

    source.addEventListener('progress', (event) => {
      const progress = JSON.parse(event.data) as AgentProgressEvent
      setProgressLine(progress)
    })

    source.addEventListener('result', (event) => {
      const result = JSON.parse(event.data) as NestJsAgentResult
      const buildSummaryLines = result.build?.errorSummary
        ? result.build.errorSummary
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 12)
            .map((line) => makeTerminalLine('error', line))
        : []
      setAgentResult(result)
      onNestJsAppReadyChange(result.build?.success === true)
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine(
          result.build?.success ? 'success' : 'error',
          `Final build ${result.build?.success ? 'passed' : 'failed'}`,
        ),
        ...buildSummaryLines,
        makeTerminalLine('success', `Generated NestJS application: ${result.appPath}`),
        makeTerminalLine('idle', `Artifact files: ${result.files.length}`),
      ])
    })

    source.addEventListener('agent-error', (event) => {
      const payload = JSON.parse(event.data) as { message?: string }
      setGenerateError(payload.message ?? 'Unexpected agent error.')
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', payload.message ?? 'Agent failed'),
      ])
      onNestJsAppReadyChange(false)
      setIsRunningAgent(false)
      source.close()
    })

    source.addEventListener('done', () => {
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('success', 'Agent stream closed'),
      ])
      setIsRunningAgent(false)
      source.close()
    })

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        return
      }
      setGenerateError('Could not keep the NestJS agent event stream open.')
      onNestJsAppReadyChange(false)
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', 'Could not keep the NestJS agent event stream open.'),
      ])
      setIsRunningAgent(false)
      source.close()
    }
  }

  useEffect(() => {
    if (hasRequestedWorkspace.current) {
      return
    }

    hasRequestedWorkspace.current = true
    void createWorkspaceSnapshot()
  })

  useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [terminalLines])

  const visibleTerminalLines =
    terminalLines.length > 0
      ? terminalLines
      : [
          {
            id: 'terminal_empty_preparing',
            status: 'running' as const,
            text: 'Preparing generation workspace',
          },
          {
            id: 'terminal_empty_target',
            status: 'idle' as const,
            text: 'Target folder: .semraz/workspaces/{uuid}',
          },
          {
            id: 'terminal_empty_files',
            status: 'idle' as const,
            text: 'Files: PROJECT.md, ERD.md, endpoints.md, rules.md',
          },
        ]

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>Generation summary</h3>
        <div className="summary-grid">
          <span>Framework</span>
          <strong>{draftProject.framework}</strong>
          <span>Entities</span>
          <strong>{entities.length}</strong>
          <span>Operations</span>
          <strong>{enabledOperations.length}</strong>
          <span>Database</span>
          <strong>{draftProject.database}</strong>
          <span>Workspace</span>
          <strong>{workspace?.workspaceId ?? (isGeneratingWorkspace ? 'Creating...' : 'Not created')}</strong>
          <span>NestJS app</span>
          <strong>
            {agentResult
              ? `${agentResult.build?.success ? 'Built' : 'Generated'} · ${agentResult.files.length} files`
              : 'Waiting'}
          </strong>
        </div>
      </section>
      <section className="flow-panel terminal-panel">
        <div className="section-heading">
          <h3>Generation workspace</h3>
          <div className="generate-actions">
            <button
              type="button"
              disabled={isGeneratingWorkspace}
              onClick={() => {
                hasRequestedWorkspace.current = true
                void createWorkspaceSnapshot()
              }}
            >
              {isGeneratingWorkspace ? 'Creating...' : 'Create new workspace'}
            </button>
            <button
              type="button"
              disabled={!workspace || isRunningAgent}
              onClick={() => runNestJsAgent()}
            >
              {isRunningAgent ? 'Creating...' : 'Create NestJS app'}
            </button>
          </div>
        </div>
        <div className="terminal-window" ref={terminalRef} role="log" aria-live="polite">
          {visibleTerminalLines.map((line, index) => {
            const isLastRunningLine =
              line.status === 'running' && index === visibleTerminalLines.length - 1

            return (
              <div
                className={`terminal-line ${line.status}${isLastRunningLine ? ' breathing' : ''}`}
                key={line.id}
              >
                <span className="terminal-prompt">
                  {line.status === 'success'
                    ? 'ok'
                    : line.status === 'error'
                      ? 'err'
                      : line.status === 'running'
                        ? 'run'
                        : '$'}
                </span>
                <span
                  className="terminal-text"
                  style={{ '--characters': Math.max(line.text.length, 1) } as CSSProperties}
                >
                  {line.text}
                </span>
                {isLastRunningLine ? <span className="terminal-cursor" /> : null}
              </div>
            )
          })}
        </div>
        {generateError ? <p className="error-text">{generateError}</p> : null}
      </section>
    </div>
  )
}

function TestStep({ draftProject }: { draftProject: DraftProject }) {
  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>Verification report</h3>
        <div className="metrics">
          <div>
            <span>12</span>
            Passing
          </div>
          <div>
            <span>0</span>
            Failing
          </div>
          <div>
            <span>82%</span>
            Coverage
          </div>
        </div>
        <p className="muted-copy">
          Mock {draftProject.framework} backend is ready to export, push to Git, or deploy.
        </p>
      </section>
      <section className="flow-panel">
        <h3>REST client</h3>
        <div className="api-preview">
          <strong>GET /orders/ord_1001</strong>
          <code>{`{
  "id": "ord_1001",
  "status": "paid",
  "shipment": "preparing"
}`}</code>
        </div>
      </section>
    </div>
  )
}

export default App
