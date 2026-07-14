import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import { Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom'
import FeedbackWidget from './feedback/FeedbackWidget'
import './App.css'

type User = {
  id: string
  name: string
  email: string
  role: string
}

type AuthResponse = {
  accessToken: string
  refreshToken: string
  user: User
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
  workspaceId?: string
  workspacePath?: string
  nestJsAppPath?: string
  flowStep?: number
  draftProject?: DraftProject
  entities?: ErdEntity[]
  relations?: ErdRelation[]
  operations?: BackendOperation[]
  generatedWorkspace?: GenerateWorkspace
  generatedNestResult?: NestJsAgentResult
  testAgentResult?: TestAgentResult
  metrics: {
    entities: number
    operations: number
    tests: number
    coverage?: string
  }
}

type CompletedProjectPayload = {
  name: string
  description: string
  framework: string
  database: string
  workspaceId?: string
  workspacePath?: string
  nestJsAppPath?: string
  metrics: Project['metrics']
}

type WorkspaceSnapshot = {
  name: string
  description: string
  framework: string
  database: string
  status: Project['status']
  currentStep: string
  flowStep: number
  workspaceId?: string | null
  workspacePath?: string | null
  nestJsAppPath?: string | null
  metrics: Project['metrics']
  draftProject: DraftProject
  entities?: ErdEntity[]
  relations?: ErdRelation[]
  operations?: BackendOperation[]
  generatedWorkspace?: GenerateWorkspace | null
  generatedNestResult?: NestJsAgentResult | null
  testAgentResult?: TestAgentResult | null
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
const aiWizardTimeoutMs = 60000
const accessTokenStorageKey = 'semraz-access-token'
const refreshTokenStorageKey = 'semraz-refresh-token'

type Language = 'en' | 'ko'
type TranslationValues = Record<string, string | number>

const translations = {
  en: {
    'language.label': 'Language',
    'language.en': 'English',
    'language.ko': 'Korean',
    'auth.eyebrow': 'From idea to tested application in one guided flow',
    'auth.title': 'Sketch it. Ship the backend.',
    'auth.copy':
      'Turn a backend idea into a reviewed project brief, planning notes, ERD, endpoint specs, generated code, and test results you can download as a working app.',
    'auth.email': 'Email',
    'auth.name': 'Name',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm password',
    'auth.signingIn': 'Signing in...',
    'auth.signIn': 'Sign in',
    'auth.signup': 'Sign up',
    'auth.signupTitle': 'Create your account',
    'auth.creatingAccount': 'Creating account...',
    'auth.createAccount': 'Create account',
    'auth.noAccount': 'No account yet?',
    'auth.haveAccount': 'Already have an account?',
    'auth.backToLogin': 'Back to sign in',
    'auth.passwordGuide':
      'Use at least 10 characters with letters, numbers, and a special character. Do not include spaces, your name, or your email.',
    'auth.termsNotice':
      'By creating an account, you agree to use Semraz only for projects you are authorized to build, to avoid uploading secrets or illegal content, to review generated code before production use, and to accept that Semraz is not responsible for generated outputs.',
    'error.loginFailed': 'Login failed.',
    'error.signupFailed': 'Could not create account.',
    'error.passwordMismatch': 'Passwords do not match.',
    'error.passwordWeak':
      'Use a stronger password: at least 10 characters with letters, numbers, and a special character.',
    'error.emailTaken': 'This email is already registered.',
    'error.signupRateLimited': 'This IP address can create one account every 3 days.',
    'error.emailInvalid': 'Use a valid email address.',
    'error.projectsFailed': 'Could not load projects.',
    'error.unexpectedLogin': 'Unexpected login error.',
    'error.unexpectedSignup': 'Unexpected signup error.',
    'error.workspaceFailed': 'Could not create generation workspace.',
    'error.unexpectedGenerate': 'Unexpected generate error.',
    'error.agentUnexpected': 'Unexpected agent error.',
    'error.agentFailed': 'Agent failed',
    'error.agentStream': 'Could not keep the NestJS agent event stream open.',
    'error.testAgentUnexpected': 'Unexpected test agent error.',
    'error.testAgentFailed': 'Test agent failed.',
    'error.testAgentStream': 'Could not keep the NestJS test agent event stream open.',
    'status.planning': 'Planning',
    'status.compile_failed': 'Compile failed',
    'status.verified': 'Verified',
    'topbar.authenticatedAs': 'Authenticated as {role}',
    'topbar.newApp': 'New application',
    'topbar.workspaces': 'Workspaces',
    'topbar.logout': 'Log out',
    'dashboard.projectList': 'Project list',
    'dashboard.projects': 'Projects',
    'dashboard.newBackend': 'New backend',
    'dashboard.emptyCreatePrefix': 'New backend application',
    'dashboard.emptyCreateAction': 'Create',
    'dashboard.target': '{framework} app',
    'dashboard.entities': 'Entities',
    'dashboard.operations': 'Endpoints',
    'dashboard.testsAndCoverage': 'Tests',
    'dashboard.coverageValue': 'Coverage {coverage}',
    'dashboard.coverageUnknown': 'Coverage -',
    'dashboard.downloadNest': 'Download app',
    'dashboard.deleteProject': 'Delete project',
    'dashboard.resumeWorkspace': 'Resume workspace',
    'dashboard.confirmDelete': 'Delete this project?',
    'dashboard.skillsDraft': 'Project summary',
    'dashboard.specPreview': `# {projectName}

## Purpose
Generate a reliable backend from a reviewed Semraz spec.

## Domain model
- Entities are measured in the ERD step.
- CRUD and custom operations are defined before generation.

## Verification
- Compile before test generation.
- Preserve the project spec as the source of truth.`,
    'flow.project': 'Project',
    'flow.planning': 'Planning',
    'flow.erd': 'ERD',
    'flow.operations': 'Operations',
    'flow.generate': 'Generate',
    'flow.test': 'Test',
    'flow.close': 'Close',
    'flow.progress': 'Create backend flow progress',
    'flow.cancel': 'Cancel',
    'flow.back': 'Back',
    'flow.finish': 'Finish project',
    'flow.next': 'Next',
    'flow.warnLossTitle': 'Go back?',
    'flow.warnLossBody': 'Changes in the current and later steps will be cleared if you go back.',
    'flow.warnLossConfirm': 'Go back',
    'flow.warnLossCancel': 'Stay',
    'ai.open': 'AI Wizard',
    'ai.close': 'Hide AI Wizard',
    'ai.tryWizard': 'Try the AI wizard',
    'ai.apply': 'Create AI draft',
    'ai.applying': 'Designing...',
    'ai.failed': 'AI provider request failed.',
    'ai.timeout': 'AI provider request took too long. Please try again.',
    'ai.projectTitle': 'Project idea assistant',
    'ai.projectCopy':
      'Draft a concrete backend idea, description, and database choice to start the project.',
    'ai.planningTitle': 'Planning assistant',
    'ai.planningCopy': 'Use the project basics to write the backend purpose and code constraints.',
    'ai.erdTitle': 'ERD assistant',
    'ai.erdCopy':
      'Use the project and planning notes to generate a first entity model and relationships.',
    'ai.operationsTitle': 'API assistant',
    'ai.operationsCopy': 'Recommend API specifications from the project, planning notes, and ERD.',
    'ai.unavailable': 'AI design is not used in this step.',
    'project.basics': 'Project basics',
    'project.name': 'Name',
    'project.database': 'Database',
    'project.description': 'Description',
    'project.namePlaceholder': 'e.g. Commerce API',
    'project.descriptionPlaceholder':
      'Briefly describe the application, users, and core workflows.',
    'project.framework': 'Target framework',
    'project.nestDescription':
      'NestJS is a TypeScript-first Node.js framework for building scalable backend APIs with modules, controllers, providers, decorators, validation, and testing.',
    'project.goDescription': 'Static, fast, compile-checked service generation.',
    'project.pythonDescription': 'Pydantic models, routers, OpenAPI, and quick iteration.',
    'project.comingSoon': 'Coming soon',
    'planning.inputs': 'Planning inputs',
    'planning.scaffold': 'Scaffold sections',
    'planning.purpose': 'Purpose',
    'planning.constraints': 'Constraints',
    'planning.purposePlaceholder': 'Describe what this application should accomplish.',
    'planning.constraintsPlaceholder':
      'List coding rules, architecture constraints, and validation requirements.',
    'planning.preview': 'skills.md preview',
    'planning.autosaved': 'Autosaved locally',
    'planning.checks': 'Assistant checks',
    'planning.checkPurpose': 'Purpose is present and project-specific',
    'planning.checkConstraints': 'Constraints define the NestJS generation boundary',
    'planning.checkCompile': 'NestJS compile/test constraints are explicit',
    'planning.scaffoldPurpose':
      'Build a reliable NestJS backend from a reviewed Semraz specification.',
    'planning.scaffoldConstraints':
      '- Generate NestJS modules, controllers, services, DTOs, and tests\n- Compile before test generation\n- Preserve user-owned logic blocks on regeneration',
    'skills.purpose': 'Purpose',
    'skills.constraints': 'Constraints',
    'skills.targetStack': 'Target stack',
    'skills.framework': 'Framework',
    'skills.language': 'Language',
    'skills.database': 'Database',
    'skills.verification': 'Verification',
    'skills.verificationValue': 'generated code must compile before tests are created',
    'erd.addEntity': 'Add entity',
    'erd.entityPlaceholder': 'Entity name',
    'erd.columnPlaceholder': 'Column name',
    'erd.zoomControls': 'Canvas zoom controls',
    'erd.zoomOut': 'Zoom out',
    'erd.resetZoom': 'Reset zoom',
    'erd.zoomIn': 'Zoom in',
    'erd.relationFrom': 'Relation settings',
    'erd.side': 'Selected entity',
    'erd.direction': 'Direction',
    'erd.bidirectional': 'Bidirectional',
    'erd.unidirectional': 'Unidirectional',
    'erd.opposite': 'Opposite: {value}',
    'erd.setRelation': 'Set relation',
    'erd.properties': 'Properties',
    'erd.entitiesCount': 'Entities: {count}',
    'erd.columnsCount': 'Columns: {count}',
    'erd.relationsCount': 'Relations: {count}',
    'erd.selected': 'Selected: {value}',
    'erd.selectedEntity': '{name} ({count} columns)',
    'erd.none': 'None',
    'erd.pkWarnings': 'PK warnings: {value}',
    'erd.noWarnings': 'none',
    'erd.relations': 'Relations',
    'erd.noRelations': 'No relations yet.',
    'erd.unknown': 'Unknown',
    'erd.delete': 'Delete',
    'erd.drag': 'Drag',
    'erd.dragEntity': 'Drag {name}',
    'erd.columnName': '{entity} {field} column name',
    'erd.columnType': '{entity} {field} type',
    'erd.primaryKey': 'Primary key',
    'erd.notNull': 'Not null',
    'erd.addColumn': 'Add column',
    'ops.mapped': '{count} mapped',
    'ops.count': '{count} ops',
    'ops.swipeEntities': 'Swipe sideways to browse entities',
    'ops.entityOperations': '{entity} operations',
    'ops.operations': 'Operations',
    'ops.addCustom': 'Add custom',
    'ops.custom': 'Custom',
    'ops.name': 'Name',
    'ops.namePlaceholder': 'Operation name',
    'ops.method': 'Method',
    'ops.path': 'Path',
    'ops.pathPlaceholder': '/resource/:id',
    'ops.description': 'API description',
    'ops.descriptionPlaceholder': 'Describe the request, validation, and response.',
    'ops.requirements': 'Implementation requirements',
    'ops.requirementsPlaceholder':
      'Specify authorization, validation, state changes, failure handling, and integration behavior.',
    'ops.fieldDirection': 'API field direction',
    'ops.request': 'Request',
    'ops.response': 'Response',
    'ops.customFields': 'Custom fields',
    'ops.addField': 'Add field',
    'ops.customFieldName': 'Custom field name',
    'ops.customFieldNamePlaceholder': 'fieldName',
    'ops.customFieldType': 'Custom field type',
    'ops.addEntitiesFirst': 'Add entities in the ERD step first.',
    'ops.apiPreview': 'API Preview',
    'ops.noEnabled': 'No enabled operations for this entity.',
    'ops.defaultCreate': 'Create',
    'ops.defaultList': 'List',
    'ops.defaultDetail': 'Detail',
    'ops.defaultUpdate': 'Update',
    'ops.defaultDelete': 'Delete',
    'ops.defaultCreateDescription':
      'Creates a new {entity} from the request body, validates required fields, and returns the persisted resource.',
    'ops.defaultListDescription':
      'Returns a paginated collection of {entity} records for browse and admin list screens.',
    'ops.defaultDetailDescription':
      'Returns a single {entity} by id, including the fields needed for a detail view.',
    'ops.defaultUpdateDescription':
      'Applies partial changes to an existing {entity} and returns the updated resource.',
    'ops.defaultDeleteDescription':
      'Deletes or archives a {entity} by id and returns an operation result for client-side confirmation.',
    'ops.customAction': 'Custom action {count}',
    'ops.customActionDescription':
      'Runs a domain-specific {entity} action and returns the workflow result for the caller.',
    'generate.summary': 'Generation summary',
    'generate.workspace': 'Workspace ID',
    'generate.nestApp': 'NestJS app',
    'generate.creating': 'Creating...',
    'generate.notCreated': 'Not created',
    'generate.built': 'Built',
    'generate.generated': 'Generated',
    'generate.files': '{count} files',
    'generate.waiting': 'Waiting',
    'generate.workspaceTitle': 'Generation workspace',
    'generate.createWorkspace': 'Create new workspace',
    'generate.createNest': 'Create NestJS app',
    'generate.recreateNest': 'Recreate NestJS app',
    'generate.alreadyBuilt': 'NestJS app already built ({count} files)',
    'generate.readyToNext': 'Ready — proceed to the next step or regenerate',
    'generate.snapshotCreated': 'Current workspace snapshot created',
    'generate.wroteInputs': 'Wrote markdown inputs: {files}',
    'generate.nextNest': 'Next: Create NestJS app',
    'generate.startAgent': 'Starting NestJS app generation agent',
    'generate.finalBuild': 'Final build {status}',
    'generate.passed': 'passed',
    'generate.failed': 'failed',
    'generate.generatedApp': 'Generated NestJS application: {path}',
    'generate.artifactFiles': 'Artifact files: {count}',
    'generate.streamClosed': 'Agent stream closed',
    'generate.preparing': 'Preparing generation workspace',
    'generate.targetFolder': 'Target folder: .semraz/workspaces/{uuid}',
    'generate.inputFiles': 'Files: PROJECT.md, ERD.md, endpoints.md, rules.md',
    'generate.progress.preparingOutput': 'Preparing {target} output directory',
    'generate.progress.readDocs': 'Reading markdown design documents',
    'generate.progress.normalizeSpec': 'Normalizing application specification',
    'generate.progress.planFiles': 'Planning NestJS bootstrap files',
    'generate.progress.generateFiles': 'Generating NestJS bootstrap files',
    'generate.progress.writeFiles': 'Writing bootstrap files to workspace',
    'generate.progress.runBuild': 'Installing dependencies and compiling bootstrap app',
    'generate.progress.repairFiles': 'Repairing bootstrap build failures',
    'generate.progress.planBuildTasks': 'Planning entity, ORM, and CRUD tasks',
    'generate.progress.selectNextTask': 'Selecting next generation task',
    'generate.progress.taskPlanner': 'Preparing selected task',
    'generate.progress.codeContext': 'Reading relevant generated code context',
    'generate.progress.codeGeneration': 'Generating task implementation files',
    'generate.progress.applyPatch': 'Applying generated file changes',
    'generate.progress.syntaxCheck': 'Running TypeScript build check',
    'generate.progress.e2eCheck': 'Running generated app verification gate',
    'generate.progress.recordCompleted': 'Recording completed task',
    'generate.progress.recordFailed': 'Recording failed task',
    'generate.progress.runFinalBuild': 'Running final NestJS app build',
    'generate.progress.runFinalSmoke': 'Running final HTTP and Swagger smoke check',
    'generate.progress.validateFinalContracts': 'Validating the final application contract',
    'generate.progress.repairFinalBuild': 'Repairing final build failures',
    'generate.progress.restoreUserFiles': 'Restoring user-authored files',
    'generate.progress.packageArtifact': 'Collecting generated artifact summary',
    'generate.task.entityFields': '{entity} entity fields',
    'generate.task.entityRelations': '{entity} entity relations',
    'generate.task.ormRegistration': 'ORM registration',
    'generate.task.crudFeature': '{entity} CRUD API',
    'generate.task.endpointWorkflow': '{entity} API workflow',
    'generate.task.businessWorkflow': 'Business workflow',
    'generate.task.finalE2e': 'Final application verification',
    'generate.task.preparing': 'Preparing {task}',
    'generate.task.context': 'Reviewing code context for {task}',
    'generate.task.generating': 'Generating implementation for {task}',
    'generate.task.applying': 'Applying changes for {task}',
    'generate.task.validating': 'Validating {task}',
    'generate.task.verifying': 'Verifying {task}',
    'generate.task.completed': '{task} completed',
    'generate.task.failed': '{task} failed',
    'test.report': 'Verification report',
    'test.passing': 'Passing',
    'test.failing': 'Failing',
    'test.coverage': 'Coverage',
    'test.ready': '{framework} backend is ready to export, push to Git, or deploy.',
    'test.agentTitle': 'Test agent',
    'test.notReady': 'Create a verified NestJS app in the Generate step first.',
    'test.runAgent': 'Generate and run tests',
    'test.runningAgent': 'Testing...',
    'test.startAgent': 'Starting NestJS test agent',
    'test.verified': 'Test verification completed',
    'test.failed': 'Test verification failed',
    'test.attempts': 'Attempts',
    'test.generatedFiles': 'Generated tests',
    'test.changedFiles': 'Changed files',
    'test.progress.understandSpec': 'Understanding endpoint/function specifications',
    'test.progress.searchCodebase': 'Searching generated NestJS codebase',
    'test.progress.generateTestCode': 'Generating Jest test code',
    'test.progress.applyPatch': 'Applying generated test files',
    'test.progress.runCoverage': 'Running test coverage and verification',
    'test.progress.attempt': 'Test attempt {attempt}: {phase}',
    'test.progress.attemptFailed': 'Test attempt {attempt} needs fixes',
    'test.progress.generatedFile': 'Generated test: {path}',
    'test.progress.patchedFile': 'Updated test: {path}',
    'common.backHome': '← Back to home',
    'footer.tagline': 'From idea to a tested backend, in one guided flow.',
    'footer.colProduct': 'Product',
    'footer.colResources': 'Resources',
    'footer.colLegal': 'Legal',
    'footer.overview': 'Overview',
    'footer.docs': 'Documentation',
    'footer.guides': 'Guides',
    'footer.changelog': 'Changelog',
    'footer.privacy': 'Privacy',
    'footer.terms': 'Terms',
    'footer.security': 'Security',
    'footer.rights': '© {year} 김원정. All rights reserved.',
    'footer.madeWith': 'Crafted for backend builders.',
  },
  ko: {
    'language.label': '언어',
    'language.en': 'English',
    'language.ko': '한국어',
    'auth.eyebrow': '아이디어부터 테스트된 애플리케이션까지 한 번에',
    'auth.title': '슥 그리면, 백엔드가 짠.',
    'auth.copy':
      '백엔드 아이디어를 프로젝트 요약, 계획, ERD, 엔드포인트 명세, 생성된 코드와 테스트 결과까지 한 흐름으로 완성하는 앱 빌더입니다.',
    'auth.email': '이메일',
    'auth.name': '이름',
    'auth.password': '비밀번호',
    'auth.confirmPassword': '비밀번호 확인',
    'auth.signingIn': '로그인 중...',
    'auth.signIn': '로그인',
    'auth.signup': '회원가입',
    'auth.signupTitle': '회원가입',
    'auth.creatingAccount': '가입 중...',
    'auth.createAccount': '가입하기',
    'auth.noAccount': '아직 계정이 없나요?',
    'auth.haveAccount': '이미 계정이 있나요?',
    'auth.backToLogin': '로그인으로 돌아가기',
    'auth.passwordGuide':
      '영문, 숫자, 특수문자를 포함해 10자 이상으로 입력하세요. 공백, 이름, 이메일이 포함된 비밀번호는 사용할 수 없습니다.',
    'auth.termsNotice':
      '가입하면 Semraz를 권한이 있는 프로젝트 설계와 생성에만 사용하고, 비밀 정보나 불법 콘텐츠를 업로드하지 않으며, 생성된 코드는 운영 적용 전 직접 검토해야 하고, Semraz는 생성된 결과에 책임을 지지 않는다는 기본 이용약관에 동의한 것으로 간주합니다.',
    'error.loginFailed': '로그인에 실패했습니다.',
    'error.signupFailed': '계정을 만들 수 없습니다.',
    'error.passwordMismatch': '비밀번호가 일치하지 않습니다.',
    'error.passwordWeak':
      '비밀번호가 너무 약합니다. 영문, 숫자, 특수문자를 포함해 10자 이상으로 입력하세요.',
    'error.emailTaken': '이미 가입된 이메일입니다.',
    'error.signupRateLimited': '한 IP에서는 3일에 한 번만 가입할 수 있습니다.',
    'error.emailInvalid': '올바른 이메일 주소를 입력하세요.',
    'error.projectsFailed': '프로젝트를 불러올 수 없습니다.',
    'error.unexpectedLogin': '예상치 못한 로그인 오류입니다.',
    'error.unexpectedSignup': '예상치 못한 회원가입 오류입니다.',
    'error.workspaceFailed': '앱 생성 환경을 만들 수 없습니다.',
    'error.unexpectedGenerate': '예상치 못한 생성 오류입니다.',
    'error.agentUnexpected': '예상치 못한 에이전트 오류입니다.',
    'error.agentFailed': '에이전트가 실패했습니다.',
    'error.agentStream': 'NestJS 에이전트 이벤트 스트림을 유지할 수 없습니다.',
    'error.testAgentUnexpected': '예상치 못한 테스트 에이전트 오류입니다.',
    'error.testAgentFailed': '테스트 에이전트가 실패했습니다.',
    'error.testAgentStream': 'NestJS 테스트 에이전트 이벤트 스트림을 유지할 수 없습니다.',
    'status.planning': '계획 중',
    'status.compile_failed': '컴파일 실패',
    'status.verified': '검증됨',
    'topbar.authenticatedAs': '인증 역할: {role}',
    'topbar.newApp': '새 애플리케이션',
    'topbar.workspaces': '워크스페이스',
    'topbar.logout': '로그아웃',
    'dashboard.projectList': '프로젝트 목록',
    'dashboard.projects': '프로젝트',
    'dashboard.newBackend': '새 백엔드',
    'dashboard.emptyCreatePrefix': '새로운 백엔드 애플리케이션',
    'dashboard.emptyCreateAction': '만들기',
    'dashboard.target': '{framework} 앱',
    'dashboard.entities': '엔티티',
    'dashboard.operations': '엔드포인트',
    'dashboard.testsAndCoverage': '테스트',
    'dashboard.coverageValue': '커버리지 {coverage}',
    'dashboard.coverageUnknown': '커버리지 -',
    'dashboard.downloadNest': '앱 다운로드',
    'dashboard.deleteProject': '프로젝트 삭제',
    'dashboard.resumeWorkspace': '이어 작업하기',
    'dashboard.confirmDelete': '이 프로젝트를 삭제할까요?',
    'dashboard.skillsDraft': '프로젝트 요약',
    'dashboard.specPreview': `# {projectName}

## 목적
검토된 Semraz 스펙에서 안정적인 백엔드를 생성합니다.

## 도메인 모델
- 엔티티는 ERD 단계에서 측정합니다.
- CRUD와 커스텀 작업은 생성 전에 정의합니다.

## 검증
- 테스트 생성 전에 컴파일합니다.
- 프로젝트 스펙을 단일 기준으로 유지합니다.`,
    'flow.project': '프로젝트',
    'flow.planning': '계획',
    'flow.erd': 'ERD',
    'flow.operations': '작업',
    'flow.generate': '생성',
    'flow.test': '테스트',
    'flow.close': '닫기',
    'flow.progress': '백엔드 생성 단계 진행',
    'flow.cancel': '취소',
    'flow.back': '뒤로',
    'flow.finish': '프로젝트 완료',
    'flow.next': '다음',
    'flow.warnLossTitle': '이전 단계로 돌아가시겠습니까?',
    'flow.warnLossBody': '현재 단계와 이후 단계에서 작성한 내용이 초기화됩니다.',
    'flow.warnLossConfirm': '돌아가기',
    'flow.warnLossCancel': '머무르기',
    'ai.open': 'AI 마법사',
    'ai.close': 'AI 마법사 숨기기',
    'ai.tryWizard': 'AI 마법사를 사용해보세요',
    'ai.apply': 'AI 초안 만들기',
    'ai.applying': '설계 중...',
    'ai.failed': 'AI Provider 요청에 실패했습니다.',
    'ai.timeout': 'AI Provider 요청 시간이 너무 오래 걸렸습니다. 다시 시도해주세요.',
    'ai.projectTitle': '프로젝트 아이디어 보조',
    'ai.projectCopy':
      '백엔드 프로젝트의 첫 아이디어, 설명, 데이터베이스 선택을 구체적인 초안으로 만듭니다.',
    'ai.planningTitle': '계획 보조',
    'ai.planningCopy': '프로젝트 기본 정보를 바탕으로 목적과 코드 컨벤션/제약사항을 작성합니다.',
    'ai.erdTitle': 'ERD 보조',
    'ai.erdCopy': '프로젝트와 계획 내용을 바탕으로 첫 엔티티 모델과 관계를 생성합니다.',
    'ai.operationsTitle': 'API 보조',
    'ai.operationsCopy': '프로젝트, 계획, ERD를 바탕으로 추천 API 명세를 작성합니다.',
    'ai.unavailable': '이 단계에서는 AI 설계를 사용하지 않습니다.',
    'project.basics': '프로젝트 기본 정보',
    'project.name': '이름',
    'project.database': '데이터베이스',
    'project.description': '설명',
    'project.namePlaceholder': '예: 커머스 API',
    'project.descriptionPlaceholder': '애플리케이션의 사용자, 목적, 핵심 흐름을 간단히 적어주세요.',
    'project.framework': '대상 프레임워크',
    'project.nestDescription':
      'NestJS는 TypeScript 기반 Node.js 서버 프레임워크로, 모듈, 컨트롤러, 프로바이더, 데코레이터, 검증, 테스트 구조를 통해 확장 가능한 백엔드 API를 체계적으로 구축합니다.',
    'project.goDescription': '정적이고 빠른 컴파일 검증 서비스 생성입니다.',
    'project.pythonDescription': 'Pydantic 모델, 라우터, OpenAPI, 빠른 반복 개발입니다.',
    'project.comingSoon': '준비 중',
    'planning.inputs': '계획 입력',
    'planning.scaffold': '섹션 생성',
    'planning.purpose': '목적',
    'planning.constraints': '제약 조건',
    'planning.purposePlaceholder': '이 애플리케이션이 달성해야 하는 목적을 적어주세요.',
    'planning.constraintsPlaceholder': '코드 규칙, 아키텍처 제약, 검증 요구사항을 적어주세요.',
    'planning.preview': 'skills.md 미리보기',
    'planning.autosaved': '로컬 자동 저장됨',
    'planning.checks': '어시스턴트 검사',
    'planning.checkPurpose': '목적이 있으며 프로젝트에 맞게 작성됨',
    'planning.checkConstraints': '제약 조건이 NestJS 생성 범위를 정의함',
    'planning.checkCompile': 'NestJS 컴파일/테스트 제약이 명확함',
    'planning.scaffoldPurpose': '검토된 Semraz 스펙에서 안정적인 NestJS 백엔드를 빌드합니다.',
    'planning.scaffoldConstraints':
      '- NestJS 모듈, 컨트롤러, 서비스, DTO, 테스트 생성\n- 테스트 생성 전에 컴파일\n- 재생성 시 사용자 소유 로직 블록 보존',
    'skills.purpose': '목적',
    'skills.constraints': '제약 조건',
    'skills.targetStack': '대상 스택',
    'skills.framework': '프레임워크',
    'skills.language': '언어',
    'skills.database': '데이터베이스',
    'skills.verification': '검증',
    'skills.verificationValue': '생성된 코드는 테스트 생성 전에 컴파일되어야 합니다',
    'erd.addEntity': '엔티티 추가',
    'erd.entityPlaceholder': '엔티티 이름',
    'erd.columnPlaceholder': '컬럼 이름',
    'erd.zoomControls': '캔버스 확대/축소 컨트롤',
    'erd.zoomOut': '축소',
    'erd.resetZoom': '확대/축소 초기화',
    'erd.zoomIn': '확대',
    'erd.relationFrom': '관계 설정',
    'erd.side': '선택 엔티티',
    'erd.direction': '방향',
    'erd.bidirectional': '양방향',
    'erd.unidirectional': '단방향',
    'erd.opposite': '반대편: {value}',
    'erd.setRelation': '관계 설정',
    'erd.properties': '속성',
    'erd.entitiesCount': '엔티티: {count}',
    'erd.columnsCount': '컬럼: {count}',
    'erd.relationsCount': '관계: {count}',
    'erd.selected': '선택됨: {value}',
    'erd.selectedEntity': '{name} ({count}개 컬럼)',
    'erd.none': '없음',
    'erd.pkWarnings': 'PK 경고: {value}',
    'erd.noWarnings': '없음',
    'erd.relations': '관계',
    'erd.noRelations': '아직 관계가 없습니다.',
    'erd.unknown': '알 수 없음',
    'erd.delete': '삭제',
    'erd.drag': '드래그',
    'erd.dragEntity': '{name} 드래그',
    'erd.columnName': '{entity} {field} 컬럼 이름',
    'erd.columnType': '{entity} {field} 타입',
    'erd.primaryKey': '기본 키',
    'erd.notNull': 'Not null',
    'erd.addColumn': '컬럼 추가',
    'ops.mapped': '{count}개 매핑됨',
    'ops.count': '{count}개 작업',
    'ops.swipeEntities': '좌우로 밀어 엔티티를 선택하세요',
    'ops.entityOperations': '{entity} 작업',
    'ops.operations': '작업',
    'ops.addCustom': '엔드포인트 추가',
    'ops.custom': '커스텀',
    'ops.name': '이름',
    'ops.namePlaceholder': '작업 이름',
    'ops.method': '메서드',
    'ops.path': '경로',
    'ops.pathPlaceholder': '/resource/:id',
    'ops.description': 'API 설명',
    'ops.descriptionPlaceholder': '요청, 검증, 응답 내용을 설명해주세요.',
    'ops.requirements': '구현 요구사항',
    'ops.requirementsPlaceholder':
      '권한, 검증, 상태 변경, 실패 처리, 연동 동작을 구체적으로 적어주세요.',
    'ops.fieldDirection': 'API 필드 방향',
    'ops.request': '요청',
    'ops.response': '응답',
    'ops.customFields': '커스텀 필드',
    'ops.addField': '필드 추가',
    'ops.customFieldName': '커스텀 필드 이름',
    'ops.customFieldNamePlaceholder': 'fieldName',
    'ops.customFieldType': '커스텀 필드 타입',
    'ops.addEntitiesFirst': '먼저 ERD 단계에서 엔티티를 추가하세요.',
    'ops.apiPreview': 'API 미리보기',
    'ops.noEnabled': '이 엔티티에 활성화된 작업이 없습니다.',
    'ops.defaultCreate': '생성',
    'ops.defaultList': '목록',
    'ops.defaultDetail': '상세',
    'ops.defaultUpdate': '수정',
    'ops.defaultDelete': '삭제',
    'ops.defaultCreateDescription':
      '요청 본문에서 새 {entity}를 만들고 필수 필드를 검증한 뒤 저장된 리소스를 반환합니다.',
    'ops.defaultListDescription':
      '탐색 및 관리자 목록 화면을 위해 {entity} 레코드의 페이지네이션 컬렉션을 반환합니다.',
    'ops.defaultDetailDescription':
      '상세 화면에 필요한 필드를 포함해 ID로 단일 {entity}를 반환합니다.',
    'ops.defaultUpdateDescription':
      '기존 {entity}에 부분 변경을 적용하고 업데이트된 리소스를 반환합니다.',
    'ops.defaultDeleteDescription':
      'ID로 {entity}를 삭제하거나 보관하고 클라이언트 확인용 작업 결과를 반환합니다.',
    'ops.customAction': '커스텀 작업 {count}',
    'ops.customActionDescription':
      '도메인별 {entity} 작업을 실행하고 호출자에게 워크플로 결과를 반환합니다.',
    'generate.summary': '생성 요약',
    'generate.workspace': '워크스페이스 식별자',
    'generate.nestApp': 'NestJS 앱',
    'generate.creating': '생성 중...',
    'generate.notCreated': '생성되지 않음',
    'generate.built': '빌드됨',
    'generate.generated': '생성됨',
    'generate.files': '{count}개 파일',
    'generate.waiting': '대기 중',
    'generate.workspaceTitle': '앱 생성 현황',
    'generate.createWorkspace': '새 워크스페이스 생성',
    'generate.createNest': 'NestJS 앱 생성',
    'generate.recreateNest': 'NestJS 앱 재생성',
    'generate.alreadyBuilt': 'NestJS 앱이 이미 빌드됨 ({count}개 파일)',
    'generate.readyToNext': '준비 완료 — 다음 단계로 진행하거나 재생성하세요',
    'generate.snapshotCreated': '현재 워크스페이스 스냅샷 생성됨',
    'generate.wroteInputs': '마크다운 입력 작성: {files}',
    'generate.nextNest': '다음: NestJS 앱 생성',
    'generate.startAgent': 'NestJS 앱 생성 에이전트 시작',
    'generate.finalBuild': '최종 빌드 {status}',
    'generate.passed': '통과',
    'generate.failed': '실패',
    'generate.generatedApp': '생성된 NestJS 애플리케이션: {path}',
    'generate.artifactFiles': '아티팩트 파일: {count}개',
    'generate.streamClosed': '에이전트 스트림 종료됨',
    'generate.preparing': '앱 생성 환경 준비 중',
    'generate.targetFolder': '대상 폴더: .semraz/workspaces/{uuid}',
    'generate.inputFiles': '파일: PROJECT.md, ERD.md, endpoints.md, rules.md',
    'generate.progress.preparingOutput': '{target} 출력 디렉토리 준비 중',
    'generate.progress.readDocs': '마크다운 설계 문서 읽는 중',
    'generate.progress.normalizeSpec': '애플리케이션 명세 정규화 중',
    'generate.progress.planFiles': 'NestJS 부트스트랩 파일 계획 중',
    'generate.progress.generateFiles': 'NestJS 부트스트랩 파일 생성 중',
    'generate.progress.writeFiles': '부트스트랩 파일을 워크스페이스에 쓰는 중',
    'generate.progress.runBuild': '의존성 설치 및 부트스트랩 앱 컴파일 중',
    'generate.progress.repairFiles': '부트스트랩 빌드 오류 복구 중',
    'generate.progress.planBuildTasks': '엔티티, ORM, CRUD 작업 계획 중',
    'generate.progress.selectNextTask': '다음 생성 작업 선택 중',
    'generate.progress.taskPlanner': '선택된 작업 준비 중',
    'generate.progress.codeContext': '생성된 코드 컨텍스트 읽는 중',
    'generate.progress.codeGeneration': '작업 구현 파일 생성 중',
    'generate.progress.applyPatch': '생성된 파일 변경 사항 적용 중',
    'generate.progress.syntaxCheck': 'TypeScript 빌드 검사 실행 중',
    'generate.progress.e2eCheck': '생성된 앱 검증 게이트 실행 중',
    'generate.progress.recordCompleted': '완료된 작업 기록 중',
    'generate.progress.recordFailed': '실패한 작업 기록 중',
    'generate.progress.runFinalBuild': '최종 NestJS 앱 빌드 실행 중',
    'generate.progress.runFinalSmoke': '최종 HTTP 및 Swagger 스모크 검사 실행 중',
    'generate.progress.validateFinalContracts': '최종 애플리케이션 계약 검증 중',
    'generate.progress.repairFinalBuild': '최종 빌드 오류 복구 중',
    'generate.progress.restoreUserFiles': '사용자 작성 파일 복원 중',
    'generate.progress.packageArtifact': '생성된 아티팩트 요약 수집 중',
    'generate.task.entityFields': '{entity} 엔티티 필드',
    'generate.task.entityRelations': '{entity} 엔티티 관계',
    'generate.task.ormRegistration': 'ORM 등록',
    'generate.task.crudFeature': '{entity} CRUD API',
    'generate.task.endpointWorkflow': '{entity} API 워크플로',
    'generate.task.businessWorkflow': '비즈니스 워크플로',
    'generate.task.finalE2e': '최종 애플리케이션 검증',
    'generate.task.preparing': '{task} 작업 준비 중',
    'generate.task.context': '{task} 관련 코드 확인 중',
    'generate.task.generating': '{task} 구현 코드 생성 중',
    'generate.task.applying': '{task} 변경 사항 적용 중',
    'generate.task.validating': '{task} 검증 중',
    'generate.task.verifying': '{task} 동작 확인 중',
    'generate.task.completed': '{task} 완료',
    'generate.task.failed': '{task} 실패',
    'test.report': '검증 리포트',
    'test.passing': '통과',
    'test.failing': '실패',
    'test.coverage': '커버리지',
    'test.ready': '{framework} 백엔드를 내보내기, Git 푸시, 배포할 준비가 되었습니다.',
    'test.agentTitle': '테스트 에이전트',
    'test.notReady': '먼저 생성 단계에서 검증된 NestJS 앱을 만들어주세요.',
    'test.runAgent': '테스트 생성 및 실행',
    'test.runningAgent': '테스트 중...',
    'test.startAgent': 'NestJS 테스트 에이전트 시작',
    'test.verified': '테스트 검증 완료',
    'test.failed': '테스트 검증 실패',
    'test.attempts': '시도 횟수',
    'test.generatedFiles': '생성된 테스트',
    'test.changedFiles': '변경된 파일',
    'test.progress.understandSpec': '엔드포인트/함수 명세 분석',
    'test.progress.searchCodebase': '생성된 NestJS 코드베이스 검색',
    'test.progress.generateTestCode': 'Jest 테스트 코드 생성',
    'test.progress.applyPatch': '생성된 테스트 파일 적용',
    'test.progress.runCoverage': '테스트 커버리지 및 검증 실행',
    'test.progress.attempt': '{attempt}차 테스트: {phase}',
    'test.progress.attemptFailed': '{attempt}차 테스트 수정 필요',
    'test.progress.generatedFile': '생성한 테스트: {path}',
    'test.progress.patchedFile': '수정한 테스트: {path}',
    'common.backHome': '← 홈으로 돌아가기',
    'footer.tagline': '아이디어부터 테스트된 백엔드까지, 하나의 흐름으로.',
    'footer.colProduct': '제품',
    'footer.colResources': '리소스',
    'footer.colLegal': '약관',
    'footer.overview': '소개',
    'footer.docs': '문서',
    'footer.guides': '가이드',
    'footer.changelog': '변경 이력',
    'footer.privacy': '개인정보 처리방침',
    'footer.terms': '이용약관',
    'footer.security': '보안',
    'footer.rights': '© {year} 김원정. All rights reserved.',
    'footer.madeWith': '세상의 모든 개발자들을 위해 만들었습니다.',
  },
} as const

type TranslationKey = keyof (typeof translations)['en']

const defaultLanguage: Language = 'en'

const I18nContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, values?: TranslationValues) => string
}>({
  language: defaultLanguage,
  setLanguage: () => undefined,
  t: (key) => translations[defaultLanguage][key],
})

const flowSteps = [
  'flow.project',
  'flow.planning',
  'flow.erd',
  'flow.operations',
  'flow.generate',
  'flow.test',
] as const satisfies TranslationKey[]

function interpolate(template: string, values?: TranslationValues) {
  if (!values) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  )
}

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return defaultLanguage
  }

  const savedLanguage = window.localStorage.getItem('semraz-language')

  return savedLanguage === 'ko' || savedLanguage === 'en' ? savedLanguage : defaultLanguage
}

function hasSavedLanguagePreference() {
  if (typeof window === 'undefined') {
    return false
  }

  const savedLanguage = window.localStorage.getItem('semraz-language')

  return savedLanguage === 'ko' || savedLanguage === 'en'
}

function getSavedToken(storageKey: string) {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(storageKey)
}

function useI18n() {
  return useContext(I18nContext)
}

function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()

  return (
    <label className="language-switcher">
      <span>{t('language.label')}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        <option value="en">{t('language.en')}</option>
        <option value="ko">{t('language.ko')}</option>
      </select>
    </label>
  )
}

function SiteFooter({ variant }: { variant: 'auth' | 'app' }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()
  const columns: {
    heading: TranslationKey
    links: { key: TranslationKey; to: string }[]
  }[] = [
    {
      heading: 'footer.colProduct',
      links: [{ key: 'footer.overview', to: '/overview' }],
    },
    {
      heading: 'footer.colResources',
      links: [
        { key: 'footer.docs', to: '/docs' },
        { key: 'footer.guides', to: '/guides' },
        { key: 'footer.changelog', to: '/changelog' },
      ],
    },
    {
      heading: 'footer.colLegal',
      links: [
        { key: 'footer.privacy', to: '/privacy' },
        { key: 'footer.terms', to: '/terms' },
        { key: 'footer.security', to: '/security' },
      ],
    },
  ]

  return (
    <footer className={`site-footer site-footer--${variant}`}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="sz-wordmark sz-wordmark--footer">
            Semraz<i>.</i>
          </span>
          <p className="site-footer-tagline">{t('footer.tagline')}</p>
        </div>
        <div className={`footer-language footer-language--${variant}`}>
          <LanguageSwitcher />
        </div>
        <nav className="site-footer-cols" aria-label="Footer">
          {columns.map((column) => (
            <div className="site-footer-col" key={column.heading}>
              <span className="site-footer-col-heading">{t(column.heading)}</span>
              {column.links.map((link) => (
                <Link className="site-footer-link" to={link.to} key={link.key}>
                  {t(link.key)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="site-footer-bar">
        <span>{t('footer.rights', { year })}</span>
        <span className="site-footer-note">{t('footer.madeWith')}</span>
      </div>
    </footer>
  )
}

type ContentSection = { heading: string; body: string[] }
type ContentCard = { eyebrow?: string; title: string; body: string }
type ContentMetric = { value: string; label: string }
type ContentDoc = {
  eyebrow: string
  title: string
  intro: string
  updated?: string
  sections: ContentSection[]
  banner?: {
    kicker: string
    title: string
    body: string
    primary: string
    secondary: string
  }
  proverb?: {
    quote: string
    title: string
    body: string
  }
  highlights?: ContentCard[]
  workflow?: ContentCard[]
  agents?: ContentCard[]
  metrics?: ContentMetric[]
}

const contentPageSlugs = [
  'overview',
  'docs',
  'guides',
  'changelog',
  'privacy',
  'terms',
  'security',
] as const
type ContentPageSlug = (typeof contentPageSlugs)[number]

const contentPages: Record<ContentPageSlug, Record<Language, ContentDoc>> = {
  overview: {
    en: {
      eyebrow: 'Product',
      title: 'Measure a few times. Generate once.',
      intro:
        'Semraz turns a plain-language backend idea into a measured product specification, an interactive data model, API operations, generated code, and a verification pass you can trust before you download the app.',
      banner: {
        kicker: 'AI-native backend workspace',
        title: 'From first idea to tested application, without losing the blueprint.',
        body: 'Semraz keeps the project brief, planning rules, ERD, endpoint specs, generated backend application, and automated test result in one workspace so every generation run has a source of truth.',
        primary: 'Project -> Planning -> ERD -> Operations -> Generate -> Test',
        secondary: 'Workspace saved, code downloadable, tests repeatable',
      },
      proverb: {
        quote: 'Семь раз отмерь, один отрежь.',
        title: 'The name comes from a Russian proverb: measure seven times, cut once.',
        body: 'The saying is a warning against irreversible work done too early. Semraz applies that idea to backend development: measure the intent, constraints, data model, and endpoints first; cut code only when the shape is clear.',
      },
      metrics: [
        { value: '6', label: 'guided design steps' },
        { value: '3', label: 'AI drafting stages' },
        { value: '2', label: 'LangGraph agent flows' },
        { value: '1', label: 'downloadable app package' },
      ],
      highlights: [
        {
          eyebrow: 'AI Wizard',
          title: 'Draft with context, not guesswork',
          body: 'Project AI creates fresh product ideas. Planning reads the confirmed project. ERD reads project and planning. Operations reads the full chain and proposes endpoint specifications from it.',
        },
        {
          eyebrow: 'Canvas',
          title: 'Design the data model visually',
          body: 'The ERD canvas supports panning, zooming, entity boxes, columns, PK/NN/FK flags, relation setup, and validation so schema structure is visible before code exists.',
        },
        {
          eyebrow: 'Workspace',
          title: 'Keep every decision attached to the build',
          body: 'Projects persist as workspaces with brief, constraints, ERD, operations, generated app metadata, test results, coverage, and a downloadable application archive.',
        },
      ],
      sections: [
        {
          heading: 'Built for the moment before implementation gets expensive',
          body: [
            'Backend projects often fail because the first code appears before the domain is measured. Semraz slows down the risky parts and speeds up the repetitive parts: describe, constrain, model, specify, generate, test, and download.',
            'The result is not a black box. The workspace shows what was decided, which entities exist, which endpoints are planned, how generation progressed, and whether the generated application passed verification.',
          ],
        },
        {
          heading: 'What the product covers',
          body: [
            'Project and planning screens capture the application name, database choice, purpose, constraints, code conventions, and generation rules.',
            'The ERD and operations screens turn those decisions into entities, relationships, columns, CRUD operations, custom endpoints, request fields, and response fields.',
            'The generate and test screens create a backend application, run build checks, create tests, run coverage, and expose the finished app as a zip download.',
          ],
        },
        {
          heading: 'Who Semraz is for',
          body: [
            'Semraz is for founders, product engineers, backend builders, and small teams who need to explore backend shape quickly while keeping the important architectural decisions explicit and reviewable.',
          ],
        },
      ],
      workflow: [
        {
          title: '1. Project',
          body: 'Start with a product idea, name, database, and target framework. The AI draft can create a fresh concept when the canvas is empty.',
        },
        {
          title: '2. Planning',
          body: 'Convert the confirmed idea into purpose, constraints, code conventions, and rules that guide the later generation.',
        },
        {
          title: '3. ERD',
          body: 'Design entities, columns, keys, nullable rules, and relationships on a movable canvas with validation feedback.',
        },
        {
          title: '4. Operations',
          body: 'Map entities to API operations, request payloads, response fields, CRUD actions, and custom endpoint specs.',
        },
        {
          title: '5. Generate',
          body: 'Write markdown source files, run the build agent, generate a backend application, repair build failures, and package the output.',
        },
        {
          title: '6. Test',
          body: 'Understand endpoint specs, search the generated codebase, create Jest tests, run coverage, and iterate until verified.',
        },
      ],
      agents: [
        {
          title: 'Generation agent',
          body: 'A LangGraph build flow plans backend tasks, searches source context, generates code, applies patches, runs TypeScript/NestJS build checks, and repairs failures without discarding the specification.',
        },
        {
          title: 'Testing agent',
          body: 'A separate LangGraph test flow understands endpoint specs, searches the generated app, writes Jest tests, applies them, runs coverage, and loops back when tests fail.',
        },
        {
          title: 'Shared code tools',
          body: 'Builds and tests share workspace-safe tools for file search, AST-aware code inspection, scoped terminal execution, and code patching.',
        },
      ],
    },
    ko: {
      eyebrow: '제품',
      title: '몇 번 재고, 한 번에 생성하세요',
      intro:
        'Semraz는 자연어로 시작한 백엔드 아이디어를 프로젝트 요약, 계획, ERD, API 명세, 생성된 코드, 테스트 검증까지 이어지는 하나의 제품 설계 흐름으로 바꿔줍니다.',
      banner: {
        kicker: 'AI 기반 앱 생성 워크스페이스',
        title: '아이디어부터 테스트된 애플리케이션까지, 설계 기준을 잃지 않고 한 번에.',
        body: '프로젝트 개요, 계획 규칙, ERD, 엔드포인트 명세, 생성된 백엔드 애플리케이션, 자동 테스트 결과를 하나의 워크스페이스에 묶어 매번 같은 기준에서 생성하고 검토할 수 있습니다.',
        primary: '프로젝트 -> 계획 -> ERD -> 작업 -> 생성 -> 테스트',
        secondary: '워크스페이스 저장, 앱 다운로드, 테스트 반복 검증',
      },
      proverb: {
        quote: 'Семь раз отмерь, один отрежь.',
        title: 'Semraz라는 이름은 러시아 속담 “일곱 번 재고, 한 번 자르라”에서 출발했습니다.',
        body: '이 속담은 되돌리기 어려운 일을 하기 전에 충분히 검토하라는 뜻입니다. Semraz는 이 태도를 백엔드 개발에 적용합니다. 먼저 목적, 제약, 데이터 모델, 엔드포인트를 일곱 번 재고, 형태가 분명해졌을 때 코드를 한 번에 생성합니다.',
      },
      metrics: [
        { value: '6', label: '단계 설계 흐름' },
        { value: '3', label: 'AI 초안 단계' },
        { value: '2', label: 'LangGraph 에이전트 흐름' },
        { value: '1', label: '다운로드 가능한 앱 패키지' },
      ],
      highlights: [
        {
          eyebrow: 'AI 마법사',
          title: '맥락을 이어받아 초안을 만듭니다',
          body: '프로젝트 AI는 새 아이디어를 만들고, 계획은 확정된 프로젝트를 참조합니다. ERD는 프로젝트와 계획을 읽고, 작업 단계는 앞선 모든 내용을 바탕으로 API 명세를 제안합니다.',
        },
        {
          eyebrow: '캔버스',
          title: '데이터 모델을 눈으로 설계합니다',
          body: 'ERD 캔버스는 자유 이동, 줌, 엔티티 박스, 컬럼, PK/NN/FK 플래그, 관계 설정, 검증 정보를 지원해 코드가 생기기 전 구조를 먼저 확인하게 합니다.',
        },
        {
          eyebrow: '워크스페이스',
          title: '모든 결정을 생성 결과와 함께 보관합니다',
          body: '프로젝트 개요, 제약 조건, ERD, 작업 명세, 생성된 앱 정보, 테스트 결과, 커버리지, 다운로드 가능한 앱 아카이브가 하나의 워크스페이스에 저장됩니다.',
        },
      ],
      sections: [
        {
          heading: '구현 비용이 커지기 전, 설계를 먼저 측정합니다',
          body: [
            '백엔드 프로젝트는 코드가 너무 일찍 생길 때 자주 흔들립니다. Semraz는 위험한 결정은 천천히 측정하고, 반복적인 구현은 빠르게 처리합니다. 설명하고, 제약을 정하고, 모델링하고, 명세를 만들고, 생성하고, 테스트합니다.',
            '결과는 블랙박스가 아닙니다. 어떤 내용이 확정되었는지, 어떤 엔티티와 엔드포인트가 있는지, 생성이 어디까지 진행되었는지, 생성된 애플리케이션이 검증을 통과했는지를 워크스페이스에서 확인할 수 있습니다.',
          ],
        },
        {
          heading: '제품이 다루는 범위',
          body: [
            '프로젝트와 계획 화면에서는 애플리케이션 이름, 데이터베이스, 목적, 제약 조건, 코드 컨벤션, 생성 규칙을 정리합니다.',
            'ERD와 작업 화면에서는 엔티티, 관계, 컬럼, CRUD 작업, 커스텀 엔드포인트, 요청 필드, 응답 필드를 구체화합니다.',
            '생성과 테스트 화면에서는 백엔드 애플리케이션을 만들고, 빌드 검사를 실행하고, 테스트 코드를 생성하고, 커버리지를 확인한 뒤, 완성된 앱을 zip으로 다운로드할 수 있게 합니다.',
          ],
        },
        {
          heading: '누구를 위한 제품인가',
          body: [
            'Semraz는 아이디어를 빠르게 백엔드 형태로 검증해야 하는 창업자, 제품 엔지니어, 백엔드 빌더, 작은 개발팀을 위한 제품입니다. 빠르게 만들되, 중요한 설계 결정은 명시적으로 남기고 검토할 수 있게 합니다.',
          ],
        },
      ],
      workflow: [
        {
          title: '1. 프로젝트',
          body: '제품 아이디어, 이름, 데이터베이스, 대상 프레임워크를 정합니다. 비어 있는 상태에서는 AI가 새로운 프로젝트 초안을 생성할 수 있습니다.',
        },
        {
          title: '2. 계획',
          body: '확정된 프로젝트 정보를 목적, 제약 조건, 코드 컨벤션, 생성 규칙으로 바꿔 이후 단계의 기준으로 삼습니다.',
        },
        {
          title: '3. ERD',
          body: '움직이는 캔버스 위에서 엔티티, 컬럼, 키, 필수 여부, 관계를 설계하고 검증합니다.',
        },
        {
          title: '4. 작업',
          body: '엔티티별 API 작업, 요청 payload, 응답 필드, CRUD, 커스텀 엔드포인트를 정의합니다.',
        },
        {
          title: '5. 생성',
          body: '마크다운 설계 입력을 만들고, 빌드 에이전트가 백엔드 애플리케이션을 생성하며, 빌드 실패는 자동 복구 루프로 다룹니다.',
        },
        {
          title: '6. 테스트',
          body: '엔드포인트 명세를 이해하고, 생성된 코드베이스를 검색하고, Jest 테스트를 생성한 뒤 커버리지와 검증 결과를 확인합니다.',
        },
      ],
      agents: [
        {
          title: '생성 에이전트',
          body: 'LangGraph 기반 빌드 흐름이 백엔드 작업을 계획하고, 코드 컨텍스트를 검색하고, 코드를 생성하고, 패치를 적용하고, TypeScript/NestJS 빌드 검사를 실행하며, 실패한 빌드는 명세를 지운 채 회피하지 않고 복구합니다.',
        },
        {
          title: '테스트 에이전트',
          body: '별도의 LangGraph 테스트 흐름이 엔드포인트 명세를 이해하고, 생성된 앱을 검색하고, Jest 테스트를 작성하고, 커버리지를 실행하며, 실패 시 다시 테스트 생성 단계로 돌아갑니다.',
        },
        {
          title: '공용 코드 도구',
          body: '생성과 테스트는 파일 검색, AST 기반 코드 검색, 제한된 터미널 실행, 코드 패치 도구를 함께 사용해 워크스페이스 안에서 안전하게 코드를 다룹니다.',
        },
      ],
    },
  },
  docs: {
    en: {
      eyebrow: 'Resources',
      title: 'Documentation',
      intro: 'Everything you need to go from a new workspace to generated, tested code.',
      sections: [
        {
          heading: 'Getting started',
          body: [
            'Create an account, then start a new backend from the dashboard. Give it a short brief describing what the service should do.',
            'Semraz walks you through each step of the flow — you can move forward, jump back, and edit at any point. Your progress is saved to the workspace automatically.',
          ],
        },
        {
          heading: 'Modeling your data',
          body: [
            'Add entities for the core concepts in your domain and connect them with relationships. The ERD stays in sync with the operations Semraz can generate.',
          ],
        },
        {
          heading: 'Generating and reviewing code',
          body: [
            'When the model and operations look right, run generation. Semraz produces structured code and runs an automated test pass.',
            'Always review generated code before deploying it to production.',
          ],
        },
      ],
    },
    ko: {
      eyebrow: '리소스',
      title: '문서',
      intro: '새 워크스페이스에서 생성·테스트된 코드까지 나아가는 데 필요한 모든 것.',
      sections: [
        {
          heading: '시작하기',
          body: [
            '계정을 만든 뒤 대시보드에서 새 백엔드를 시작하세요. 서비스가 무엇을 해야 하는지 짧은 개요로 설명합니다.',
            'Semraz는 흐름의 각 단계를 안내합니다. 언제든 앞으로 나아가고, 뒤로 돌아가고, 수정할 수 있습니다. 진행 상황은 워크스페이스에 자동 저장됩니다.',
          ],
        },
        {
          heading: '데이터 모델링',
          body: [
            '도메인의 핵심 개념을 엔티티로 추가하고 관계로 연결하세요. ERD는 Semraz가 생성할 수 있는 오퍼레이션과 항상 동기화됩니다.',
          ],
        },
        {
          heading: '코드 생성과 검토',
          body: [
            '모델과 오퍼레이션이 준비되면 생성을 실행하세요. Semraz가 구조화된 코드를 만들고 자동 테스트를 수행합니다.',
            '생성된 코드는 운영에 배포하기 전에 반드시 직접 검토하세요.',
          ],
        },
      ],
    },
  },
  guides: {
    en: {
      eyebrow: 'Resources',
      title: 'Guides',
      intro:
        'A practical guide for turning a rough backend idea into a reviewable, generated, and tested application workspace.',
      sections: [
        {
          heading: '1. Start with a project brief that can be measured',
          body: [
            'Write the product in one or two concrete sentences: who uses it, what they create or manage, and which outcome matters. Good examples mention the domain directly, such as orders and payments, health records, bookings, tasks, or member operations.',
            'Pick the database early because it shapes generated conventions. PostgreSQL is the default path today, and the generated backend application is optimized around a TypeScript/NestJS-style service structure.',
            'If you use the AI wizard on the Project step, treat the draft as a starting point. Rename the project, tighten the description, and remove any domain idea that you would not want to become a table or endpoint later.',
          ],
        },
        {
          heading: '2. Turn the brief into planning rules',
          body: [
            'The Planning step should explain the purpose of the service and the constraints the generated code must respect. Include naming conventions, validation expectations, authorization assumptions, compile/test requirements, and anything that should not be generated.',
            'Keep constraints operational. Instead of writing “secure code”, write “do not expose admin-only operations without an owner role” or “all create/update DTO fields must be validated”. Specific rules give later stages something concrete to preserve.',
            'Use the preview as a contract. The markdown shown on the right is the source material that generation will inherit, so make it readable enough for another engineer to understand without opening the UI.',
          ],
        },
        {
          heading: '3. Design an ERD that describes real ownership',
          body: [
            'Start from the nouns in your project brief and give each entity one clear responsibility. User, Order, Payment, Booking, Profile, Metric, Project, and Task are good entity shapes only when they represent real domain concepts.',
            'Every entity should have a primary key, clear required fields, and names that will still read well in controller paths and DTOs. Use singular entity names and keep field names short, consistent, and implementation-friendly.',
            'Add relationships only where the dependency is real. If a HealthMetric belongs to a User, model that relation. If a Payment belongs to an Order, make the foreign key and relation explicit instead of leaving a loose uuid field.',
            'Use canvas pan and zoom when the model grows. Keep related entities near each other so relation lines remain readable before you move on to operations.',
          ],
        },
        {
          heading: '4. Choose operations like product behavior, not boilerplate',
          body: [
            'Enable only the endpoints your product actually needs. A small set of well-scoped operations is easier to review, test, secure, and regenerate than a full CRUD surface that nobody uses.',
            'For each operation, check the method, path, request fields, response fields, and description. The description should say what the endpoint does in product terms, not just “handles request”.',
            'Use custom operations for domain actions that are not plain CRUD: confirming a payment, assigning a role, closing a task, publishing a project, recording a metric, or listing filtered results.',
            'Before generating, scan the API preview. If it sounds wrong as product documentation, it will probably generate the wrong code shape too.',
          ],
        },
        {
          heading: '5. Generate with a stable source of truth',
          body: [
            'The Generate step writes the current project, planning, ERD, endpoints, and rules into workspace markdown files. These files are the build input, so the previous steps should be coherent before you run generation.',
            'Run app generation when the summary looks right. The build agent creates the backend application, applies generated files, runs TypeScript/NestJS build checks, and attempts repair when the first output does not compile.',
            'Read the terminal log from top to bottom. Successful generation should show the workspace snapshot, generated files, build check, and final verification state. If it fails, go back to the weakest design step rather than repeatedly generating from the same vague input.',
          ],
        },
        {
          heading: '6. Test, review, and download responsibly',
          body: [
            'The Test step starts from the endpoint/function specifications, searches the generated codebase, creates Jest tests, applies them, and runs coverage/verification. Use it to catch missing behavior before you download the app.',
            'A passing test run is not production approval. Review generated controllers, services, DTOs, validation rules, error behavior, and persistence assumptions before connecting the application to real users or data.',
            'Once the project is complete, return to the workspace dashboard and download the app package. Keep the workspace around if you expect to revise the product and regenerate from the same measured design.',
          ],
        },
      ],
    },
    ko: {
      eyebrow: '리소스',
      title: '가이드',
      intro:
        '거친 백엔드 아이디어를 검토 가능한 설계, 생성된 애플리케이션, 테스트 결과가 있는 워크스페이스로 바꾸기 위한 실전 안내서.',
      sections: [
        {
          heading: '1. 측정 가능한 프로젝트 개요로 시작하기',
          body: [
            '제품을 한두 문장으로 구체적으로 적으세요. 누가 쓰는지, 무엇을 만들거나 관리하는지, 어떤 결과가 중요한지가 보여야 합니다. 주문/결제, 건강 기록, 예약, 업무, 회원 운영처럼 도메인이 직접 드러나는 설명이 좋습니다.',
            '데이터베이스는 초기에 정하세요. 데이터베이스 선택은 생성되는 구조와 규칙에 영향을 줍니다. 현재 기본 경로는 PostgreSQL이며, 생성되는 백엔드 애플리케이션은 TypeScript/NestJS 스타일의 서비스 구조에 맞춰져 있습니다.',
            '프로젝트 단계에서 AI 마법사를 사용했다면 초안을 그대로 확정하지 말고 출발점으로 다루세요. 프로젝트 이름과 설명을 다듬고, 나중에 테이블이나 엔드포인트가 되면 곤란한 모호한 아이디어는 제거하세요.',
          ],
        },
        {
          heading: '2. 개요를 계획 규칙으로 바꾸기',
          body: [
            '계획 단계에는 서비스의 목적과 생성 코드가 지켜야 할 제약을 적습니다. 네이밍 규칙, 검증 방식, 권한 가정, 컴파일/테스트 요구사항, 생성하지 말아야 할 범위를 구체적으로 남기세요.',
            '제약 조건은 실행 가능하게 써야 합니다. “보안 좋은 코드”보다는 “owner 역할 없이 관리자 전용 작업을 노출하지 않기”, “create/update DTO 필드는 모두 검증하기”처럼 나중 단계가 보존할 수 있는 규칙이 좋습니다.',
            '오른쪽 미리보기는 계약서처럼 읽어보세요. 생성 단계가 이어받을 설계 입력이므로, UI를 보지 않는 다른 개발자도 이해할 수 있을 만큼 명확해야 합니다.',
          ],
        },
        {
          heading: '3. 실제 소유 관계를 설명하는 ERD 만들기',
          body: [
            '프로젝트 개요의 명사에서 엔티티를 뽑고 각 엔티티에 하나의 명확한 책임을 주세요. User, Order, Payment, Booking, Profile, Metric, Project, Task 같은 이름은 실제 도메인 개념을 대표할 때만 좋은 엔티티가 됩니다.',
            '모든 엔티티에는 기본키, 명확한 필수 필드, 컨트롤러 경로와 DTO에서 읽기 좋은 이름이 필요합니다. 엔티티 이름은 단수형으로 두고, 필드 이름은 짧고 일관되게 유지하세요.',
            '관계는 실제 의존성이 있을 때만 추가하세요. HealthMetric이 User에 속한다면 관계를 연결하고, Payment가 Order에 속한다면 느슨한 uuid 필드만 두지 말고 FK와 관계를 명확히 표현하세요.',
            '모델이 커지면 캔버스 이동과 줌을 활용하세요. 관련 엔티티를 가까이 두면 작업 단계로 넘어가기 전 관계선을 더 쉽게 검토할 수 있습니다.',
          ],
        },
        {
          heading: '4. 작업은 보일러플레이트가 아니라 제품 행동으로 고르기',
          body: [
            '제품에 실제로 필요한 엔드포인트만 활성화하세요. 사용하지 않는 전체 CRUD보다 범위가 잘 정의된 소수의 작업이 검토, 테스트, 보안, 재생성에 유리합니다.',
            '각 작업의 메서드, 경로, 요청 필드, 응답 필드, 설명을 확인하세요. 설명은 “요청 처리”가 아니라 제품 관점에서 이 엔드포인트가 무엇을 하는지 말해야 합니다.',
            '단순 CRUD가 아닌 도메인 행동에는 커스텀 작업을 쓰세요. 결제 승인, 역할 부여, 작업 종료, 프로젝트 발행, 지표 기록, 필터링 목록 조회 같은 기능이 여기에 해당합니다.',
            '생성 전에 API 미리보기를 훑어보세요. 제품 문서처럼 읽었을 때 어색하다면, 생성되는 코드 형태도 어색할 가능성이 큽니다.',
          ],
        },
        {
          heading: '5. 하나의 설계 기준으로 생성하기',
          body: [
            '생성 단계는 현재 프로젝트, 계획, ERD, 엔드포인트, 규칙을 워크스페이스 마크다운 파일로 기록합니다. 이 파일들이 빌드 입력이므로, 이전 단계들이 서로 모순되지 않아야 합니다.',
            '요약이 맞아 보이면 앱 생성을 실행하세요. 빌드 에이전트가 백엔드 애플리케이션을 만들고, 생성 파일을 적용하고, TypeScript/NestJS 빌드 검사를 실행하며, 첫 출력이 컴파일되지 않으면 복구를 시도합니다.',
            '터미널 로그는 위에서 아래로 읽어보세요. 정상 흐름이라면 워크스페이스 스냅샷, 생성 파일, 빌드 검사, 최종 검증 상태가 이어집니다. 실패하면 같은 애매한 입력으로 반복 생성하기보다 가장 약한 설계 단계로 돌아가는 편이 좋습니다.',
          ],
        },
        {
          heading: '6. 테스트하고, 검토하고, 책임 있게 다운로드하기',
          body: [
            '테스트 단계는 엔드포인트/기능 명세를 이해하고, 생성된 코드베이스를 검색하고, Jest 테스트를 만들고, 테스트와 커버리지 검증을 실행합니다. 앱을 다운로드하기 전에 누락된 동작을 찾는 용도로 사용하세요.',
            '테스트 통과가 곧 운영 승인이라는 뜻은 아닙니다. 실제 사용자나 데이터에 연결하기 전에 컨트롤러, 서비스, DTO, 검증 규칙, 에러 처리, 저장소 가정을 직접 검토하세요.',
            '프로젝트가 완료되면 워크스페이스 대시보드로 돌아가 앱 패키지를 다운로드할 수 있습니다. 같은 설계를 기준으로 다시 고칠 가능성이 있다면 워크스페이스를 남겨두세요.',
          ],
        },
      ],
    },
  },
  changelog: {
    en: {
      eyebrow: 'Resources',
      title: 'Changelog',
      intro: 'A record of notable changes to Semraz.',
      sections: [
        {
          heading: 'v0.3 — Guided flow',
          body: [
            'Reworked the create experience into a step-by-step flow: project, data model, operations, generation, and test.',
            'Workspaces now persist your progress so you can resume any project.',
          ],
        },
        {
          heading: 'v0.2 — Interactive ERD',
          body: [
            'Added an interactive data model editor with relationships that stay in sync with generated operations.',
          ],
        },
        {
          heading: 'v0.1 — First preview',
          body: ['Initial release: describe a backend and generate structured code from it.'],
        },
      ],
    },
    ko: {
      eyebrow: '리소스',
      title: '변경 이력',
      intro: 'Semraz의 주요 변경 사항 기록.',
      sections: [
        {
          heading: 'v0.3 — 안내된 흐름',
          body: [
            '생성 경험을 프로젝트, 데이터 모델, 오퍼레이션, 생성, 테스트의 단계별 흐름으로 개편했습니다.',
            '이제 워크스페이스가 진행 상황을 저장하여 어떤 프로젝트든 이어서 진행할 수 있습니다.',
          ],
        },
        {
          heading: 'v0.2 — 대화형 ERD',
          body: [
            '생성된 오퍼레이션과 동기화되는 관계를 갖춘 대화형 데이터 모델 편집기를 추가했습니다.',
          ],
        },
        {
          heading: 'v0.1 — 첫 프리뷰',
          body: ['최초 릴리스: 백엔드를 설명하면 구조화된 코드를 생성합니다.'],
        },
      ],
    },
  },
  privacy: {
    en: {
      eyebrow: 'Legal',
      title: 'Privacy Policy',
      intro: 'How Semraz collects, uses, and protects your information.',
      updated: 'Last updated: July 9, 2026',
      sections: [
        {
          heading: 'Information we collect',
          body: [
            'Account details such as your name and email address, and the project content you create — briefs, data models, and generated code — so we can provide the service.',
          ],
        },
        {
          heading: 'How we use it',
          body: [
            'To operate and improve Semraz, to generate the code you request, and to keep your account secure. We do not sell your personal information.',
          ],
        },
        {
          heading: 'Data retention and your rights',
          body: [
            'Your project content is stored in your workspace until you delete it. You may request access to, correction of, or deletion of your personal data at any time.',
          ],
        },
        {
          heading: 'Contact',
          body: ['Questions about privacy can be sent to ruffmadman@kakao.com.'],
        },
      ],
    },
    ko: {
      eyebrow: '약관',
      title: '개인정보 처리방침',
      intro: 'Semraz가 정보를 수집·이용·보호하는 방식.',
      updated: '최종 수정일: 2026년 7월 9일',
      sections: [
        {
          heading: '수집하는 정보',
          body: [
            '서비스 제공을 위해 이름·이메일 주소 등 계정 정보와, 사용자가 생성한 프로젝트 콘텐츠(개요, 데이터 모델, 생성된 코드)를 수집합니다.',
          ],
        },
        {
          heading: '이용 목적',
          body: [
            'Semraz의 운영과 개선, 요청한 코드 생성, 계정 보안 유지를 위해 정보를 이용합니다. 개인정보를 판매하지 않습니다.',
          ],
        },
        {
          heading: '보관 기간과 이용자 권리',
          body: [
            '프로젝트 콘텐츠는 삭제하기 전까지 워크스페이스에 보관됩니다. 언제든지 개인정보의 열람·정정·삭제를 요청할 수 있습니다.',
          ],
        },
        {
          heading: '문의',
          body: ['개인정보 관련 문의는 ruffmadman@kakao.com 으로 보내주세요.'],
        },
      ],
    },
  },
  terms: {
    en: {
      eyebrow: 'Legal',
      title: 'Terms of Service',
      intro: 'The agreement that governs your use of Semraz.',
      updated: 'Last updated: July 9, 2026',
      sections: [
        {
          heading: 'Acceptable use',
          body: [
            'Use Semraz only to design and generate projects you are authorized to build. Do not upload secrets or unlawful content.',
          ],
        },
        {
          heading: 'Generated code',
          body: [
            'You are responsible for reviewing generated code before using it in production. Semraz is not liable for outcomes arising from generated output.',
          ],
        },
        {
          heading: 'Your account',
          body: [
            'You are responsible for activity under your account and for keeping your credentials secure.',
          ],
        },
        {
          heading: 'Changes',
          body: [
            'We may update these terms as the service evolves. Continued use after an update means you accept the revised terms.',
          ],
        },
      ],
    },
    ko: {
      eyebrow: '약관',
      title: '이용약관',
      intro: 'Semraz 이용에 적용되는 약정.',
      updated: '최종 수정일: 2026년 7월 9일',
      sections: [
        {
          heading: '허용되는 이용',
          body: [
            'Semraz는 권한이 있는 프로젝트의 설계와 생성에만 사용하세요. 비밀 정보나 불법 콘텐츠를 업로드하지 마세요.',
          ],
        },
        {
          heading: '생성된 코드',
          body: [
            '생성된 코드는 운영에 적용하기 전에 직접 검토할 책임이 있습니다. Semraz는 생성된 결과로 인한 문제에 책임을 지지 않습니다.',
          ],
        },
        {
          heading: '계정',
          body: ['계정에서 이루어지는 활동과 인증 정보의 보안 유지는 이용자의 책임입니다.'],
        },
        {
          heading: '변경',
          body: [
            '서비스 발전에 따라 약관을 변경할 수 있습니다. 변경 이후에도 계속 이용하면 개정된 약관에 동의한 것으로 간주됩니다.',
          ],
        },
      ],
    },
  },
  security: {
    en: {
      eyebrow: 'Legal',
      title: 'Security',
      intro: 'How we protect your account and your project data.',
      sections: [
        {
          heading: 'Data protection',
          body: [
            'Traffic is encrypted in transit, and access to your workspace requires authentication. Your project content is isolated to your account.',
          ],
        },
        {
          heading: 'Account safety',
          body: [
            'Use a strong, unique password. We recommend rotating credentials if you suspect they have been exposed.',
          ],
        },
        {
          heading: 'Reporting a vulnerability',
          body: [
            'If you discover a security issue, please report it to ruffmadman@kakao.com. We investigate every report and aim to respond promptly.',
          ],
        },
      ],
    },
    ko: {
      eyebrow: '약관',
      title: '보안',
      intro: '계정과 프로젝트 데이터를 보호하는 방식.',
      sections: [
        {
          heading: '데이터 보호',
          body: [
            '전송 구간의 트래픽은 암호화되며, 워크스페이스 접근에는 인증이 필요합니다. 프로젝트 콘텐츠는 계정 단위로 격리됩니다.',
          ],
        },
        {
          heading: '계정 안전',
          body: [
            '강력하고 고유한 비밀번호를 사용하세요. 노출이 의심되면 인증 정보를 교체하는 것을 권장합니다.',
          ],
        },
        {
          heading: '취약점 신고',
          body: [
            '보안 문제를 발견하면 ruffmadman@kakao.com 으로 신고해 주세요. 모든 신고를 조사하며 신속히 대응하고자 합니다.',
          ],
        },
      ],
    },
  },
}

function ContentPage({ slug }: { slug: ContentPageSlug }) {
  const { language, t } = useI18n()
  const navigate = useNavigate()
  const doc = contentPages[slug][language]

  return (
    <div className="content-layout">
      <header className="content-topbar">
        <button
          className="content-brand"
          type="button"
          onClick={() => navigate('/')}
          aria-label="Semraz"
        >
          <span className="sz-wordmark">
            Semraz<i>.</i>
          </span>
        </button>
        <LanguageSwitcher />
      </header>
      <main className="content-page">
        <article
          className={`content-article${slug === 'overview' ? '' : ' content-article--document'}`}
        >
          <p className="eyebrow">{doc.eyebrow}</p>
          <h1>{doc.title}</h1>
          <p className="content-intro">{doc.intro}</p>
          {doc.updated ? <p className="content-updated">{doc.updated}</p> : null}
          {doc.banner ? (
            <section className="overview-banner">
              <div className="overview-banner-copy">
                <p className="overview-kicker">{doc.banner.kicker}</p>
                <h2>{doc.banner.title}</h2>
                <p>{doc.banner.body}</p>
              </div>
              <div className="overview-banner-visual" aria-hidden="true">
                <div className="overview-flow-card">
                  <span>Project</span>
                  <span>Planning</span>
                  <span>ERD</span>
                  <span>Operations</span>
                  <span>Generate</span>
                  <span>Test</span>
                </div>
              </div>
            </section>
          ) : null}
          {doc.proverb ? (
            <section className="overview-proverb">
              <p>{doc.proverb.quote}</p>
              <div>
                <h2>{doc.proverb.title}</h2>
                <p>{doc.proverb.body}</p>
              </div>
            </section>
          ) : null}
          {doc.highlights ? (
            <section className="overview-card-grid">
              {doc.highlights.map((card) => (
                <article className="overview-card" key={card.title}>
                  {card.eyebrow ? <p>{card.eyebrow}</p> : null}
                  <h2>{card.title}</h2>
                  <span>{card.body}</span>
                </article>
              ))}
            </section>
          ) : null}
          {doc.sections.map((section) => (
            <section className="content-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          ))}
          {doc.workflow ? (
            <section className="overview-workflow">
              {doc.workflow.map((step) => (
                <article className="overview-step" key={step.title}>
                  <h2>{step.title}</h2>
                  <p>{step.body}</p>
                </article>
              ))}
            </section>
          ) : null}
          <div className="content-back">
            <Link className="text-button" to="/">
              {t('common.backHome')}
            </Link>
          </div>
        </article>
      </main>
      <SiteFooter variant="auth" />
    </div>
  )
}

function buildSkillsMarkdown(
  draftProject: DraftProject,
  t: (key: TranslationKey, values?: TranslationValues) => string,
) {
  return `# ${draftProject.name}

## ${t('skills.purpose')}
${draftProject.planning.purpose}

## ${t('skills.constraints')}
${draftProject.planning.constraints}

## ${t('skills.targetStack')}
- ${t('skills.framework')}: NestJS
- ${t('skills.language')}: TypeScript
- ${t('skills.database')}: ${draftProject.database}
- ${t('skills.verification')}: ${t('skills.verificationValue')}`
}

function createDefaultDraftProject(_language: Language): DraftProject {
  return {
    name: '',
    description: '',
    framework: 'NestJS',
    database: 'PostgreSQL',
    planning: {
      purpose: '',
      constraints: '',
    },
  }
}

function isDefaultDraftProject(draftProject: DraftProject) {
  const legacyDrafts: DraftProject[] = [
    {
      name: '커머스 백엔드',
      description: '주문, 결제, 배송과 회원 서비스 API를 제공하는 백엔드입니다.',
      framework: 'NestJS',
      database: 'PostgreSQL',
      planning: {
        purpose: '주문, 결제, 배송, 회원 기능을 안정적으로 처리하는 커머스 백엔드를 구축합니다.',
        constraints:
          '- NestJS 모듈/컨트롤러/서비스 구조를 사용합니다\n- 요청 검증을 위한 DTO 클래스를 작성합니다\n- 컴파일 가능한 TypeScript 코드를 생성합니다\n- 프로젝트 스펙을 단일 기준으로 유지합니다',
      },
    },
    {
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
    },
  ]
  const defaultDrafts = [createDefaultDraftProject(defaultLanguage), ...legacyDrafts]

  return defaultDrafts.some(
    (defaultDraft) =>
      draftProject.name === defaultDraft.name &&
      draftProject.description === defaultDraft.description &&
      draftProject.framework === defaultDraft.framework &&
      draftProject.database === defaultDraft.database &&
      draftProject.planning.purpose === defaultDraft.planning.purpose &&
      draftProject.planning.constraints === defaultDraft.planning.constraints,
  )
}

function MagicWandIcon() {
  return (
    <svg
      aria-hidden="true"
      className="wizard-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="m14.5 4.5 1.1-2.2 1.1 2.2 2.2 1.1-2.2 1.1-1.1 2.2-1.1-2.2-2.2-1.1 2.2-1.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="m5 19 8.6-8.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <path d="m11.8 8.8 3.4 3.4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <path
        d="m5.2 5.4.8-1.6.8 1.6 1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      className="logout-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M10 6H6.8A1.8 1.8 0 0 0 5 7.8v8.4A1.8 1.8 0 0 0 6.8 18H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M13 8l4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M17 12H9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="menu-icon" fill="none" focusable="false" viewBox="0 0 24 24">
      <path d="M5 7h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function App() {
  const navigate = useNavigate()
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('')
  const [token, setToken] = useState<string | null>(() => getSavedToken(accessTokenStorageKey))
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    getSavedToken(refreshTokenStorageKey),
  )
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [flowStep, setFlowStep] = useState(0)
  const [draftProject, setDraftProject] = useState<DraftProject>(() =>
    createDefaultDraftProject(language),
  )

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )
  const activeWorkspace = useMemo(
    () => projects.find((project) => project.id === activeWorkspaceId),
    [activeWorkspaceId, projects],
  )
  const t = useMemo(
    () => (key: TranslationKey, values?: TranslationValues) =>
      interpolate(translations[language][key], values),
    [language],
  )
  const i18nValue = useMemo(
    () => ({
      language,
      setLanguage: (nextLanguage: Language) => {
        setLanguageState(nextLanguage)
        window.localStorage.setItem('semraz-language', nextLanguage)
      },
      t,
    }),
    [language, t],
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (hasSavedLanguagePreference()) {
      return
    }

    let isActive = true

    void fetch(`${apiBaseUrl}/api/locale`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to determine locale')
        }

        return (await response.json()) as { locale?: unknown }
      })
      .then(({ locale }) => {
        if (isActive && !hasSavedLanguagePreference() && (locale === 'ko' || locale === 'en')) {
          setLanguageState(locale)
        }
      })
      .catch(() => {
        // English remains the fallback when a location cannot be determined.
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    setDraftProject((currentDraft) => {
      const emptyDraft = createDefaultDraftProject(language)
      const isAlreadyEmpty =
        currentDraft.name === emptyDraft.name &&
        currentDraft.description === emptyDraft.description &&
        currentDraft.framework === emptyDraft.framework &&
        currentDraft.database === emptyDraft.database &&
        currentDraft.planning.purpose === emptyDraft.planning.purpose &&
        currentDraft.planning.constraints === emptyDraft.planning.constraints

      if (!isDefaultDraftProject(currentDraft) || isAlreadyEmpty) {
        return currentDraft
      }

      return emptyDraft
    })
  }, [draftProject, language])

  useEffect(() => {
    if (!token || user) {
      return
    }

    let isActive = true

    async function restoreSession() {
      try {
        const meResponse = await authFetch(`${apiBaseUrl}/api/auth/me`)

        if (!meResponse.ok) {
          throw new Error(t('error.loginFailed'))
        }

        const restoredUser = (await meResponse.json()) as User
        const projectsResponse = await authFetch(`${apiBaseUrl}/api/projects`)

        if (!projectsResponse.ok) {
          throw new Error(t('error.projectsFailed'))
        }

        const projectData = (await projectsResponse.json()) as Project[]

        if (!isActive) {
          return
        }

        setUser(restoredUser)
        setProjects(projectData)
        setSelectedProjectId(projectData[0]?.id ?? null)
      } catch {
        if (isActive) {
          clearAuth()
        }
      }
    }

    void restoreSession()

    return () => {
      isActive = false
    }
  }, [token, user])

  function persistAuth(authData: AuthResponse) {
    window.localStorage.setItem(accessTokenStorageKey, authData.accessToken)
    window.localStorage.setItem(refreshTokenStorageKey, authData.refreshToken)
    setToken(authData.accessToken)
    setRefreshToken(authData.refreshToken)
    setUser(authData.user)
  }

  function clearAuth() {
    window.localStorage.removeItem(accessTokenStorageKey)
    window.localStorage.removeItem(refreshTokenStorageKey)
    setToken(null)
    setRefreshToken(null)
    setUser(null)
  }

  async function refreshAuthToken() {
    if (!refreshToken) {
      throw new Error(t('error.loginFailed'))
    }

    const refreshResponse = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!refreshResponse.ok) {
      throw new Error(t('error.loginFailed'))
    }

    const authData = (await refreshResponse.json()) as AuthResponse
    persistAuth(authData)

    return authData.accessToken
  }

  async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const requestWithToken = (nextToken: string | null) => {
      const headers = new Headers(init.headers)

      if (nextToken) {
        headers.set('Authorization', `Bearer ${nextToken}`)
      }

      return fetch(input, { ...init, headers })
    }

    let response = await requestWithToken(token)

    if (response.status === 401 && refreshToken) {
      try {
        response = await requestWithToken(await refreshAuthToken())
      } catch {
        clearAuth()
      }
    }

    return response
  }

  async function readApiError(response: Response, fallback: string) {
    try {
      const payload = (await response.json()) as {
        message?: string | string[]
      }
      const message = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message

      return localizeApiError(message ?? fallback, fallback)
    } catch {
      return fallback
    }
  }

  function localizeApiError(message: string, fallback: string) {
    if (message.includes('Email is already registered')) {
      return t('error.emailTaken')
    }

    if (message.includes('one account every 3 days')) {
      return t('error.signupRateLimited')
    }

    if (message.includes('valid email')) {
      return t('error.emailInvalid')
    }

    if (
      message.includes('Password must') ||
      message.includes('Password cannot') ||
      message.includes('Password is too common')
    ) {
      return t('error.passwordWeak')
    }

    return fallback
  }

  function isStrongSignupPassword(candidatePassword: string) {
    const normalizedPassword = candidatePassword.toLowerCase()
    const emailLocalPart = signupEmail.trim().toLowerCase().split('@')[0] ?? ''
    const normalizedName = signupName.trim().toLowerCase()
    const commonPasswords = new Set([
      'password',
      'password1',
      '12345678',
      '123456789',
      'qwerty123',
      'semraz',
      'admin123',
    ])

    return (
      candidatePassword.length >= 10 &&
      !/\s/.test(candidatePassword) &&
      /[A-Za-z]/.test(candidatePassword) &&
      /\d/.test(candidatePassword) &&
      /[^A-Za-z0-9]/.test(candidatePassword) &&
      !commonPasswords.has(normalizedPassword) &&
      !(emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart)) &&
      !(normalizedName.length >= 3 && normalizedPassword.includes(normalizedName))
    )
  }

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
        throw new Error(t('error.loginFailed'))
      }

      const loginData = (await loginResponse.json()) as AuthResponse
      const projectsResponse = await fetch(`${apiBaseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
      })

      if (!projectsResponse.ok) {
        throw new Error(t('error.projectsFailed'))
      }

      const projectData = (await projectsResponse.json()) as Project[]
      persistAuth(loginData)
      setProjects(projectData)
      setSelectedProjectId(projectData[0]?.id ?? null)
      navigate('/')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t('error.unexpectedLogin'))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    if (signupPassword !== signupPasswordConfirm) {
      setError(t('error.passwordMismatch'))
      setIsLoading(false)
      return
    }

    if (!isStrongSignupPassword(signupPassword)) {
      setError(t('error.passwordWeak'))
      setIsLoading(false)
      return
    }

    try {
      const emailAvailabilityResponse = await fetch(
        `${apiBaseUrl}/api/auth/email-availability?email=${encodeURIComponent(signupEmail)}`,
        {
          headers: { 'Accept-Language': language },
        },
      )

      if (!emailAvailabilityResponse.ok) {
        throw new Error(await readApiError(emailAvailabilityResponse, t('error.signupFailed')))
      }

      const emailAvailability = (await emailAvailabilityResponse.json()) as {
        available: boolean
      }

      if (!emailAvailability.available) {
        throw new Error(t('error.emailTaken'))
      }

      const signupResponse = await fetch(`${apiBaseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': language,
        },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
        }),
      })

      if (!signupResponse.ok) {
        throw new Error(await readApiError(signupResponse, t('error.signupFailed')))
      }

      const signupData = (await signupResponse.json()) as AuthResponse
      const projectsResponse = await fetch(`${apiBaseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${signupData.accessToken}` },
      })

      if (!projectsResponse.ok) {
        throw new Error(t('error.projectsFailed'))
      }

      const projectData = (await projectsResponse.json()) as Project[]
      persistAuth(signupData)
      setProjects(projectData)
      setSelectedProjectId(projectData[0]?.id ?? null)
      navigate('/')
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : t('error.unexpectedSignup'))
    } finally {
      setIsLoading(false)
    }
  }

  function showSignup() {
    setError(null)
    setSignupEmail(email)
    setSignupPassword('')
    setSignupPasswordConfirm('')
    navigate('/signup')
  }

  function showLogin() {
    setError(null)
    navigate('/login')
  }

  function handleLogout() {
    if (token) {
      void fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }

    clearAuth()
    setProjects([])
    setSelectedProjectId(null)
    setActiveWorkspaceId(null)
    navigate('/login')
  }

  function startCreateFlow() {
    const nextDraftProject = createDefaultDraftProject(language)

    setDraftProject(nextDraftProject)
    setFlowStep(0)
    setActiveWorkspaceId(null)
    navigate('/new')
  }

  function goToWorkspaceHome() {
    setActiveWorkspaceId(null)
    navigate('/')
  }

  function resumeWorkspace(projectId: string) {
    const workspace = projects.find((project) => project.id === projectId)

    if (!workspace) {
      return
    }

    setSelectedProjectId(projectId)
    setActiveWorkspaceId(projectId)
    setDraftProject(workspace.draftProject ?? createDefaultDraftProject(language))
    setFlowStep(workspace.flowStep ?? 0)
    navigate(`/workspace/${projectId}`)
  }

  async function saveWorkspaceSnapshot(workspaceId: string, snapshot: WorkspaceSnapshot) {
    const response = await authFetch(`${apiBaseUrl}/api/projects/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })

    if (!response.ok) {
      throw new Error(t('error.workspaceFailed'))
    }

    const savedWorkspace = (await response.json()) as Project
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === savedWorkspace.id ? savedWorkspace : project,
      ),
    )
    setSelectedProjectId(savedWorkspace.id)
  }

  async function createWorkspaceFromSnapshot(snapshot: WorkspaceSnapshot) {
    const response = await authFetch(`${apiBaseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })

    if (!response.ok) {
      throw new Error(t('error.workspaceFailed'))
    }

    const workspace = (await response.json()) as Project
    setProjects((currentProjects) => [workspace, ...currentProjects])
    setSelectedProjectId(workspace.id)
    setActiveWorkspaceId(workspace.id)
    navigate(`/workspace/${workspace.id}`, { replace: true })

    return workspace
  }

  async function finishCreateFlow(completedProject: CompletedProjectPayload) {
    if (activeWorkspaceId) {
      await saveWorkspaceSnapshot(activeWorkspaceId, {
        ...createWorkspaceSnapshotPayload(draftProject, flowSteps.length - 1),
        status: 'verified',
        currentStep: 'Test',
        workspaceId: completedProject.workspaceId ?? null,
        workspacePath: completedProject.workspacePath ?? null,
        nestJsAppPath: completedProject.nestJsAppPath ?? null,
        metrics: completedProject.metrics,
      })
    }

    setActiveWorkspaceId(null)
    navigate('/')
  }

  async function deleteProject(projectId: string) {
    const response = await authFetch(`${apiBaseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      setError(t('error.projectsFailed'))
      return
    }

    setProjects((currentProjects) => {
      const nextProjects = currentProjects.filter((project) => project.id !== projectId)

      setSelectedProjectId((currentSelectedProjectId) => {
        if (currentSelectedProjectId && currentSelectedProjectId !== projectId) {
          return currentSelectedProjectId
        }

        return nextProjects[0]?.id ?? null
      })

      return nextProjects
    })
  }

  const isAuthenticated = Boolean(token && user)

  const loginPage = (
    <div className="auth-layout">
      <main className="auth-page">
        <aside className="auth-brand">
          <span className="sz-wordmark sz-wordmark--lg">
            Semraz<i>.</i>
          </span>
          <p className="eyebrow">{t('auth.eyebrow')}</p>
          <h1>{t('auth.title')}</h1>
          <p className="auth-copy">{t('auth.copy')}</p>
        </aside>
        <section className="auth-panel">
          <div className="auth-panel-header">
            <LanguageSwitcher />
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              {t('auth.email')}
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              {t('auth.password')}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" disabled={isLoading}>
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
            <div className="auth-form-footer">
              <span>{t('auth.noAccount')}</span>
              <button className="text-button" type="button" onClick={showSignup}>
                {t('auth.signup')}
              </button>
            </div>
          </form>
        </section>
      </main>
      <SiteFooter variant="auth" />
    </div>
  )

  const signupPage = (
    <div className="auth-layout">
      <main className="auth-page">
        <aside className="auth-brand">
          <span className="sz-wordmark sz-wordmark--lg">
            Semraz<i>.</i>
          </span>
          <p className="eyebrow">{t('auth.eyebrow')}</p>
          <h1>{t('auth.title')}</h1>
          <p className="auth-copy">{t('auth.copy')}</p>
        </aside>
        <section className="auth-panel">
          <div className="auth-panel-header">
            <LanguageSwitcher />
          </div>
          <form className="login-form" onSubmit={handleSignup}>
            <h2>{t('auth.signupTitle')}</h2>
            <label>
              {t('auth.name')}
              <input value={signupName} onChange={(event) => setSignupName(event.target.value)} />
            </label>
            <label>
              {t('auth.email')}
              <input value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} />
            </label>
            <label>
              {t('auth.password')}
              <input
                type="password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
              />
              <span className="auth-help-text">{t('auth.passwordGuide')}</span>
            </label>
            <label>
              {t('auth.confirmPassword')}
              <input
                type="password"
                value={signupPasswordConfirm}
                onChange={(event) => setSignupPasswordConfirm(event.target.value)}
              />
            </label>
            <p className="auth-terms-notice">{t('auth.termsNotice')}</p>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" disabled={isLoading}>
              {isLoading ? t('auth.creatingAccount') : t('auth.createAccount')}
            </button>
            <div className="auth-form-footer">
              <span>{t('auth.haveAccount')}</span>
              <button className="text-button" type="button" onClick={showLogin}>
                {t('auth.backToLogin')}
              </button>
            </div>
          </form>
        </section>
      </main>
      <SiteFooter variant="auth" />
    </div>
  )

  const createFlowPage = (
    <CreateFlow
      key={activeWorkspaceId ?? 'new-workspace'}
      workspaceId={activeWorkspaceId}
      initialWorkspace={activeWorkspace}
      draftProject={draftProject}
      flowStep={flowStep}
      authFetch={authFetch}
      token={token}
      onCancel={() => navigate('/')}
      onChangeDraft={setDraftProject}
      onCreateWorkspace={createWorkspaceFromSnapshot}
      onFinish={finishCreateFlow}
      onGoToStep={setFlowStep}
      onPersist={saveWorkspaceSnapshot}
      onNext={() => setFlowStep((currentStep) => Math.min(currentStep + 1, flowSteps.length - 1))}
    />
  )

  const dashboardPage = (
    <Dashboard
      projects={projects}
      selectedProject={selectedProject}
      onDeleteProject={deleteProject}
      onNewBackend={startCreateFlow}
      onResumeProject={resumeWorkspace}
      onSelectProject={setSelectedProjectId}
    />
  )

  return (
    <I18nContext.Provider value={i18nValue}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : loginPage} />
        <Route
          path="/signup"
          element={isAuthenticated ? <Navigate to="/" replace /> : signupPage}
        />
        <Route
          path="/"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <AppShell
                user={user!}
                currentPath="/"
                onGoHome={goToWorkspaceHome}
                onNewApp={startCreateFlow}
                onLogout={handleLogout}
              >
                {dashboardPage}
              </AppShell>
            )
          }
        />
        <Route
          path="/new"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <AppShell
                user={user!}
                currentPath="/new"
                onGoHome={goToWorkspaceHome}
                onNewApp={startCreateFlow}
                onLogout={handleLogout}
              >
                {createFlowPage}
              </AppShell>
            )
          }
        />
        <Route
          path="/workspace/:workspaceId"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <WorkspaceRoute
                user={user!}
                projects={projects}
                onGoHome={goToWorkspaceHome}
                onNewApp={startCreateFlow}
                onLogout={handleLogout}
                onSetup={resumeWorkspace}
              >
                {createFlowPage}
              </WorkspaceRoute>
            )
          }
        />
        {contentPageSlugs.map((slug) => (
          <Route key={slug} path={`/${slug}`} element={<ContentPage slug={slug} />} />
        ))}
        <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
      </Routes>
      {isAuthenticated ? <FeedbackWidget language={language} authFetch={authFetch} /> : null}
    </I18nContext.Provider>
  )
}

function WorkspaceRoute({
  user,
  projects,
  onGoHome,
  onNewApp,
  onLogout,
  onSetup,
  children,
}: {
  user: User
  projects: Project[]
  onGoHome: () => void
  onNewApp: () => void
  onLogout: () => void
  onSetup: (projectId: string) => void
  children: React.ReactNode
}) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const setupDone = useRef(false)

  useEffect(() => {
    if (setupDone.current || !workspaceId) return
    const exists = projects.some((p) => p.id === workspaceId)
    if (exists) {
      setupDone.current = true
      onSetup(workspaceId)
    }
  }, [workspaceId, projects, onSetup])

  if (!workspaceId || !projects.some((p) => p.id === workspaceId)) {
    return <Navigate to="/" replace />
  }

  return (
    <AppShell
      user={user}
      currentPath="/workspace"
      onGoHome={onGoHome}
      onNewApp={onNewApp}
      onLogout={onLogout}
    >
      {children}
    </AppShell>
  )
}

function AppShell({
  user,
  currentPath,
  onGoHome,
  onNewApp,
  onLogout,
  children,
}: {
  user: User
  currentPath: string
  onGoHome: () => void
  onNewApp: () => void
  onLogout: () => void
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const isCreating = currentPath === '/new' || currentPath === '/workspace'
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const closeMobileNav = () => setIsMobileNavOpen(false)

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <button
            className="sidebar-brand-button"
            type="button"
            aria-label={t('topbar.workspaces')}
            onClick={onGoHome}
          >
            <span className="sz-wordmark sz-wordmark--chip">
              Semraz<i>.</i>
            </span>
          </button>
        </div>
        <button
          aria-expanded={isMobileNavOpen}
          aria-label={t('topbar.workspaces')}
          className="sidebar-menu-button"
          type="button"
          onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
        >
          <MenuIcon />
        </button>
        <nav className={`sidebar-nav${isMobileNavOpen ? ' open' : ''}`}>
          <button
            className={isCreating ? 'sidebar-nav-item' : 'sidebar-nav-item active'}
            type="button"
            onClick={() => {
              closeMobileNav()
              onGoHome()
            }}
          >
            <span className="sidebar-nav-dot" />
            {t('topbar.workspaces')}
          </button>
          <button
            className={isCreating ? 'sidebar-nav-item active' : 'sidebar-nav-item'}
            type="button"
            onClick={() => {
              closeMobileNav()
              onNewApp()
            }}
          >
            <span className="sidebar-nav-dot" />
            {t('topbar.newApp')}
          </button>
        </nav>
        <div className="sidebar-foot">
          <LanguageSwitcher />
          <div className="sidebar-user">
            <span className="sidebar-avatar">{user.email.slice(0, 2).toUpperCase()}</span>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user.email}</span>
            </div>
          </div>
          <button
            aria-label={t('topbar.logout')}
            className="sidebar-logout"
            title={t('topbar.logout')}
            type="button"
            onClick={onLogout}
          >
            <LogoutIcon />
            <span className="sr-only">{t('topbar.logout')}</span>
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <h1>{isCreating ? t('topbar.newApp') : t('topbar.workspaces')}</h1>
          </div>
        </header>
        <div className="workspace-body">{children}</div>
        <SiteFooter variant="app" />
      </section>
    </main>
  )
}

type DashboardProps = {
  projects: Project[]
  selectedProject?: Project
  onDeleteProject: (projectId: string) => void
  onNewBackend: () => void
  onResumeProject: (projectId: string) => void
  onSelectProject: (projectId: string) => void
}

function Dashboard({
  projects,
  selectedProject,
  onDeleteProject,
  onNewBackend,
  onResumeProject,
  onSelectProject,
}: DashboardProps) {
  const { t, language } = useI18n()
  const selectedDownloadUrl = selectedProject ? getNestJsDownloadUrl(selectedProject) : null

  function handleDeleteProject() {
    if (!selectedProject || !window.confirm(t('dashboard.confirmDelete'))) {
      return
    }

    onDeleteProject(selectedProject.id)
  }

  if (projects.length === 0) {
    return (
      <section className="dashboard-empty" aria-label={t('dashboard.projectList')}>
        <div className="dashboard-empty-icon" aria-hidden="true">
          <span />
        </div>
        <p className="dashboard-empty-copy">
          {t('dashboard.emptyCreatePrefix')}{' '}
          <button className="dashboard-empty-action" type="button" onClick={onNewBackend}>
            {t('dashboard.emptyCreateAction')}
          </button>
        </p>
      </section>
    )
  }

  return (
    <section className="dashboard-grid">
      <div className="project-list" aria-label={t('dashboard.projectList')}>
        <div className="section-heading">
          <h2>{t('dashboard.projects')}</h2>
          <button type="button" onClick={onNewBackend}>
            {t('dashboard.newBackend')}
          </button>
        </div>
        {projects.map((project) => (
          <article
            key={project.id}
            className={
              project.id === selectedProject?.id ? 'project-card selected' : 'project-card'
            }
          >
            <button
              className="project-card-main"
              type="button"
              onClick={() => onSelectProject(project.id)}
            >
              <span className={`status ${project.status}`}>{t(`status.${project.status}`)}</span>
              <strong>{project.name}</strong>
              <p>{project.description}</p>
            </button>
          </article>
        ))}
      </div>

      {selectedProject ? (
        <div className="workspace-preview">
          <div className="workspace-preview-heading">
            <div className="workspace-preview-title">
              <p className="eyebrow">
                {t('dashboard.target', {
                  framework: selectedProject.framework,
                })}
              </p>
              <div className="workspace-title-row">
                <h2>{selectedProject.name}</h2>
                <span className={`status ${selectedProject.status}`}>
                  {t(`status.${selectedProject.status}`)}
                </span>
              </div>
            </div>
            <div className="workspace-preview-actions">
              {selectedProject.status !== 'verified' ? (
                <button
                  className="preview-resume"
                  type="button"
                  onClick={() => onResumeProject(selectedProject.id)}
                >
                  {t('dashboard.resumeWorkspace')}
                </button>
              ) : null}
              {selectedDownloadUrl && selectedProject.status === 'verified' ? (
                <a className="preview-download" href={selectedDownloadUrl} download>
                  {t('dashboard.downloadNest')}
                </a>
              ) : null}
              <button className="project-delete-button" type="button" onClick={handleDeleteProject}>
                {t('dashboard.deleteProject')}
              </button>
            </div>
          </div>

          <div className="metrics">
            <div>
              <span>{selectedProject.metrics.entities}</span>
              <strong>{t('dashboard.entities')}</strong>
            </div>
            <div>
              <span>{selectedProject.metrics.operations}</span>
              <strong>{t('dashboard.operations')}</strong>
            </div>
            <div>
              <span>{selectedProject.metrics.tests}</span>
              <strong>{t('dashboard.testsAndCoverage')}</strong>
              <small>
                {selectedProject.metrics.coverage
                  ? t('dashboard.coverageValue', {
                      coverage: selectedProject.metrics.coverage,
                    })
                  : t('dashboard.coverageUnknown')}
              </small>
            </div>
          </div>

          <div className="spec-panel">
            <h3>{t('dashboard.skillsDraft')}</h3>
            <pre>{buildProjectSummary(selectedProject, language)}</pre>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function buildProjectSummary(project: Project, lang: 'en' | 'ko'): string {
  const draft = project.draftProject
  const isKo = lang === 'ko'

  const name = project.name
  const description = project.description
  const framework = project.framework
  const database = project.database
  const purpose = draft?.planning?.purpose
  const constraints = draft?.planning?.constraints

  const lines: string[] = [`# ${name}`]

  if (description) {
    lines.push('', description)
  }

  lines.push('', `## ${isKo ? '기술 스택' : 'Tech Stack'}`)
  lines.push(`- Framework: ${framework}`)
  lines.push(`- Database: ${database}`)

  if (purpose) {
    lines.push('', `## ${isKo ? '목적' : 'Purpose'}`)
    lines.push(purpose)
  }

  if (constraints) {
    lines.push('', `## ${isKo ? '제약 조건' : 'Constraints'}`)
    lines.push(constraints)
  }

  return lines.join('\n')
}

function getNestJsDownloadUrl(project: Project) {
  return project.workspaceId
    ? `${apiBaseUrl}/api/generate/workspace/${project.workspaceId}/nestjs/download`
    : null
}

function formatCoveragePercent(coverageSummary?: string) {
  const coveragePercent = coverageSummary?.match(/All files\s+\|\s*([\d.]+)/)?.[1]

  return coveragePercent ? `${coveragePercent}%` : undefined
}

function createWorkspaceSnapshotPayload(
  draftProject: DraftProject,
  flowStep: number,
  state?: {
    entities?: ErdEntity[]
    relations?: ErdRelation[]
    operations?: BackendOperation[]
    generatedWorkspace?: GenerateWorkspace | null
    generatedNestResult?: NestJsAgentResult | null
    testAgentResult?: TestAgentResult | null
  },
): WorkspaceSnapshot {
  const enabledOperations = state?.operations?.filter((operation) => operation.enabled) ?? []
  const currentStep = flowSteps[flowStep] ?? 'flow.project'
  const generatedWorkspace = state?.generatedWorkspace
  const generatedNestResult = state?.generatedNestResult
  const testAgentResult = state?.testAgentResult

  return {
    name: draftProject.name,
    description: draftProject.description,
    framework: draftProject.framework,
    database: draftProject.database,
    status: testAgentResult?.verified
      ? 'verified'
      : generatedNestResult?.build?.success === false
        ? 'compile_failed'
        : 'planning',
    currentStep: currentStep.replace('flow.', ''),
    flowStep,
    workspaceId: generatedWorkspace?.workspaceId ?? generatedNestResult?.workspaceId ?? null,
    workspacePath: generatedWorkspace?.workspacePath ?? null,
    nestJsAppPath: generatedNestResult?.appPath ?? null,
    metrics: {
      entities: state?.entities?.length ?? 0,
      operations: enabledOperations.length,
      tests: testAgentResult?.generatedFiles.length ?? 0,
      coverage: formatCoveragePercent(testAgentResult?.test.coverageSummary),
    },
    draftProject,
    entities: state?.entities,
    relations: state?.relations,
    operations: state?.operations,
    generatedWorkspace,
    generatedNestResult,
    testAgentResult,
  }
}

type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type CreateFlowProps = {
  workspaceId: string | null
  initialWorkspace?: Project
  draftProject: DraftProject
  flowStep: number
  authFetch: AuthFetch
  token: string | null
  onCancel: () => void
  onChangeDraft: (draftProject: DraftProject) => void
  onCreateWorkspace: (snapshot: WorkspaceSnapshot) => Promise<Project>
  onFinish: (project: CompletedProjectPayload) => void | Promise<void>
  onGoToStep: (step: number) => void
  onNext: () => void
  onPersist: (workspaceId: string, snapshot: WorkspaceSnapshot) => Promise<void>
}

function CreateFlow({
  workspaceId,
  initialWorkspace,
  draftProject,
  flowStep,
  authFetch,
  token,
  onCancel,
  onChangeDraft,
  onCreateWorkspace,
  onFinish,
  onGoToStep,
  onNext,
  onPersist,
}: CreateFlowProps) {
  const { language, t } = useI18n()
  const isLastStep = flowStep === flowSteps.length - 1
  const persistRef = useRef(onPersist)
  const [entities, setEntities] = useState<ErdEntity[]>(
    initialWorkspace?.entities ?? initialEntities,
  )
  const [relations, setRelations] = useState<ErdRelation[]>(
    initialWorkspace?.relations ?? initialRelations,
  )
  const [operations, setOperations] = useState<BackendOperation[]>(
    () =>
      initialWorkspace?.operations ??
      createDefaultOperations(initialWorkspace?.entities ?? initialEntities, t),
  )
  const [isNestJsAppReady, setIsNestJsAppReady] = useState(
    initialWorkspace?.generatedNestResult?.build?.success === true,
  )
  const [isNestJsTestReady, setIsNestJsTestReady] = useState(
    initialWorkspace?.testAgentResult?.verified === true,
  )
  const [generatedWorkspace, setGeneratedWorkspace] = useState<GenerateWorkspace | null>(
    initialWorkspace?.generatedWorkspace ?? null,
  )
  const [generatedNestResult, setGeneratedNestResult] = useState<NestJsAgentResult | null>(
    initialWorkspace?.generatedNestResult ?? null,
  )
  const [testAgentResult, setTestAgentResult] = useState<TestAgentResult | null>(
    initialWorkspace?.testAgentResult ?? null,
  )
  const [isAiWizardOpen, setIsAiWizardOpen] = useState(false)
  const [isAiApplying, setIsAiApplying] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingStepBack, setPendingStepBack] = useState<number | null>(null)
  const canUseAiWizard = flowStep < 4

  function isStepComplete(step: number): boolean {
    switch (step) {
      case 0:
        return draftProject.name.trim() !== '' && draftProject.description.trim() !== ''
      case 1:
        return (
          draftProject.planning.purpose.trim() !== '' &&
          draftProject.planning.constraints.trim() !== ''
        )
      case 2:
        return entities.length > 0
      case 3:
        return operations.some((op) => op.enabled)
      case 4:
        return isNestJsAppReady
      case 5:
        return isNestJsTestReady
      default:
        return true
    }
  }

  const isCurrentStepComplete = isStepComplete(flowStep)

  function requestGoBack(targetStep: number) {
    if (targetStep < flowStep) {
      setPendingStepBack(targetStep)
    }
  }

  function confirmGoBack() {
    const targetStep = pendingStepBack

    if (targetStep !== null) {
      const nextDraftProject =
        targetStep === 0
          ? {
              ...draftProject,
              planning: {
                purpose: '',
                constraints: '',
              },
            }
          : draftProject
      const nextEntities = targetStep <= 1 ? [] : entities
      const nextRelations = targetStep <= 1 ? [] : relations
      const nextOperations = targetStep <= 2 ? [] : operations
      const nextGeneratedWorkspace = targetStep <= 3 ? null : generatedWorkspace
      const nextGeneratedNestResult = targetStep <= 3 ? null : generatedNestResult
      const nextTestAgentResult = targetStep <= 4 ? null : testAgentResult

      if (nextDraftProject !== draftProject) {
        onChangeDraft(nextDraftProject)
      }
      if (targetStep <= 1) {
        setEntities([])
        setRelations([])
      }
      if (targetStep <= 2) {
        setOperations([])
      }
      if (targetStep <= 3) {
        setGeneratedWorkspace(null)
        setGeneratedNestResult(null)
        setIsNestJsAppReady(false)
      }
      if (targetStep <= 4) {
        setTestAgentResult(null)
        setIsNestJsTestReady(false)
      }
      setAiError(null)
      setIsAiWizardOpen(false)

      if (workspaceId) {
        void onPersist(workspaceId, {
          ...createWorkspaceSnapshotPayload(nextDraftProject, targetStep, {
            entities: nextEntities,
            relations: nextRelations,
            operations: nextOperations,
            generatedWorkspace: nextGeneratedWorkspace,
            generatedNestResult: nextGeneratedNestResult,
            testAgentResult: nextTestAgentResult,
          }),
        })
      }
      onGoToStep(targetStep)
      setPendingStepBack(null)
    }
  }

  useEffect(() => {
    const hasLegacyMockErd =
      entities.length === 3 &&
      ['customer', 'order', 'payment'].every((entityId) =>
        entities.some((entity) => entity.id === entityId),
      )

    if (hasLegacyMockErd) {
      setEntities([])
      setRelations([])
      setOperations([])
    }
  }, [entities])

  useEffect(() => {
    persistRef.current = onPersist
  }, [onPersist])

  useEffect(() => {
    if (!workspaceId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void persistRef.current(workspaceId, {
        ...createWorkspaceSnapshotPayload(draftProject, flowStep, {
          entities,
          relations,
          operations,
          generatedWorkspace,
          generatedNestResult,
          testAgentResult,
        }),
      })
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [
    draftProject,
    entities,
    flowStep,
    generatedNestResult,
    generatedWorkspace,
    operations,
    relations,
    testAgentResult,
    workspaceId,
  ])

  // Track the previous values of the inputs that invalidate generated output.
  // Comparing by reference (rather than a mount flag) is safe under StrictMode's
  // double-invoked effects: on mount and on the StrictMode replay the reference is
  // unchanged, so we only reset when the user actually edits these inputs.
  const prevEntitiesRef = useRef(entities)
  const prevDraftProjectRef = useRef(draftProject)
  const prevRelationsRef = useRef(relations)
  const prevOperationsRef = useRef(operations)

  useEffect(() => {
    if (prevEntitiesRef.current === entities) {
      return
    }
    prevEntitiesRef.current = entities
    setIsNestJsAppReady(false)
    setIsNestJsTestReady(false)
    setGeneratedNestResult(null)
    setTestAgentResult(null)
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
                responseFieldIds: (
                  operation.responseFieldIds ?? entity.fields.map((field) => field.id)
                ).filter((fieldId) => entity.fields.some((field) => field.id === fieldId)),
                requestCustomFields: operation.requestCustomFields ?? [],
                responseCustomFields: operation.responseCustomFields ?? [],
              }
            : operation
        })
      const operationIds = new Set(activeOperations.map((operation) => operation.id))
      const missingDefaults = createDefaultOperations(entities, t).filter(
        (operation) => !operationIds.has(operation.id),
      )

      return [...activeOperations, ...missingDefaults]
    })
  }, [entities, t])

  useEffect(() => {
    if (
      prevDraftProjectRef.current === draftProject &&
      prevRelationsRef.current === relations &&
      prevOperationsRef.current === operations
    ) {
      return
    }
    prevDraftProjectRef.current = draftProject
    prevRelationsRef.current = relations
    prevOperationsRef.current = operations
    setIsNestJsAppReady(false)
    setIsNestJsTestReady(false)
    setGeneratedWorkspace(null)
    setGeneratedNestResult(null)
    setTestAgentResult(null)
  }, [draftProject, relations, operations])

  useEffect(() => {
    if (!canUseAiWizard) {
      setIsAiWizardOpen(false)
    }
  }, [canUseAiWizard])

  async function applyAiDraft() {
    const step =
      flowStep === 0
        ? 'project'
        : flowStep === 1
          ? 'planning'
          : flowStep === 2
            ? 'erd'
            : 'operations'

    setIsAiApplying(true)
    setAiError(null)

    const abortController = new AbortController()
    const timeoutId = window.setTimeout(() => abortController.abort(), aiWizardTimeoutMs)

    try {
      const response = await authFetch(`${apiBaseUrl}/api/ai/wizard`, {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          step === 'project'
            ? { step, language }
            : step === 'planning'
              ? { step, language, project: draftProject }
              : step === 'erd'
                ? { step, language, project: draftProject }
                : {
                    step,
                    language,
                    project: draftProject,
                    entities,
                    relations,
                  },
        ),
      })

      if (!response.ok) {
        throw new Error(t('ai.failed'))
      }

      const result = (await response.json()) as {
        project?: Partial<DraftProject>
        planning?: Partial<DraftProject['planning']>
        entities?: ErdEntity[]
        relations?: ErdRelation[]
        operations?: BackendOperation[]
      }

      if (step === 'project' && result.project) {
        onChangeDraft({
          ...draftProject,
          name: result.project.name ?? draftProject.name,
          description: result.project.description ?? draftProject.description,
          database: result.project.database ?? draftProject.database,
        })
      }

      if (step === 'planning' && result.planning) {
        onChangeDraft({
          ...draftProject,
          planning: {
            purpose: result.planning.purpose ?? draftProject.planning.purpose,
            constraints: result.planning.constraints ?? draftProject.planning.constraints,
          },
        })
      }

      if (step === 'erd' && result.entities?.length) {
        const nextErd = normalizeAiErdDraft(result.entities, result.relations ?? [])
        setEntities(nextErd.entities)
        setRelations(nextErd.relations)
        setOperations(createDefaultOperations(nextErd.entities, t))
      }

      if (step === 'operations' && result.operations?.length) {
        setOperations(normalizeAiOperations(result.operations, entities))
      }
    } catch (error) {
      setAiError(
        error instanceof Error && error.name === 'AbortError'
          ? t('ai.timeout')
          : error instanceof Error
            ? error.message
            : t('ai.failed'),
      )
    } finally {
      window.clearTimeout(timeoutId)
      setIsAiApplying(false)
    }
  }

  function aiWizardTitle() {
    if (flowStep === 0) return t('ai.projectTitle')
    if (flowStep === 1) return t('ai.planningTitle')
    if (flowStep === 2) return t('ai.erdTitle')
    if (flowStep === 3) return t('ai.operationsTitle')
    return t('ai.unavailable')
  }

  function aiWizardCopy() {
    if (flowStep === 0) return t('ai.projectCopy')
    if (flowStep === 1) return t('ai.planningCopy')
    if (flowStep === 2) return t('ai.erdCopy')
    if (flowStep === 3) return t('ai.operationsCopy')
    return t('ai.unavailable')
  }

  function handleWorkspaceChange(workspace: GenerateWorkspace | null) {
    setGeneratedWorkspace(workspace)
    setGeneratedNestResult(null)
    setTestAgentResult(null)
    setIsNestJsTestReady(false)
  }

  function handleNestJsResultChange(result: NestJsAgentResult | null) {
    setGeneratedNestResult(result)
    setTestAgentResult(null)
    setIsNestJsTestReady(false)
  }

  function finishProject() {
    onFinish({
      name: draftProject.name,
      description: draftProject.description,
      framework: draftProject.framework,
      database: draftProject.database,
      workspaceId: generatedWorkspace?.workspaceId ?? generatedNestResult?.workspaceId,
      workspacePath: generatedWorkspace?.workspacePath,
      nestJsAppPath: generatedNestResult?.appPath,
      metrics: {
        entities: entities.length,
        operations: operations.filter((operation) => operation.enabled).length,
        tests: testAgentResult?.generatedFiles.length ?? 0,
        coverage: formatCoveragePercent(testAgentResult?.test.coverageSummary),
      },
    })
  }

  async function handleNext() {
    if (workspaceId || flowStep !== 0) {
      onNext()
      return
    }

    setIsSavingWorkspace(true)
    setSaveError(null)

    try {
      const nextStep = 1
      await onCreateWorkspace(
        createWorkspaceSnapshotPayload(draftProject, nextStep, {
          entities,
          relations,
          operations,
          generatedWorkspace,
          generatedNestResult,
          testAgentResult,
        }),
      )
      onGoToStep(nextStep)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('error.workspaceFailed'))
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  return (
    <section className="flow-shell">
      <div className="flow-header">
        <div>
          <h2>{t(flowSteps[flowStep])}</h2>
        </div>
        <div className="flow-header-actions">
          {canUseAiWizard ? (
            <button
              className="wizard-button"
              aria-label={isAiWizardOpen ? t('ai.close') : t('ai.open')}
              title={isAiWizardOpen ? t('ai.close') : t('ai.open')}
              type="button"
              onClick={() => setIsAiWizardOpen((isOpen) => !isOpen)}
            >
              <MagicWandIcon />
              <span>{t('ai.tryWizard')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flow-progress" aria-label={t('flow.progress')}>
        {flowSteps.map((step, index) => (
          <button
            key={step}
            className={index === flowStep ? 'active' : index < flowStep ? 'done' : ''}
            disabled={index >= flowStep}
            type="button"
            onClick={() => requestGoBack(index)}
          >
            <span>{index + 1}</span>
            {t(step)}
          </button>
        ))}
      </div>

      {isAiWizardOpen && canUseAiWizard ? (
        <section className="ai-wizard-panel">
          <div>
            <p className="eyebrow">{t('ai.open')}</p>
            <h3>{aiWizardTitle()}</h3>
            <p>{aiWizardCopy()}</p>
          </div>
          <div className="ai-wizard-actions">
            {aiError ? <p className="form-error">{aiError}</p> : null}
            <button type="button" disabled={isAiApplying} onClick={applyAiDraft}>
              {isAiApplying ? t('ai.applying') : t('ai.apply')}
            </button>
          </div>
        </section>
      ) : null}

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
            initialAgentResult={generatedNestResult}
            initialWorkspace={generatedWorkspace}
            relations={relations}
            operations={operations}
            authFetch={authFetch}
            token={token}
            onNestJsAppReadyChange={setIsNestJsAppReady}
            onNestJsResultChange={handleNestJsResultChange}
            onWorkspaceChange={handleWorkspaceChange}
          />
        ) : null}
        {flowStep === 5 ? (
          <TestStep
            draftProject={draftProject}
            initialTestResult={testAgentResult}
            nestResult={generatedNestResult}
            token={token}
            onTestReadyChange={setIsNestJsTestReady}
            onTestResultChange={setTestAgentResult}
            workspace={generatedWorkspace}
          />
        ) : null}
      </div>

      <footer className="flow-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={flowStep === 0 ? onCancel : () => requestGoBack(flowStep - 1)}
        >
          {flowStep === 0 ? t('flow.cancel') : t('flow.back')}
        </button>
        <div className="flow-action-primary">
          {saveError ? <p className="form-error">{saveError}</p> : null}
          <button
            type="button"
            disabled={isSavingWorkspace || !isCurrentStepComplete}
            onClick={isLastStep ? finishProject : handleNext}
          >
            {isSavingWorkspace
              ? t('generate.creating')
              : isLastStep
                ? t('flow.finish')
                : t('flow.next')}
          </button>
        </div>
      </footer>

      {pendingStepBack !== null ? (
        <div className="modal-overlay" onClick={() => setPendingStepBack(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{t('flow.warnLossTitle')}</h3>
            <p>{t('flow.warnLossBody')}</p>
            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setPendingStepBack(null)}
              >
                {t('flow.warnLossCancel')}
              </button>
              <button type="button" onClick={confirmGoBack}>
                {t('flow.warnLossConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type ProjectSetupProps = {
  draftProject: DraftProject
  onChangeDraft: (draftProject: DraftProject) => void
}

function ProjectSetup({ draftProject, onChangeDraft }: ProjectSetupProps) {
  const { t } = useI18n()

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>{t('project.basics')}</h3>
        <div className="field-grid">
          <label>
            {t('project.name')}
            <input
              placeholder={t('project.namePlaceholder')}
              value={draftProject.name}
              onChange={(event) => onChangeDraft({ ...draftProject, name: event.target.value })}
            />
          </label>
          <label>
            {t('project.database')}
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
            {t('project.description')}
            <textarea
              placeholder={t('project.descriptionPlaceholder')}
              value={draftProject.description}
              onChange={(event) =>
                onChangeDraft({
                  ...draftProject,
                  description: event.target.value,
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="flow-panel">
        <h3>{t('project.framework')}</h3>
        <div className="framework-grid">
          <button className="framework-card selected" type="button">
            <span>TypeScript</span>
            <strong>NestJS</strong>
            <p>{t('project.nestDescription')}</p>
          </button>
          <button className="framework-card disabled" type="button" disabled>
            <span>Go</span>
            <strong>Spine</strong>
            <p>{t('project.goDescription')}</p>
            <em>{t('project.comingSoon')}</em>
          </button>
          <button className="framework-card disabled" type="button" disabled>
            <span>Python</span>
            <strong>FastAPI</strong>
            <p>{t('project.pythonDescription')}</p>
            <em>{t('project.comingSoon')}</em>
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
  const { t } = useI18n()

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
          <h3>{t('planning.inputs')}</h3>
        </div>
        <label>
          {t('planning.purpose')}
          <textarea
            placeholder={t('planning.purposePlaceholder')}
            value={draftProject.planning.purpose}
            onChange={(event) => updatePlanning('purpose', event.target.value)}
          />
        </label>
        <label>
          {t('planning.constraints')}
          <textarea
            placeholder={t('planning.constraintsPlaceholder')}
            value={draftProject.planning.constraints}
            onChange={(event) => updatePlanning('constraints', event.target.value)}
          />
        </label>
      </section>

      <section className="flow-panel editor-panel">
        <div className="section-heading">
          <h3>{t('planning.preview')}</h3>
          <span className="autosave-pill">{t('planning.autosaved')}</span>
        </div>
        <pre>{buildSkillsMarkdown(draftProject, t)}</pre>
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
  requirements: string
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

type TestAgentResult = {
  target: string
  appDir: string
  projectDir: string
  generatedFiles: Array<{
    path: string
    content: string
  }>
  changedFiles: string[]
  test: {
    success: boolean
    commands: Array<{
      command: string
      success: boolean
      exitCode: number | null
      stdout?: string
      stderr?: string
    }>
    errorSummary?: string
    coverageSummary?: string
    testsPassed?: number
    testsFailed?: number
    testsTotal?: number
  }
  attempts: number
  testRuns?: number
  verified: boolean
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
const erdWorldWidth = 20000
const erdWorldHeight = 12000
const erdGridSize = 28
const erdMinZoom = 0.4
const erdMaxZoom = 2.2
const erdEntityWidth = 320
const erdEntityAnchorX = erdEntityWidth / 2
const erdEntityAnchorY = 96

function toForeignKeyName(entityName: string) {
  return `${entityName
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase())
    .replace(/^\w/, (letter) => letter.toLowerCase())}Id`
}

const initialEntities: ErdEntity[] = []

const initialRelations: ErdRelation[] = []

function toRouteSegment(entityName: string) {
  return entityName
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function createDefaultOperations(
  entities: ErdEntity[],
  t: (key: TranslationKey, values?: TranslationValues) => string,
) {
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
        label: t('ops.defaultCreate'),
        method: 'POST' as const,
        path: `/${route}`,
        enabled: true,
        payloadFieldIds: writableFields,
        requestFieldIds: writableFields,
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: t('ops.defaultCreateDescription', { entity: entity.name }),
        requirements: '',
      },
      {
        id: `${entity.id}_list`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: t('ops.defaultList'),
        method: 'GET' as const,
        path: `/${route}`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: t('ops.defaultListDescription', { entity: entity.name }),
        requirements: '',
      },
      {
        id: `${entity.id}_detail`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: t('ops.defaultDetail'),
        method: 'GET' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: t('ops.defaultDetailDescription', { entity: entity.name }),
        requirements: '',
      },
      {
        id: `${entity.id}_update`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: t('ops.defaultUpdate'),
        method: 'PATCH' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: writableFields,
        requestFieldIds: writableFields,
        responseFieldIds: entity.fields.map((field) => field.id),
        requestCustomFields: [],
        responseCustomFields: [],
        description: t('ops.defaultUpdateDescription', { entity: entity.name }),
        requirements: '',
      },
      {
        id: `${entity.id}_delete`,
        entityId: entity.id,
        kind: 'crud' as const,
        label: t('ops.defaultDelete'),
        method: 'DELETE' as const,
        path: `/${route}/:id`,
        enabled: true,
        payloadFieldIds: [],
        requestFieldIds: [],
        responseFieldIds: [],
        requestCustomFields: [],
        responseCustomFields: [],
        description: t('ops.defaultDeleteDescription', { entity: entity.name }),
        requirements: '',
      },
    ]
  })
}

function estimateEntityHeight(fieldCount: number) {
  const headerHeight = 40
  const fieldRowHeight = 36
  const addButtonHeight = 40
  const padding = 24
  const gap = 10
  return headerHeight + Math.max(fieldCount, 1) * fieldRowHeight + addButtonHeight + padding + gap
}

function normalizeAiEntities(aiEntities: ErdEntity[]): ErdEntity[] {
  const cols = Math.min(aiEntities.length, 4)
  const colGap = 60
  const rowGap = 60

  const parsed = aiEntities.map((entity, entityIndex) => {
    const entityId = normalizeId(entity.id || entity.name || `entity_${entityIndex + 1}`)
    const fields: ErdField[] = (entity.fields?.length ? entity.fields : []).map(
      (field, fieldIndex) => {
        const fieldName = field.name || (fieldIndex === 0 ? 'id' : `field${fieldIndex + 1}`)

        return {
          id: normalizeId(field.id || `${entityId}_${fieldName}`),
          name: fieldName,
          type: fieldTypes.includes(field.type) ? field.type : 'string',
          isPrimaryKey: Boolean(field.isPrimaryKey || fieldName === 'id'),
          isNotNull: Boolean(field.isNotNull || field.isPrimaryKey || fieldName === 'id'),
          ...(field.isForeignKey ? { isForeignKey: true } : {}),
          referencesEntityId: field.referencesEntityId,
        }
      },
    )

    if (!fields.some((field) => field.isPrimaryKey)) {
      fields.unshift({
        id: `${entityId}_id`,
        name: 'id',
        type: 'uuid',
        isPrimaryKey: true,
        isNotNull: true,
      })
    }

    return {
      entityId,
      name: entity.name || toPascalLabel(entityId),
      fields,
      origX: entity.x,
      origY: entity.y,
    }
  })

  const rowHeights: number[] = []
  for (let i = 0; i < parsed.length; i += cols) {
    const rowEntities = parsed.slice(i, i + cols)
    const maxHeight = Math.max(...rowEntities.map((e) => estimateEntityHeight(e.fields.length)))
    rowHeights.push(maxHeight)
  }

  return parsed.map((entity, entityIndex) => {
    const col = entityIndex % cols
    const row = Math.floor(entityIndex / cols)
    const hasValidPos = Number.isFinite(entity.origX) && Number.isFinite(entity.origY)
    const x = hasValidPos ? entity.origX! : 160 + col * (erdEntityWidth + colGap)
    const y = hasValidPos
      ? entity.origY!
      : 180 + rowHeights.slice(0, row).reduce((sum, h) => sum + h + rowGap, 0)

    return {
      id: entity.entityId,
      name: entity.name,
      x,
      y,
      fields: entity.fields,
    }
  })
}

function normalizeAiErdDraft(aiEntities: ErdEntity[], aiRelations: ErdRelation[]) {
  const entities = normalizeAiEntities(aiEntities)
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const entityLookup = new Map<string, string>()

  entities.forEach((entity) => {
    entityLookup.set(entity.id.toLowerCase(), entity.id)
    entityLookup.set(normalizeId(entity.name).toLowerCase(), entity.id)
    entityLookup.set(entity.name.toLowerCase(), entity.id)
  })

  function resolveEntityId(value?: string) {
    if (!value) {
      return ''
    }

    return entityLookup.get(String(value).toLowerCase()) ?? ''
  }

  const sanitizedEntities: ErdEntity[] = entities.map((entity) => ({
    ...entity,
    fields: entity.fields.map((field): ErdField => {
      const referencesEntityId = resolveEntityId(field.referencesEntityId)

      if (!field.isForeignKey || !referencesEntityId || referencesEntityId === entity.id) {
        const { isForeignKey, referencesEntityId: _referencesEntityId, ...plainField } = field
        return plainField
      }

      return {
        ...field,
        isForeignKey: true,
        referencesEntityId,
      }
    }),
  }))

  const relationKeys = new Set<string>()
  const addRelation = (
    validRelations: ErdRelation[],
    relation: Partial<ErdRelation>,
    index: number,
  ) => {
    const sourceId = resolveEntityId(relation.sourceId)
    const targetId = resolveEntityId(relation.targetId)

    if (!sourceId || !targetId || sourceId === targetId) {
      return validRelations
    }

    const sourceCardinality: Cardinality = relation.sourceCardinality === 'N' ? 'N' : '1'
    const targetCardinality: Cardinality = relation.targetCardinality === '1' ? '1' : 'N'
    const relationKey = `${sourceId}:${targetId}:${sourceCardinality}:${targetCardinality}`

    if (relationKeys.has(relationKey)) {
      return validRelations
    }

    relationKeys.add(relationKey)

    const requestedOwnerId = resolveEntityId(relation.foreignKeyOwnerId)
    const inferredOwnerId =
      sourceCardinality === 'N' && targetCardinality === '1'
        ? sourceId
        : sourceCardinality === '1' && targetCardinality === 'N'
          ? targetId
          : targetId
    const foreignKeyOwnerId =
      requestedOwnerId === sourceId || requestedOwnerId === targetId
        ? requestedOwnerId
        : inferredOwnerId
    const referencedEntityId = foreignKeyOwnerId === sourceId ? targetId : sourceId
    const referencedEntity = entityById.get(referencedEntityId)
    const ownerEntityIndex = sanitizedEntities.findIndex(
      (entity) => entity.id === foreignKeyOwnerId,
    )

    if (!referencedEntity || ownerEntityIndex < 0) {
      return validRelations
    }

    const requestedFieldName = sanitizeFieldName(relation.foreignKeyFieldName)
    const foreignKeyFieldName = requestedFieldName || toForeignKeyName(referencedEntity.name)
    const ownerEntity = sanitizedEntities[ownerEntityIndex]
    const existingField = ownerEntity.fields.find((field) => field.name === foreignKeyFieldName)

    sanitizedEntities[ownerEntityIndex] = {
      ...ownerEntity,
      fields: existingField
        ? ownerEntity.fields.map((field) =>
            field.name === foreignKeyFieldName
              ? {
                  ...field,
                  type: 'uuid',
                  isPrimaryKey: false,
                  isNotNull: true,
                  isForeignKey: true,
                  referencesEntityId: referencedEntityId,
                }
              : field,
          )
        : [
            ...ownerEntity.fields,
            {
              id: normalizeId(`${foreignKeyOwnerId}_${foreignKeyFieldName}`),
              name: foreignKeyFieldName,
              type: 'uuid',
              isPrimaryKey: false,
              isNotNull: true,
              isForeignKey: true,
              referencesEntityId: referencedEntityId,
            },
          ],
    }

    validRelations.push({
      id: relation.id || `rel_${sourceId}_${targetId}_${index}`,
      sourceId,
      targetId,
      sourceCardinality,
      targetCardinality,
      direction: relation.direction === 'one-way' ? 'one-way' : 'two-way',
      foreignKeyOwnerId,
      foreignKeyFieldName,
    })

    return validRelations
  }

  const relations = aiRelations.reduce<ErdRelation[]>(addRelation, [])

  sanitizedEntities.forEach((entity) => {
    entity.fields.forEach((field, fieldIndex) => {
      const referencedEntityId =
        resolveEntityId(field.referencesEntityId) ||
        inferReferencedEntityIdFromField(field.name, entity.id)

      if (!referencedEntityId || referencedEntityId === entity.id) {
        return
      }

      addRelation(
        relations,
        {
          id: `rel_${referencedEntityId}_${entity.id}_inferred_${fieldIndex}`,
          sourceId: referencedEntityId,
          targetId: entity.id,
          sourceCardinality: '1',
          targetCardinality: 'N',
          direction: 'two-way',
          foreignKeyOwnerId: entity.id,
          foreignKeyFieldName: field.name,
        },
        aiRelations.length + fieldIndex,
      )
    })
  })

  const relationForeignKeys = new Set(
    relations.map((relation) => `${relation.foreignKeyOwnerId}:${relation.foreignKeyFieldName}`),
  )

  return {
    entities: sanitizedEntities.map((entity) => ({
      ...entity,
      fields: entity.fields.map((field): ErdField => {
        if (!field.isForeignKey || relationForeignKeys.has(`${entity.id}:${field.name}`)) {
          return field
        }

        const { isForeignKey, referencesEntityId: _referencesEntityId, ...plainField } = field
        return plainField
      }),
    })),
    relations,
  }

  function inferReferencedEntityIdFromField(fieldName: string, ownerEntityId: string) {
    const normalizedField = normalizeId(fieldName)

    if (!normalizedField.endsWith('_id') && !normalizedField.endsWith('id')) {
      return ''
    }

    const baseName = normalizedField.replace(/_?id$/, '')

    if (!baseName || baseName === ownerEntityId) {
      return ''
    }

    return entityLookup.get(baseName) ?? ''
  }
}

function normalizeAiOperations(aiOperations: BackendOperation[], entities: ErdEntity[]) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))

  return aiOperations
    .filter((operation) => entityById.has(operation.entityId))
    .map((operation, index) => {
      const entity = entityById.get(operation.entityId)
      const fieldIds = new Set(entity?.fields.map((field) => field.id) ?? [])
      const writableFieldIds =
        entity?.fields.filter((field) => !field.isPrimaryKey).map((field) => field.id) ?? []
      const responseFieldIds = entity?.fields.map((field) => field.id) ?? []

      return {
        id: operation.id || `${operation.entityId}_ai_${index}`,
        entityId: operation.entityId,
        kind: (operation.kind === 'custom' ? 'custom' : 'crud') as OperationKind,
        label: operation.label || `Operation ${index + 1}`,
        method: httpMethods.includes(operation.method) ? operation.method : 'GET',
        path: operation.path || `/${toRouteSegment(entity?.name ?? operation.entityId)}`,
        enabled: operation.enabled !== false,
        payloadFieldIds: (operation.payloadFieldIds ?? writableFieldIds).filter((fieldId) =>
          fieldIds.has(fieldId),
        ),
        requestFieldIds: (
          operation.requestFieldIds ??
          operation.payloadFieldIds ??
          writableFieldIds
        ).filter((fieldId) => fieldIds.has(fieldId)),
        responseFieldIds: (operation.responseFieldIds ?? responseFieldIds).filter((fieldId) =>
          fieldIds.has(fieldId),
        ),
        requestCustomFields: normalizeCustomFields(operation.requestCustomFields ?? []),
        responseCustomFields: normalizeCustomFields(operation.responseCustomFields ?? []),
        description: operation.description || '',
        requirements: operation.requirements || '',
      }
    })
}

function normalizeCustomFields(fields: OperationCustomField[]) {
  return fields
    .filter((field) => field.name?.trim())
    .map((field, index) => ({
      id: field.id || `custom_${index}_${normalizeId(field.name)}`,
      name: field.name.trim(),
      type: field.type?.trim() || 'string',
    }))
}

function sanitizeFieldName(value?: string) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '')

  if (!sanitized || /^\d/.test(sanitized)) {
    return ''
  }

  return sanitized
}

function normalizeId(value: string) {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function toPascalLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')
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
  const { t } = useI18n()
  const canvasRef = useRef<HTMLElement | null>(null)
  const dragStateRef = useRef<{
    entityId: string
    offsetX: number
    offsetY: number
  } | null>(null)
  const panStateRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
    moved: boolean
  } | null>(null)
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [canvasZoom, setCanvasZoom] = useState(1)
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

  function setEntities(
    nextEntities: ErdEntity[] | ((currentEntities: ErdEntity[]) => ErdEntity[]),
  ) {
    onChangeEntities(typeof nextEntities === 'function' ? nextEntities(entities) : nextEntities)
  }

  function setRelations(
    nextRelations: ErdRelation[] | ((currentRelations: ErdRelation[]) => ErdRelation[]),
  ) {
    onChangeRelations(
      typeof nextRelations === 'function' ? nextRelations(relations) : nextRelations,
    )
  }

  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId)
  const availableTargets = entities.filter((entity) => entity.id !== selectedEntityId)
  const totalColumns = entities.reduce((sum, entity) => sum + entity.fields.length, 0)
  const missingPrimaryKeys = entities.filter(
    (entity) => !entity.fields.some((field) => field.isPrimaryKey),
  )
  const inferredTargetCardinality: Cardinality = relationDraft.targetIds.length > 1 ? 'N' : '1'
  const scaledGridSize = erdGridSize * canvasZoom
  const gridOffsetX = ((canvasPan.x % scaledGridSize) + scaledGridSize) % scaledGridSize
  const gridOffsetY = ((canvasPan.y % scaledGridSize) + scaledGridSize) % scaledGridSize
  const canvasStyle = {
    '--erd-grid-size': `${scaledGridSize}px`,
    '--erd-grid-offset-x': `${gridOffsetX}px`,
    '--erd-grid-offset-y': `${gridOffsetY}px`,
  } as CSSProperties
  const selectedEntityPosition = selectedEntity ? getEntityWorldPosition(selectedEntity) : null
  const relationBuilderStyle = selectedEntity
    ? {
        left: `${selectedEntityPosition?.x ?? 0}px`,
        top: `${Math.max(96, selectedEntityPosition?.y ?? 0)}px`,
      }
    : undefined

  useEffect(() => {
    function handleWindowMouseMove(event: MouseEvent) {
      const canvas = canvasRef.current
      const dragState = dragStateRef.current

      if (!canvas || !dragState) {
        return
      }

      const pointer = getWorldPoint(event.clientX, event.clientY)

      moveEntity(dragState.entityId, pointer.x - dragState.offsetX, pointer.y - dragState.offsetY)
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
    const viewportCenter = getWorldPoint(
      (canvasRef.current?.getBoundingClientRect().left ?? 0) +
        (canvasRef.current?.getBoundingClientRect().width ?? erdWorldWidth) / 2,
      (canvasRef.current?.getBoundingClientRect().top ?? 0) +
        (canvasRef.current?.getBoundingClientRect().height ?? erdWorldHeight) / 2,
    )
    setEntities((currentEntities) => [
      ...currentEntities,
      {
        id,
        name: '',
        x: viewportCenter.x - erdEntityAnchorX + ((nextIndex * 37) % 160) - 80,
        y: viewportCenter.y - erdEntityAnchorY + ((nextIndex * 29) % 120) - 60,
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
      x: Math.max(0, Math.min(erdWorldWidth - erdEntityWidth, x)),
      y: Math.max(0, Math.min(erdWorldHeight - 120, y)),
    })
  }

  function clampZoom(zoom: number) {
    return Math.max(erdMinZoom, Math.min(erdMaxZoom, zoom))
  }

  function zoomCanvas(nextZoom: number, anchorClientX?: number, anchorClientY?: number) {
    const canvas = canvasRef.current
    const zoom = clampZoom(nextZoom)

    if (!canvas || zoom === canvasZoom) {
      setCanvasZoom(zoom)
      return
    }

    const canvasRect = canvas.getBoundingClientRect()
    const anchorX = anchorClientX ?? canvasRect.left + canvasRect.width / 2
    const anchorY = anchorClientY ?? canvasRect.top + canvasRect.height / 2
    const worldAnchor = getWorldPoint(anchorX, anchorY)

    setCanvasZoom(zoom)
    setCanvasPan({
      x: anchorX - canvasRect.left - worldAnchor.x * zoom,
      y: anchorY - canvasRect.top - worldAnchor.y * zoom,
    })
  }

  function resetCanvasView() {
    setCanvasZoom(1)
    setCanvasPan({ x: 0, y: 0 })
  }

  function getEntityWorldPosition(entity: ErdEntity) {
    return {
      x: entity.x,
      y: entity.y,
    }
  }

  function getWorldPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current

    if (!canvas) {
      return {
        x: (clientX - canvasPan.x) / canvasZoom,
        y: (clientY - canvasPan.y) / canvasZoom,
      }
    }

    const canvasRect = canvas.getBoundingClientRect()

    return {
      x: (clientX - canvasRect.left - canvasPan.x) / canvasZoom,
      y: (clientY - canvasRect.top - canvasPan.y) / canvasZoom,
    }
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

    const pointer = getWorldPoint(clientX, clientY)
    const entityPosition = getEntityWorldPosition(entity)

    dragStateRef.current = {
      entityId,
      offsetX: pointer.x - entityPosition.x,
      offsetY: pointer.y - entityPosition.y,
    }
    setSelectedEntityId(entityId)
  }

  function handleEntityDragStart(entityId: string, event: PointerEvent<HTMLElement>) {
    startEntityDrag(entityId, event.clientX, event.clientY)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleEntityDrag(entityId: string, event: PointerEvent<HTMLElement>) {
    const canvas = canvasRef.current
    const dragState = dragStateRef.current

    if (!canvas || !dragState || dragState.entityId !== entityId) {
      return
    }

    const pointer = getWorldPoint(event.clientX, event.clientY)

    event.stopPropagation()
    moveEntity(entityId, pointer.x - dragState.offsetX, pointer.y - dragState.offsetY)
  }

  function handleEntityDragEnd(entityId: string, event: PointerEvent<HTMLElement>) {
    event.stopPropagation()

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
                  name: '',
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
              relation.foreignKeyOwnerId === entityId && relation.foreignKeyFieldName === field.name
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
      const parentEntity = relationDraft.sourceCardinality === 'N' ? targetEntity : selectedEntity

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
    const target = event.target as HTMLElement

    if (
      panStateRef.current?.moved ||
      target.closest(
        '.entity-node, .relation-builder, .erd-toolbar, button, input, select, textarea, label',
      )
    ) {
      return
    }

    setSelectedEntityId('')
    setRelationDraft((currentDraft) => ({ ...currentDraft, targetIds: [] }))
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement

    if (
      target.closest(
        '.entity-node, .relation-builder, .erd-toolbar, button, input, select, textarea, label',
      )
    ) {
      return
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: canvasPan.x,
      startPanY: canvasPan.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLElement>) {
    const panState = panStateRef.current

    if (!panState || panState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - panState.startClientX
    const deltaY = event.clientY - panState.startClientY

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      panState.moved = true
    }

    setCanvasPan({
      x: panState.startPanX + deltaX,
      y: panState.startPanY + deltaY,
    })
  }

  function handleCanvasPointerUp(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    window.setTimeout(() => {
      panStateRef.current = null
    }, 0)
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLElement>) {
    const target = event.target as HTMLElement

    if (target.closest('.entity-node, .relation-builder, .erd-toolbar, input, select, textarea')) {
      return
    }

    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92
    zoomCanvas(canvasZoom * zoomFactor, event.clientX, event.clientY)
  }

  return (
    <div className="erd-layout">
      <section
        className={panStateRef.current?.moved ? 'canvas-panel panning' : 'canvas-panel'}
        ref={canvasRef}
        style={canvasStyle}
        onClick={clearSelectionFromCanvas}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onWheel={handleCanvasWheel}
      >
        <div className="erd-toolbar">
          <button type="button" onClick={addEntity}>
            {t('erd.addEntity')}
          </button>
          <div className="erd-zoom-controls" aria-label={t('erd.zoomControls')}>
            <button
              type="button"
              title={t('erd.zoomOut')}
              onClick={() => zoomCanvas(canvasZoom - 0.1)}
            >
              -
            </button>
            <button type="button" title={t('erd.resetZoom')} onClick={resetCanvasView}>
              {Math.round(canvasZoom * 100)}%
            </button>
            <button
              type="button"
              title={t('erd.zoomIn')}
              onClick={() => zoomCanvas(canvasZoom + 0.1)}
            >
              +
            </button>
          </div>
        </div>

        <div
          className="erd-canvas-world"
          style={{
            width: erdWorldWidth,
            height: erdWorldHeight,
            transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
          }}
        >
          {selectedEntity ? (
            <div className="relation-builder floating" style={relationBuilderStyle}>
              <div className="relation-builder-header">
                <span>{t('erd.relationFrom')}</span>
              </div>
              <div className="relation-controls">
                <label>
                  {t('erd.side')}
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
                  {t('erd.direction')}
                  <select
                    value={relationDraft.direction}
                    onChange={(event) =>
                      setRelationDraft({
                        ...relationDraft,
                        direction: event.target.value as RelationDirection,
                      })
                    }
                  >
                    <option value="two-way">{t('erd.bidirectional')}</option>
                    <option value="one-way">{t('erd.unidirectional')}</option>
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
                  {t('erd.opposite', {
                    value: relationDraft.targetIds.length === 0 ? '?' : inferredTargetCardinality,
                  })}
                </span>
                <button
                  type="button"
                  disabled={relationDraft.targetIds.length === 0}
                  onClick={createRelations}
                >
                  {t('erd.setRelation')}
                </button>
              </div>
            </div>
          ) : null}

          <svg
            className="relation-layer"
            viewBox={`0 0 ${erdWorldWidth} ${erdWorldHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="arrow-end"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" />
              </marker>
              <marker
                id="arrow-start"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="1"
                refY="4"
              >
                <path d="M8,0 L0,4 L8,8 Z" />
              </marker>
            </defs>
            {relations.map((relation) => {
              const source = entities.find((entity) => entity.id === relation.sourceId)
              const target = entities.find((entity) => entity.id === relation.targetId)

              if (!source || !target) {
                return null
              }

              const sourcePosition = getEntityWorldPosition(source)
              const targetPosition = getEntityWorldPosition(target)
              const sourceX = sourcePosition.x + erdEntityAnchorX
              const sourceY = sourcePosition.y + erdEntityAnchorY
              const targetX = targetPosition.x + erdEntityAnchorX
              const targetY = targetPosition.y + erdEntityAnchorY
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
              position={getEntityWorldPosition(entity)}
              isSelected={entity.id === selectedEntityId}
              onAddField={addField}
              onDeleteEntity={deleteEntity}
              onDeleteField={deleteField}
              onDrag={handleEntityDrag}
              onDragEnd={handleEntityDragEnd}
              onDragStart={handleEntityDragStart}
              onSelect={setSelectedEntityId}
              onUpdateEntity={updateEntity}
              onUpdateField={updateField}
            />
          ))}
        </div>
      </section>
      <section className="flow-panel">
        <h3>{t('erd.properties')}</h3>
        <div className="property-list">
          <span>{t('erd.entitiesCount', { count: entities.length })}</span>
          <span>{t('erd.columnsCount', { count: totalColumns })}</span>
          <span>{t('erd.relationsCount', { count: relations.length })}</span>
          <span>
            {t('erd.selected', {
              value: selectedEntity
                ? t('erd.selectedEntity', {
                    name: selectedEntity.name,
                    count: selectedEntity.fields.length,
                  })
                : t('erd.none'),
            })}
          </span>
          <span>
            {t('erd.pkWarnings', {
              value:
                missingPrimaryKeys.length === 0
                  ? t('erd.noWarnings')
                  : missingPrimaryKeys.map((entity) => entity.name).join(', '),
            })}
          </span>
        </div>
        <div className="relation-summary">
          <h3>{t('erd.relations')}</h3>
          {relations.length === 0 ? (
            <p className="muted-copy">{t('erd.noRelations')}</p>
          ) : (
            relations.map((relation) => {
              const source = entities.find((entity) => entity.id === relation.sourceId)
              const target = entities.find((entity) => entity.id === relation.targetId)

              return (
                <div className="relation-summary-row" key={relation.id}>
                  <span>
                    {source?.name ?? t('erd.unknown')} {relation.sourceCardinality}:
                    {relation.targetCardinality} {relation.direction === 'two-way' ? '<->' : '->'}{' '}
                    {target?.name ?? t('erd.unknown')}
                  </span>
                  <button type="button" onClick={() => deleteRelation(relation.id)}>
                    {t('erd.delete')}
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
  position,
  isSelected,
  onAddField,
  onDeleteEntity,
  onDeleteField,
  onDrag,
  onDragEnd,
  onDragStart,
  onSelect,
  onUpdateEntity,
  onUpdateField,
}: {
  entity: ErdEntity
  position: { x: number; y: number }
  isSelected: boolean
  onAddField: (entityId: string) => void
  onDeleteEntity: (entityId: string) => void
  onDeleteField: (entityId: string, fieldId: string) => void
  onDrag: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onDragEnd: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onDragStart: (entityId: string, event: PointerEvent<HTMLElement>) => void
  onSelect: (entityId: string) => void
  onUpdateEntity: (entityId: string, updates: Partial<ErdEntity>) => void
  onUpdateField: (entityId: string, fieldId: string, updates: Partial<ErdField>) => void
}) {
  const { t } = useI18n()

  return (
    <div
      className={isSelected ? 'entity-node selected' : 'entity-node'}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={() => onSelect(entity.id)}
    >
      <div
        className="entity-header"
        onPointerDown={(event) => onDragStart(entity.id, event)}
        onPointerMove={(event) => onDrag(entity.id, event)}
        onPointerUp={(event) => onDragEnd(entity.id, event)}
      >
        <span
          className="entity-drag-handle"
          aria-label={t('erd.dragEntity', { name: entity.name })}
        >
          {t('erd.drag')}
        </span>
        <input
          className="entity-name-input"
          placeholder={t('erd.entityPlaceholder')}
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
          {t('erd.delete')}
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
              aria-label={t('erd.columnName', {
                entity: entity.name,
                field: field.name,
              })}
              placeholder={t('erd.columnPlaceholder')}
              value={field.name}
              onChange={(event) => onUpdateField(entity.id, field.id, { name: event.target.value })}
            />
            <select
              aria-label={t('erd.columnType', {
                entity: entity.name,
                field: field.name,
              })}
              value={field.type}
              onChange={(event) =>
                onUpdateField(entity.id, field.id, {
                  type: event.target.value as FieldType,
                })
              }
            >
              {fieldTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <label title={t('erd.primaryKey')}>
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
            <label title={t('erd.notNull')}>
              <input
                checked={field.isNotNull}
                type="checkbox"
                onChange={(event) =>
                  onUpdateField(entity.id, field.id, {
                    isNotNull: event.target.checked,
                  })
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
        {t('erd.addColumn')}
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
  const { t } = useI18n()
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
      ? (operation.requestCustomFields ?? [])
      : (operation.responseCustomFields ?? [])
  }

  function updateCustomFields(
    operation: BackendOperation,
    tab: 'request' | 'response',
    fields: OperationCustomField[],
  ) {
    updateOperation(operation.id, {
      ...(tab === 'request' ? { requestCustomFields: fields } : { responseCustomFields: fields }),
    })
  }

  function addCustomField(operation: BackendOperation, tab: 'request' | 'response') {
    const fields = customFields(operation, tab)
    updateCustomFields(operation, tab, [
      ...fields,
      {
        id: `custom_${Date.now()}`,
        name: '',
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

    onChangeOperations([
      ...operations,
      {
        id: `${selectedEntity.id}_custom_${Date.now()}`,
        entityId: selectedEntity.id,
        kind: 'custom',
        label: '',
        method: 'POST',
        path: '',
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
        description: '',
        requirements: '',
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
          <h3>{t('dashboard.entities')}</h3>
          <span className="autosave-pill">{t('ops.mapped', { count: entities.length })}</span>
        </div>
        <p className="entity-scroll-hint">
          <i aria-hidden="true">↔</i>
          {t('ops.swipeEntities')}
        </p>
        <div className="entity-operation-buttons">
          {entities.map((entity) => (
            <button
              key={entity.id}
              className={entity.id === selectedEntity?.id ? 'selected' : ''}
              type="button"
              onClick={() => setSelectedEntityId(entity.id)}
            >
              <strong>{entity.name}</strong>
              <span>
                {t('ops.count', {
                  count: operations.filter(
                    (operation) => operation.entityId === entity.id && operation.enabled,
                  ).length,
                })}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flow-panel operation-config-panel">
        <div className="section-heading">
          <h3>
            {selectedEntity
              ? t('ops.entityOperations', { entity: selectedEntity.name })
              : t('ops.operations')}
          </h3>
          <button type="button" onClick={addCustomOperation} disabled={!selectedEntity}>
            {t('ops.addCustom')}
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
                        updateOperation(operation.id, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                    <span>{operation.kind === 'crud' ? 'CRUD' : t('ops.custom')}</span>
                  </label>
                  {operation.kind === 'custom' ? (
                    <button type="button" onClick={() => deleteCustomOperation(operation.id)}>
                      {t('erd.delete')}
                    </button>
                  ) : null}
                </div>

                <div className="operation-fields">
                  <label>
                    {t('ops.name')}
                    <input
                      placeholder={t('ops.namePlaceholder')}
                      value={operation.label}
                      onChange={(event) =>
                        updateOperation(operation.id, {
                          label: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    {t('ops.method')}
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
                    {t('ops.path')}
                    <input
                      placeholder={t('ops.pathPlaceholder')}
                      value={operation.path}
                      onChange={(event) =>
                        updateOperation(operation.id, {
                          path: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="operation-description-field">
                    {t('ops.description')}
                    <textarea
                      placeholder={t('ops.descriptionPlaceholder')}
                      value={operation.description ?? ''}
                      onChange={(event) =>
                        updateOperation(operation.id, {
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="operation-description-field">
                    {t('ops.requirements')}
                    <textarea
                      placeholder={t('ops.requirementsPlaceholder')}
                      value={operation.requirements ?? ''}
                      onChange={(event) =>
                        updateOperation(operation.id, {
                          requirements: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="payload-picker">
                  <div
                    className="field-tab-list"
                    role="tablist"
                    aria-label={t('ops.fieldDirection')}
                  >
                    <button
                      className={fieldTab === 'request' ? 'active' : ''}
                      type="button"
                      onClick={() => setFieldTab('request')}
                    >
                      {t('ops.request')}
                    </button>
                    <button
                      className={fieldTab === 'response' ? 'active' : ''}
                      type="button"
                      onClick={() => setFieldTab('response')}
                    >
                      {t('ops.response')}
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
                      <span>{t('ops.customFields')}</span>
                      <button type="button" onClick={() => addCustomField(operation, fieldTab)}>
                        {t('ops.addField')}
                      </button>
                    </div>
                    {customFields(operation, fieldTab).map((field) => (
                      <div className="custom-field-row" key={field.id}>
                        <input
                          aria-label={t('ops.customFieldName')}
                          placeholder={t('ops.customFieldNamePlaceholder')}
                          value={field.name}
                          onChange={(event) =>
                            updateCustomField(operation, fieldTab, field.id, {
                              name: event.target.value,
                            })
                          }
                        />
                        <select
                          aria-label={t('ops.customFieldType')}
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
                          {t('erd.delete')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">{t('ops.addEntitiesFirst')}</p>
        )}
      </section>

      <section className="flow-panel operation-preview-panel">
        <h3>{t('ops.apiPreview')}</h3>
        <div className="api-preview">
          {enabledOperations.length === 0 ? (
            <p className="muted-copy">{t('ops.noEnabled')}</p>
          ) : (
            enabledOperations.map((operation) => (
              <div className="api-preview-block" key={operation.id}>
                <strong>
                  {operation.method} {operation.path}
                </strong>
                {operation.description ? <p>{operation.description}</p> : null}
                {operation.requirements ? (
                  <>
                    <span>{t('ops.requirements')}</span>
                    <p>{operation.requirements}</p>
                  </>
                ) : null}
                <span>{t('ops.request')}</span>
                <code>{formatFieldPreview(selectedEntity, operation, 'request')}</code>
                <span>{t('ops.response')}</span>
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
      ? (operation.requestFieldIds ?? operation.payloadFieldIds)
      : (operation.responseFieldIds ?? entity?.fields.map((field) => field.id) ?? [])

  if (!entity || fieldIds.length === 0) {
    const customOnlyPayload = (
      direction === 'request'
        ? (operation.requestCustomFields ?? [])
        : (operation.responseCustomFields ?? [])
    ).map((field) => `  "${field.name}": "${field.type}"`)

    return customOnlyPayload.length > 0 ? `{\n${customOnlyPayload.join(',\n')}\n}` : '{}'
  }

  const payload = entity.fields
    .filter((field) => fieldIds.includes(field.id))
    .map((field) => `  "${field.name}": "${field.type}"`)
  const customPayload = (
    direction === 'request'
      ? (operation.requestCustomFields ?? [])
      : (operation.responseCustomFields ?? [])
  ).map((field) => `  "${field.name}": "${field.type}"`)

  return `{\n${[...payload, ...customPayload].join(',\n')}\n}`
}

function GenerateStep({
  draftProject,
  entities,
  initialAgentResult,
  initialWorkspace,
  relations,
  operations,
  authFetch,
  token,
  onNestJsAppReadyChange,
  onNestJsResultChange,
  onWorkspaceChange,
}: {
  draftProject: DraftProject
  entities: ErdEntity[]
  initialAgentResult: NestJsAgentResult | null
  initialWorkspace: GenerateWorkspace | null
  relations: ErdRelation[]
  operations: BackendOperation[]
  authFetch: AuthFetch
  token: string | null
  onNestJsAppReadyChange: (isReady: boolean) => void
  onNestJsResultChange: (result: NestJsAgentResult | null) => void
  onWorkspaceChange: (workspace: GenerateWorkspace | null) => void
}) {
  const { t } = useI18n()
  const hasRequestedWorkspace = useRef(Boolean(initialWorkspace))
  const [workspace, setWorkspace] = useState<GenerateWorkspace | null>(initialWorkspace)
  const [agentResult, setAgentResult] = useState<NestJsAgentResult | null>(initialAgentResult)
  const [isGeneratingWorkspace, setIsGeneratingWorkspace] = useState(false)
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLogLine[]>([])
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const enabledOperations = operations.filter((operation) => operation.enabled)
  const hasExistingBuild = agentResult?.build?.success === true

  function makeTerminalLine(status: TerminalLogLine['status'], text: string): TerminalLogLine {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      status,
      text,
    }
  }

  const progressMessageMap: Record<string, string> = {
    'Reading markdown design documents': t('generate.progress.readDocs'),
    'Normalizing application specification': t('generate.progress.normalizeSpec'),
    'Planning NestJS bootstrap files': t('generate.progress.planFiles'),
    'Generating NestJS bootstrap files': t('generate.progress.generateFiles'),
    'Writing bootstrap files to workspace': t('generate.progress.writeFiles'),
    'Installing dependencies and compiling bootstrap app': t('generate.progress.runBuild'),
    'Repairing bootstrap build failures': t('generate.progress.repairFiles'),
    'Planning entity, ORM, and CRUD tasks': t('generate.progress.planBuildTasks'),
    'Selecting next generation task': t('generate.progress.selectNextTask'),
    'Preparing selected task': t('generate.progress.taskPlanner'),
    'Reading relevant generated code context': t('generate.progress.codeContext'),
    'Generating task implementation files': t('generate.progress.codeGeneration'),
    'Applying generated file changes': t('generate.progress.applyPatch'),
    'Running TypeScript build check': t('generate.progress.syntaxCheck'),
    'Running generated app verification gate': t('generate.progress.e2eCheck'),
    'Recording completed task': t('generate.progress.recordCompleted'),
    'Recording failed task': t('generate.progress.recordFailed'),
    'Running final NestJS app build': t('generate.progress.runFinalBuild'),
    'Running final HTTP and Swagger smoke check': t('generate.progress.runFinalSmoke'),
    'Validating final application against the specification skeleton': t('generate.progress.validateFinalContracts'),
    'Repairing final build failures': t('generate.progress.repairFinalBuild'),
    'Restoring user-owned files into staging workspace': t('generate.progress.restoreUserFiles'),
    'Collecting generated artifact summary': t('generate.progress.packageArtifact'),
    'Starting NestJS app generation agent': t('generate.startAgent'),
  }

  function localizeProgress(message: string): string {
    const exact = progressMessageMap[message]
    if (exact) return exact
    const preparingMatch = message.match(/^Preparing (\S+) output directory$/)
    if (preparingMatch)
      return t('generate.progress.preparingOutput', {
        target: preparingMatch[1],
      })
    return message
  }

  function taskProgressLabel(progress: AgentProgressEvent): string | null {
    const taskKind = typeof progress.detail?.taskKind === 'string' ? progress.detail.taskKind : null
    if (!taskKind) return null

    const entity = typeof progress.detail?.targetEntity === 'string' ? progress.detail.targetEntity : ''
    const taskKeyByKind: Record<string, TranslationKey> = {
      'entity-fields': 'generate.task.entityFields',
      'entity-relations': 'generate.task.entityRelations',
      'orm-registration': 'generate.task.ormRegistration',
      'crud-feature': 'generate.task.crudFeature',
      'endpoint-workflow': 'generate.task.endpointWorkflow',
      'business-workflow': 'generate.task.businessWorkflow',
      'final-e2e': 'generate.task.finalE2e',
    }
    const taskKey = taskKeyByKind[taskKind]
    if (!taskKey) return null

    const task = t(taskKey, { entity })
    const phaseKeyByMessage: Record<string, TranslationKey> = {
      'Preparing selected task': 'generate.task.preparing',
      'Reading relevant generated code context': 'generate.task.context',
      'Generating task implementation files': 'generate.task.generating',
      'Applying generated file changes': 'generate.task.applying',
      'Running TypeScript build check': 'generate.task.validating',
      'Running generated app verification gate': 'generate.task.verifying',
      'Recording completed task': 'generate.task.completed',
      'Recording failed task': 'generate.task.failed',
    }
    const phaseKey = phaseKeyByMessage[progress.message]
    return phaseKey ? t(phaseKey, { task }) : null
  }

  function setProgressLine(progress: AgentProgressEvent) {
    // The build graph emits several internal events for each task. Collapse
    // them into one evolving, task-aware terminal line instead of log spam.
    if (progress.message === 'Selecting next generation task') return

    const taskMessage = taskProgressLabel(progress)
    const localizedMessage = taskMessage ?? localizeProgress(progress.message)
    const isTaskInternalStep = Boolean(taskMessage)
    const isTerminalTaskEvent =
      progress.message === 'Recording completed task' || progress.message === 'Recording failed task'

    setTerminalLines((currentLines) => {
      const lastLine = currentLines[currentLines.length - 1]

      if (isTaskInternalStep && progress.stage === 'completed' && !isTerminalTaskEvent) {
        return currentLines
      }

      if (isTaskInternalStep && progress.stage === 'started' && lastLine?.status === 'running') {
        return [...currentLines.slice(0, -1), { ...lastLine, text: localizedMessage }]
      }

      if (
        progress.stage === 'started' &&
        lastLine?.status === 'running' &&
        lastLine.text === localizedMessage
      ) {
        return currentLines
      }

      if (
        progress.stage === 'completed' &&
        lastLine?.status === 'running' &&
        lastLine.text === localizedMessage
      ) {
        return [...currentLines.slice(0, -1), { ...lastLine, status: 'success' }]
      }

      if (
        progress.stage === 'failed' &&
        lastLine?.status === 'running' &&
        lastLine.text === localizedMessage
      ) {
        return [...currentLines.slice(0, -1), { ...lastLine, status: 'error' }]
      }

      const status =
        progress.stage === 'completed'
          ? 'success'
          : progress.stage === 'failed'
            ? 'error'
            : 'running'

      return [...currentLines, makeTerminalLine(status, localizedMessage)]
    })
  }

  async function createWorkspaceSnapshot() {
    setIsGeneratingWorkspace(true)
    setGenerateError(null)

    try {
      const response = await authFetch(`${apiBaseUrl}/api/generate/workspace`, {
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
        throw new Error(t('error.workspaceFailed'))
      }

      const workspaceData = (await response.json()) as GenerateWorkspace
      setWorkspace(workspaceData)
      setAgentResult(null)
      onWorkspaceChange(workspaceData)
      onNestJsResultChange(null)
      setTerminalLines([
        makeTerminalLine('success', t('generate.snapshotCreated')),
        makeTerminalLine('idle', t('generate.targetFolder', { uuid: workspaceData.workspaceId })),
        makeTerminalLine(
          'success',
          t('generate.wroteInputs', { files: workspaceData.files.join(', ') }),
        ),
        makeTerminalLine('idle', t('generate.nextNest')),
      ])
      onNestJsAppReadyChange(false)
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t('error.unexpectedGenerate'))
      hasRequestedWorkspace.current = false
    } finally {
      setIsGeneratingWorkspace(false)
    }
  }

  async function deleteExistingBuild(workspaceId: string) {
    try {
      await authFetch(`${apiBaseUrl}/api/generate/workspace/${workspaceId}/nestjs`, {
        method: 'DELETE',
      })
    } catch {
      // Ignore — build will overwrite
    }
  }

  async function runNestJsAgent() {
    if (!workspace) {
      return
    }

    const isRegenerate = hasExistingBuild

    setIsRunningAgent(true)
    setGenerateError(null)
    setAgentResult(null)
    onNestJsResultChange(null)
    onNestJsAppReadyChange(false)

    if (isRegenerate) {
      setTerminalLines([makeTerminalLine('running', t('generate.startAgent'))])
      await deleteExistingBuild(workspace.workspaceId)
      await createWorkspaceSnapshot()
    } else {
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('running', t('generate.startAgent')),
      ])
    }

    const source = new EventSource(
      `${apiBaseUrl}/api/generate/workspace/${workspace.workspaceId}/nestjs/events${
        token ? `?token=${encodeURIComponent(token)}` : ''
      }`,
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
      onNestJsResultChange(result)
      onNestJsAppReadyChange(result.build?.success === true)
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine(
          result.build?.success ? 'success' : 'error',
          t('generate.finalBuild', {
            status: result.build?.success ? t('generate.passed') : t('generate.failed'),
          }),
        ),
        ...buildSummaryLines,
        makeTerminalLine('idle', t('generate.artifactFiles', { count: result.files.length })),
      ])
    })

    source.addEventListener('agent-error', (event) => {
      const payload = JSON.parse(event.data) as { message?: string }
      setGenerateError(payload.message ?? t('error.agentUnexpected'))
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', payload.message ?? t('error.agentFailed')),
      ])
      onNestJsAppReadyChange(false)
      setIsRunningAgent(false)
      source.close()
    })

    source.addEventListener('done', () => {
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('success', t('generate.streamClosed')),
      ])
      setIsRunningAgent(false)
      source.close()
    })

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        return
      }
      setGenerateError(t('error.agentStream'))
      onNestJsAppReadyChange(false)
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', t('error.agentStream')),
      ])
      setIsRunningAgent(false)
      source.close()
    }
  }

  useEffect(() => {
    if (initialAgentResult?.build?.success) {
      onNestJsAppReadyChange(true)
      if (!hasRequestedWorkspace.current) {
        hasRequestedWorkspace.current = true
        setTerminalLines([
          makeTerminalLine(
            'success',
            t('generate.alreadyBuilt', {
              count: initialAgentResult.files.length,
            }),
          ),
          makeTerminalLine('idle', t('generate.readyToNext')),
        ])
      }
      return
    }

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
            text: t('generate.preparing'),
          },
          {
            id: 'terminal_empty_target',
            status: 'idle' as const,
            text: t('generate.targetFolder'),
          },
          {
            id: 'terminal_empty_files',
            status: 'idle' as const,
            text: t('generate.inputFiles'),
          },
        ]

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>{t('generate.summary')}</h3>
        <div className="summary-grid">
          <span>{t('skills.framework')}</span>
          <strong>{draftProject.framework}</strong>
          <span>{t('dashboard.entities')}</span>
          <strong>{entities.length}</strong>
          <span>{t('dashboard.operations')}</span>
          <strong>{enabledOperations.length}</strong>
          <span>{t('skills.database')}</span>
          <strong>{draftProject.database}</strong>
          <span>{t('generate.workspace')}</span>
          <strong>
            {workspace?.workspaceId ??
              (isGeneratingWorkspace ? t('generate.creating') : t('generate.notCreated'))}
          </strong>
          <span>{t('generate.nestApp')}</span>
          <strong>
            {agentResult
              ? `${agentResult.build?.success ? t('generate.built') : t('generate.generated')} · ${t('generate.files', { count: agentResult.files.length })}`
              : t('generate.waiting')}
          </strong>
        </div>
      </section>
      <section className="flow-panel terminal-panel">
        <div className="section-heading">
          <h3>{t('generate.workspaceTitle')}</h3>
          <div className="generate-actions">
            <button
              type="button"
              disabled={!workspace || isRunningAgent}
              onClick={() => void runNestJsAgent()}
            >
              {isRunningAgent
                ? t('generate.creating')
                : hasExistingBuild
                  ? t('generate.recreateNest')
                  : t('generate.createNest')}
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
                  style={
                    {
                      '--characters': Math.max(line.text.length, 1),
                    } as CSSProperties
                  }
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

function TestStep({
  draftProject,
  initialTestResult,
  nestResult,
  token,
  onTestReadyChange,
  onTestResultChange,
  workspace,
}: {
  draftProject: DraftProject
  initialTestResult: TestAgentResult | null
  nestResult: NestJsAgentResult | null
  token: string | null
  onTestReadyChange: (isReady: boolean) => void
  onTestResultChange: (result: TestAgentResult | null) => void
  workspace: GenerateWorkspace | null
}) {
  const { t } = useI18n()
  const [testResult, setTestResult] = useState<TestAgentResult | null>(initialTestResult)
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLogLine[]>([])
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const canRunTests = Boolean(
    nestResult?.build?.success && nestResult.appPath && workspace?.workspacePath,
  )
  const coveragePercent = formatCoveragePercent(testResult?.test.coverageSummary)

  function makeTerminalLine(status: TerminalLogLine['status'], text: string): TerminalLogLine {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      status,
      text,
    }
  }

  const testProgressMap: Record<string, string> = {
    'Understanding endpoint/function specifications': t('test.progress.understandSpec'),
    'Searching generated NestJS codebase': t('test.progress.searchCodebase'),
    'Generating framework test code': t('test.progress.generateTestCode'),
    'Generating Jest test code': t('test.progress.generateTestCode'),
    'Applying generated test files': t('test.progress.applyPatch'),
    'Running test coverage and verification': t('test.progress.runCoverage'),
    'Starting NestJS test agent': t('test.startAgent'),
  }

  function localizeTestProgress(message: string): string {
    return testProgressMap[message] ?? message
  }

  function setProgressLine(progress: AgentProgressEvent) {
    const localizedMessage = localizeTestProgress(progress.message)
    const attempt =
      typeof progress.detail?.attempt === 'number' ? progress.detail.attempt : 1
    const isTestPhase =
      progress.message !== 'Starting NestJS test agent' &&
      Object.prototype.hasOwnProperty.call(testProgressMap, progress.message)
    const isFinalVerification =
      progress.message === 'NestJS test verification completed' ||
      progress.message === 'NestJS test verification failed'

    if (isFinalVerification) {
      return
    }

    const lineText = isTestPhase
      ? t('test.progress.attempt', { attempt, phase: localizedMessage })
      : localizedMessage
    const failureDetails =
      progress.stage === 'failed' && typeof progress.detail?.error === 'string'
        ? progress.detail.error
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 8)
            .map((line) => line.slice(0, 500))
        : []
    const generatedTestDetails =
      progress.stage === 'completed' && Array.isArray(progress.detail?.generatedTests)
        ? progress.detail.generatedTests.flatMap((entry: unknown) => {
            if (!entry || typeof entry !== 'object' || !('path' in entry)) return []
            const path = typeof entry.path === 'string' ? entry.path : ''
            if (!path) return []
            const cases: string[] =
              'cases' in entry && Array.isArray(entry.cases)
                ? entry.cases.filter((name: unknown): name is string => typeof name === 'string')
                : []
            return [
              t('test.progress.generatedFile', { path }),
              ...cases.map((name) => `  ↳ ${name}`),
            ]
          })
        : []
    const patchedTestDetails =
      progress.stage === 'completed' && Array.isArray(progress.detail?.patchedTestFiles)
        ? progress.detail.patchedTestFiles
            .filter((path): path is string => typeof path === 'string')
            .map((path) => t('test.progress.patchedFile', { path }))
        : []

    setTerminalLines((currentLines) => {
      const lastLine = currentLines[currentLines.length - 1]

      if (isTestPhase && progress.stage === 'started') {
        if (lastLine?.status === 'running' && lastLine.text === lineText) {
          return currentLines
        }

        const settledLines =
          lastLine?.status === 'running'
            ? [...currentLines.slice(0, -1), { ...lastLine, status: 'success' as const }]
            : currentLines
        return [...settledLines, makeTerminalLine('running', lineText)]
      }

      if (isTestPhase && progress.stage === 'completed') {
        const detailLines = [...generatedTestDetails, ...patchedTestDetails].map((line) =>
          makeTerminalLine('idle', line),
        )
        if (lastLine?.status === 'running' && lastLine.text === lineText) {
          return [
            ...currentLines.slice(0, -1),
            { ...lastLine, status: 'success' },
            ...detailLines,
          ]
        }

        return [...currentLines, makeTerminalLine('success', lineText), ...detailLines]
      }

      if (isTestPhase && progress.stage === 'failed') {
        const failedLines =
          lastLine?.status === 'running' && lastLine.text === lineText
            ? [...currentLines.slice(0, -1), { ...lastLine, status: 'error' as const }]
            : [...currentLines, makeTerminalLine('error', lineText)]
        return [
          ...failedLines,
          makeTerminalLine('error', t('test.progress.attemptFailed', { attempt })),
          ...failureDetails.map((line) => makeTerminalLine('error', line)),
        ]
      }

      const status =
        progress.stage === 'completed'
          ? 'success'
          : progress.stage === 'failed'
            ? 'error'
            : 'running'

      if (lastLine?.status === 'running' && lastLine.text === lineText) {
        return [...currentLines.slice(0, -1), { ...lastLine, status }]
      }

      return [...currentLines, makeTerminalLine(status, lineText)]
    })
  }

  function runTestAgent() {
    if (!canRunTests || !nestResult?.appPath || !workspace?.workspacePath) {
      setTestError(t('test.notReady'))
      return
    }

    setIsRunningAgent(true)
    setTestError(null)
    setTestResult(null)
    onTestReadyChange(false)
    onTestResultChange(null)
    setTerminalLines([makeTerminalLine('running', t('test.startAgent'))])

    const params = new URLSearchParams({
      appDir: nestResult.appPath,
      projectDir: workspace.workspacePath,
      maxAttempts: '3',
    })
    if (token) {
      params.set('token', token)
    }
    const source = new EventSource(`${apiBaseUrl}/api/tests/events?${params.toString()}`)

    source.addEventListener('progress', (event) => {
      const progress = JSON.parse(event.data) as AgentProgressEvent
      setProgressLine(progress)
    })

    source.addEventListener('result', (event) => {
      const result = JSON.parse(event.data) as TestAgentResult
      const failureLines = result.test.errorSummary
        ? result.test.errorSummary
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 12)
            .map((line) => makeTerminalLine('error', line))
        : []

      setTestResult(result)
      onTestReadyChange(result.verified)
      onTestResultChange(result)
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('success', result.verified ? t('test.verified') : t('test.failed')),
        ...failureLines,
        makeTerminalLine('idle', `${t('test.changedFiles')}: ${result.changedFiles.length}`),
        makeTerminalLine('idle', `${t('test.generatedFiles')}: ${result.generatedFiles.length}`),
      ])
    })

    source.addEventListener('agent-error', (event) => {
      const payload = JSON.parse(event.data) as { message?: string }
      setTestError(payload.message ?? t('error.testAgentUnexpected'))
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', payload.message ?? t('error.testAgentFailed')),
      ])
      onTestReadyChange(false)
      onTestResultChange(null)
      setIsRunningAgent(false)
      source.close()
    })

    source.addEventListener('done', () => {
      setIsRunningAgent(false)
      source.close()
    })

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        return
      }
      setTestError(t('error.testAgentStream'))
      setTerminalLines((currentLines) => [
        ...currentLines.filter((line) => line.status !== 'running'),
        makeTerminalLine('error', t('error.testAgentStream')),
      ])
      onTestReadyChange(false)
      onTestResultChange(null)
      setIsRunningAgent(false)
      source.close()
    }
  }

  useEffect(() => {
    onTestReadyChange(testResult?.verified === true)
    onTestResultChange(testResult)
  }, [onTestReadyChange, onTestResultChange, testResult])

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
          makeTerminalLine(
            canRunTests ? 'idle' : 'error',
            canRunTests ? t('test.runAgent') : t('test.notReady'),
          ),
        ]

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>{t('test.report')}</h3>
        <div className="metrics">
          <div>
            <span>{testResult?.test.testsPassed ?? (testResult?.verified ? 1 : 0)}</span>
            {t('test.passing')}
          </div>
          <div>
            <span>
              {testResult?.test.testsFailed ?? (testResult && !testResult.verified ? 1 : 0)}
            </span>
            {t('test.failing')}
          </div>
          <div>
            <span>{coveragePercent ?? '-'}</span>
            {t('test.coverage')}
          </div>
        </div>
        <p className="muted-copy">
          {testResult?.verified
            ? t('test.ready', { framework: draftProject.framework })
            : canRunTests
              ? t('test.runAgent')
              : t('test.notReady')}
        </p>
      </section>
      <section className="flow-panel terminal-panel">
        <div className="section-heading">
          <h3>{t('test.agentTitle')}</h3>
          <button
            type="button"
            disabled={!canRunTests || isRunningAgent}
            onClick={() => runTestAgent()}
          >
            {isRunningAgent ? t('test.runningAgent') : t('test.runAgent')}
          </button>
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
                  style={
                    {
                      '--characters': Math.max(line.text.length, 1),
                    } as CSSProperties
                  }
                >
                  {line.text}
                </span>
                {isLastRunningLine ? <span className="terminal-cursor" /> : null}
              </div>
            )
          })}
        </div>
        {testError ? <p className="error-text">{testError}</p> : null}
      </section>
    </div>
  )
}

export default App
