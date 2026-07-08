import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
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
const aiWizardTimeoutMs = 60000

type Language = 'en' | 'ko'
type TranslationValues = Record<string, string | number>

const translations = {
  en: {
    'language.label': 'Language',
    'language.en': 'English',
    'language.ko': 'Korean',
    'auth.eyebrow': 'Semraz backend builder',
    'auth.title': 'Measure the spec. Generate the backend.',
    'auth.copy':
      'A design-first workspace for planning entities, operations, generated code, compile checks, and tests from one source of truth.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.signingIn': 'Signing in...',
    'auth.signIn': 'Sign in with mock auth',
    'error.loginFailed': 'Mock login failed.',
    'error.projectsFailed': 'Could not load projects.',
    'error.unexpectedLogin': 'Unexpected login error.',
    'error.workspaceFailed': 'Could not create generation workspace.',
    'error.unexpectedGenerate': 'Unexpected generate error.',
    'error.agentUnexpected': 'Unexpected agent error.',
    'error.agentFailed': 'Agent failed',
    'error.agentStream': 'Could not keep the NestJS agent event stream open.',
    'status.planning': 'Planning',
    'status.compile_failed': 'Compile failed',
    'status.verified': 'Verified',
    'topbar.authenticatedAs': 'Mock authenticated as {role}',
    'topbar.newApp': 'New backend application',
    'topbar.workspaces': 'Backend workspaces',
    'topbar.logout': 'Log out',
    'dashboard.projectList': 'Project list',
    'dashboard.projects': 'Projects',
    'dashboard.newBackend': 'New backend',
    'dashboard.target': '{framework} target',
    'dashboard.entities': 'Entities',
    'dashboard.operations': 'Operations',
    'dashboard.tests': 'Tests',
    'dashboard.skillsDraft': 'skills.md draft',
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
    'flow.eyebrow': 'Measure seven times',
    'flow.close': 'Close',
    'flow.progress': 'Create backend flow progress',
    'flow.cancel': 'Cancel',
    'flow.back': 'Back',
    'flow.finish': 'Finish mock project',
    'flow.next': 'Next',
    'ai.open': 'AI Wizard',
    'ai.close': 'Hide AI Wizard',
    'ai.apply': 'Apply AI draft',
    'ai.applying': 'Designing...',
    'ai.failed': 'AI provider request failed.',
    'ai.timeout': 'AI provider request took too long. Please try again.',
    'ai.projectTitle': 'Project idea assistant',
    'ai.projectCopy': 'Draft a concrete backend idea, description, and database choice to start the project.',
    'ai.planningTitle': 'Planning assistant',
    'ai.planningCopy': 'Use the project basics to write the backend purpose and code constraints.',
    'ai.erdTitle': 'ERD assistant',
    'ai.erdCopy': 'Use the project and planning notes to generate a first entity model and relationships.',
    'ai.operationsTitle': 'API assistant',
    'ai.operationsCopy': 'Recommend API specifications from the project, planning notes, and ERD.',
    'ai.unavailable': 'AI design is not used in this step.',
    'project.basics': 'Project basics',
    'project.name': 'Name',
    'project.database': 'Database',
    'project.description': 'Description',
    'project.framework': 'Target framework',
    'project.nestDescription':
      'Module, controller, service, DTO, validation, compile, and Jest test flow for the first Semraz MVP.',
    'project.goDescription': 'Static, fast, compile-checked service generation.',
    'project.pythonDescription': 'Pydantic models, routers, OpenAPI, and quick iteration.',
    'project.comingSoon': 'Coming soon',
    'planning.inputs': 'Planning inputs',
    'planning.scaffold': 'Scaffold sections',
    'planning.purpose': 'Purpose',
    'planning.constraints': 'Constraints',
    'planning.preview': 'skills.md preview',
    'planning.autosaved': 'Autosaved locally',
    'planning.checks': 'Assistant checks',
    'planning.checkPurpose': 'Purpose is present and project-specific',
    'planning.checkConstraints': 'Constraints define the NestJS generation boundary',
    'planning.checkCompile': 'NestJS compile/test constraints are explicit',
    'planning.scaffoldPurpose': 'Build a reliable NestJS backend from a reviewed Semraz specification.',
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
    'erd.zoomControls': 'Canvas zoom controls',
    'erd.zoomOut': 'Zoom out',
    'erd.resetZoom': 'Reset zoom',
    'erd.zoomIn': 'Zoom in',
    'erd.relationFrom': 'Relation from',
    'erd.side': 'Side',
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
    'ops.entityOperations': '{entity} operations',
    'ops.operations': 'Operations',
    'ops.addCustom': 'Add custom',
    'ops.custom': 'Custom',
    'ops.name': 'Name',
    'ops.method': 'Method',
    'ops.path': 'Path',
    'ops.description': 'API description',
    'ops.fieldDirection': 'API field direction',
    'ops.request': 'Request',
    'ops.response': 'Response',
    'ops.customFields': 'Custom fields',
    'ops.addField': 'Add field',
    'ops.customFieldName': 'Custom field name',
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
    'generate.workspace': 'Workspace',
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
    'test.report': 'Verification report',
    'test.passing': 'Passing',
    'test.failing': 'Failing',
    'test.coverage': 'Coverage',
    'test.ready': 'Mock {framework} backend is ready to export, push to Git, or deploy.',
    'test.restClient': 'REST client',
  },
  ko: {
    'language.label': '언어',
    'language.en': 'English',
    'language.ko': '한국어',
    'auth.eyebrow': 'Semraz 백엔드 빌더',
    'auth.title': '스펙을 측정하고, 백엔드를 생성하세요.',
    'auth.copy':
      '엔티티, 작업, 생성 코드, 컴파일 검사, 테스트를 하나의 기준 스펙에서 설계하는 워크스페이스입니다.',
    'auth.email': '이메일',
    'auth.password': '비밀번호',
    'auth.signingIn': '로그인 중...',
    'auth.signIn': 'Mock 인증으로 로그인',
    'error.loginFailed': 'Mock 로그인에 실패했습니다.',
    'error.projectsFailed': '프로젝트를 불러올 수 없습니다.',
    'error.unexpectedLogin': '예상치 못한 로그인 오류입니다.',
    'error.workspaceFailed': '생성 워크스페이스를 만들 수 없습니다.',
    'error.unexpectedGenerate': '예상치 못한 생성 오류입니다.',
    'error.agentUnexpected': '예상치 못한 에이전트 오류입니다.',
    'error.agentFailed': '에이전트가 실패했습니다.',
    'error.agentStream': 'NestJS 에이전트 이벤트 스트림을 유지할 수 없습니다.',
    'status.planning': '계획 중',
    'status.compile_failed': '컴파일 실패',
    'status.verified': '검증됨',
    'topbar.authenticatedAs': 'Mock 인증 역할: {role}',
    'topbar.newApp': '새 백엔드 애플리케이션',
    'topbar.workspaces': '백엔드 워크스페이스',
    'topbar.logout': '로그아웃',
    'dashboard.projectList': '프로젝트 목록',
    'dashboard.projects': '프로젝트',
    'dashboard.newBackend': '새 백엔드',
    'dashboard.target': '{framework} 대상',
    'dashboard.entities': '엔티티',
    'dashboard.operations': '작업',
    'dashboard.tests': '테스트',
    'dashboard.skillsDraft': 'skills.md 초안',
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
    'flow.eyebrow': '일곱 번 측정하기',
    'flow.close': '닫기',
    'flow.progress': '백엔드 생성 단계 진행',
    'flow.cancel': '취소',
    'flow.back': '뒤로',
    'flow.finish': 'Mock 프로젝트 완료',
    'flow.next': '다음',
    'ai.open': 'AI 마법사',
    'ai.close': 'AI 마법사 숨기기',
    'ai.apply': 'AI 초안 적용',
    'ai.applying': '설계 중...',
    'ai.failed': 'AI Provider 요청에 실패했습니다.',
    'ai.timeout': 'AI Provider 요청 시간이 너무 오래 걸렸습니다. 다시 시도해주세요.',
    'ai.projectTitle': '프로젝트 아이디어 보조',
    'ai.projectCopy': '백엔드 프로젝트의 첫 아이디어, 설명, 데이터베이스 선택을 구체적인 초안으로 만듭니다.',
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
    'project.framework': '대상 프레임워크',
    'project.nestDescription':
      '첫 Semraz MVP를 위한 모듈, 컨트롤러, 서비스, DTO, 검증, 컴파일, Jest 테스트 흐름입니다.',
    'project.goDescription': '정적이고 빠른 컴파일 검증 서비스 생성입니다.',
    'project.pythonDescription': 'Pydantic 모델, 라우터, OpenAPI, 빠른 반복 개발입니다.',
    'project.comingSoon': '준비 중',
    'planning.inputs': '계획 입력',
    'planning.scaffold': '섹션 생성',
    'planning.purpose': '목적',
    'planning.constraints': '제약 조건',
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
    'erd.zoomControls': '캔버스 확대/축소 컨트롤',
    'erd.zoomOut': '축소',
    'erd.resetZoom': '확대/축소 초기화',
    'erd.zoomIn': '확대',
    'erd.relationFrom': '관계 시작',
    'erd.side': '측',
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
    'ops.entityOperations': '{entity} 작업',
    'ops.operations': '작업',
    'ops.addCustom': '커스텀 추가',
    'ops.custom': '커스텀',
    'ops.name': '이름',
    'ops.method': '메서드',
    'ops.path': '경로',
    'ops.description': 'API 설명',
    'ops.fieldDirection': 'API 필드 방향',
    'ops.request': '요청',
    'ops.response': '응답',
    'ops.customFields': '커스텀 필드',
    'ops.addField': '필드 추가',
    'ops.customFieldName': '커스텀 필드 이름',
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
    'generate.workspace': '워크스페이스',
    'generate.nestApp': 'NestJS 앱',
    'generate.creating': '생성 중...',
    'generate.notCreated': '생성되지 않음',
    'generate.built': '빌드됨',
    'generate.generated': '생성됨',
    'generate.files': '{count}개 파일',
    'generate.waiting': '대기 중',
    'generate.workspaceTitle': '생성 워크스페이스',
    'generate.createWorkspace': '새 워크스페이스 생성',
    'generate.createNest': 'NestJS 앱 생성',
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
    'generate.preparing': '생성 워크스페이스 준비 중',
    'generate.targetFolder': '대상 폴더: .semraz/workspaces/{uuid}',
    'generate.inputFiles': '파일: PROJECT.md, ERD.md, endpoints.md, rules.md',
    'test.report': '검증 리포트',
    'test.passing': '통과',
    'test.failing': '실패',
    'test.coverage': '커버리지',
    'test.ready': 'Mock {framework} 백엔드를 내보내기, Git 푸시, 배포할 준비가 되었습니다.',
    'test.restClient': 'REST 클라이언트',
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

function useI18n() {
  return useContext(I18nContext)
}

function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()

  return (
    <label className="language-switcher">
      <span>{t('language.label')}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="en">{t('language.en')}</option>
        <option value="ko">{t('language.ko')}</option>
      </select>
    </label>
  )
}

function buildSkillsMarkdown(draftProject: DraftProject, t: (key: TranslationKey, values?: TranslationValues) => string) {
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

function App() {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)
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

      const loginData = (await loginResponse.json()) as { accessToken: string; user: User }
      const projectsResponse = await fetch(`${apiBaseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${loginData.accessToken}` },
      })

      if (!projectsResponse.ok) {
        throw new Error(t('error.projectsFailed'))
      }

      const projectData = (await projectsResponse.json()) as Project[]
      setToken(loginData.accessToken)
      setUser(loginData.user)
      setProjects(projectData)
      setSelectedProjectId(projectData[0]?.id ?? null)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t('error.unexpectedLogin'))
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
      <I18nContext.Provider value={i18nValue}>
        <main className="auth-page">
          <aside className="auth-brand">
            <span className="sz-wordmark sz-wordmark--lg">Semraz<i>.</i></span>
            <p className="eyebrow">{t('auth.eyebrow')}</p>
            <h1>{t('auth.title')}</h1>
            <p className="auth-copy">{t('auth.copy')}</p>
            <ol className="auth-pipeline">
              {flowSteps.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {t(step)}
                </li>
              ))}
            </ol>
          </aside>
          <section className="auth-panel">
            <div className="auth-panel-header">
              <p className="eyebrow">{t('auth.eyebrow')}</p>
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
            </form>
          </section>
        </main>
      </I18nContext.Provider>
    )
  }

  return (
    <I18nContext.Provider value={i18nValue}>
      <main className="app-shell">
        <aside className="app-sidebar">
          <div className="sidebar-brand">
            <span className="sz-wordmark sz-wordmark--chip">Semraz<i>.</i></span>
          </div>
          <nav className="sidebar-nav">
            <button
              className={isCreating ? 'sidebar-nav-item' : 'sidebar-nav-item active'}
              type="button"
              onClick={() => setIsCreating(false)}
            >
              <span className="sidebar-nav-dot" />
              {t('topbar.workspaces')}
            </button>
            <button
              className={isCreating ? 'sidebar-nav-item active' : 'sidebar-nav-item'}
              type="button"
              onClick={startCreateFlow}
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
                <span className="sidebar-user-role">
                  {t('topbar.authenticatedAs', { role: user.role })}
                </span>
              </div>
            </div>
            <button className="sidebar-logout" type="button" onClick={handleLogout}>
              {t('topbar.logout')}
            </button>
          </div>
        </aside>
        <section className="workspace">
          <header className="topbar">
            <div className="topbar-context">
              <p className="eyebrow">
                {isCreating ? t('flow.eyebrow') : t('topbar.authenticatedAs', { role: user.role })}
              </p>
              <h1>{isCreating ? t('topbar.newApp') : t('topbar.workspaces')}</h1>
            </div>
          </header>

          <div className="workspace-body">
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
          </div>
        </section>
      </main>
    </I18nContext.Provider>
  )
}

type DashboardProps = {
  projects: Project[]
  selectedProject?: Project
  onNewBackend: () => void
  onSelectProject: (projectId: string) => void
}

function Dashboard({ projects, selectedProject, onNewBackend, onSelectProject }: DashboardProps) {
  const { t } = useI18n()

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
          <button
            key={project.id}
            className={project.id === selectedProject?.id ? 'project-card selected' : 'project-card'}
            type="button"
            onClick={() => onSelectProject(project.id)}
          >
            <span className={`status ${project.status}`}>{t(`status.${project.status}`)}</span>
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
              <p className="eyebrow">
                {t('dashboard.target', { framework: selectedProject.framework })}
              </p>
              <h2>{selectedProject.name}</h2>
            </div>
            <span className={`status ${selectedProject.status}`}>
              {t(`status.${selectedProject.status}`)}
            </span>
          </div>

          <div className="metrics">
            <div>
              <span>{selectedProject.metrics.entities}</span>
              {t('dashboard.entities')}
            </div>
            <div>
              <span>{selectedProject.metrics.operations}</span>
              {t('dashboard.operations')}
            </div>
            <div>
              <span>{selectedProject.metrics.tests}</span>
              {t('dashboard.tests')}
            </div>
          </div>

          <div className="spec-panel">
            <h3>{t('dashboard.skillsDraft')}</h3>
            <pre>{t('dashboard.specPreview', { projectName: selectedProject.name })}</pre>
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
  const { language, t } = useI18n()
  const isLastStep = flowStep === flowSteps.length - 1
  const [entities, setEntities] = useState<ErdEntity[]>(initialEntities)
  const [relations, setRelations] = useState<ErdRelation[]>(initialRelations)
  const [operations, setOperations] = useState<BackendOperation[]>(() =>
    createDefaultOperations(initialEntities, t),
  )
  const [isNestJsAppReady, setIsNestJsAppReady] = useState(false)
  const [isAiWizardOpen, setIsAiWizardOpen] = useState(false)
  const [isAiApplying, setIsAiApplying] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const mustCreateNestJsApp = flowStep === 4 && !isNestJsAppReady
  const canUseAiWizard = flowStep < 4

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
      const missingDefaults = createDefaultOperations(entities, t).filter(
        (operation) => !operationIds.has(operation.id),
      )

      return [...activeOperations, ...missingDefaults]
    })
  }, [entities, t])

  useEffect(() => {
    setIsNestJsAppReady(false)
  }, [draftProject, relations, operations])

  useEffect(() => {
    if (!canUseAiWizard) {
      setIsAiWizardOpen(false)
    }
  }, [canUseAiWizard])

  async function applyAiDraft() {
    const step = flowStep === 0 ? 'project' : flowStep === 1 ? 'planning' : flowStep === 2 ? 'erd' : 'operations'

    setIsAiApplying(true)
    setAiError(null)

    const abortController = new AbortController()
    const timeoutId = window.setTimeout(() => abortController.abort(), aiWizardTimeoutMs)

    try {
      const response = await fetch(`${apiBaseUrl}/api/ai/wizard`, {
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
                : { step, language, project: draftProject, entities, relations },
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
      setAiError(error instanceof Error && error.name === 'AbortError' ? t('ai.timeout') : error instanceof Error ? error.message : t('ai.failed'))
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

  return (
    <section className="flow-shell">
      <div className="flow-header">
        <div>
          <p className="eyebrow">{t('flow.eyebrow')}</p>
          <h2>{t(flowSteps[flowStep])}</h2>
        </div>
        <div className="flow-header-actions">
          {canUseAiWizard ? (
            <button
              className="wizard-button"
              type="button"
              onClick={() => setIsAiWizardOpen((isOpen) => !isOpen)}
            >
              {isAiWizardOpen ? t('ai.close') : t('ai.open')}
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={onCancel}>
            {t('flow.close')}
          </button>
        </div>
      </div>

      <div className="flow-progress" aria-label={t('flow.progress')}>
        {flowSteps.map((step, index) => (
          <button
            key={step}
            className={index === flowStep ? 'active' : index < flowStep ? 'done' : ''}
            disabled={index > flowStep}
            type="button"
            onClick={() => onGoToStep(index)}
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
            relations={relations}
            operations={operations}
            onNestJsAppReadyChange={setIsNestJsAppReady}
          />
        ) : null}
        {flowStep === 5 ? <TestStep draftProject={draftProject} /> : null}
      </div>

      <footer className="flow-actions">
        <button className="ghost-button" type="button" onClick={flowStep === 0 ? onCancel : onBack}>
          {flowStep === 0 ? t('flow.cancel') : t('flow.back')}
        </button>
        <button type="button" disabled={mustCreateNestJsApp} onClick={isLastStep ? onFinish : onNext}>
          {isLastStep ? t('flow.finish') : t('flow.next')}
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
  const { t } = useI18n()

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>{t('project.basics')}</h3>
        <div className="field-grid">
          <label>
            {t('project.name')}
            <input
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
              value={draftProject.description}
              onChange={(event) =>
                onChangeDraft({ ...draftProject, description: event.target.value })
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
          <button
            type="button"
            onClick={() =>
              onChangeDraft({
                ...draftProject,
                planning: {
                  purpose: t('planning.scaffoldPurpose'),
                  constraints: t('planning.scaffoldConstraints'),
                },
              })
            }
          >
            {t('planning.scaffold')}
          </button>
        </div>
        <label>
          {t('planning.purpose')}
          <textarea
            value={draftProject.planning.purpose}
            onChange={(event) => updatePlanning('purpose', event.target.value)}
          />
        </label>
        <label>
          {t('planning.constraints')}
          <textarea
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
        <h3>{t('planning.checks')}</h3>
        <ul className="check-list compact">
          <li>{t('planning.checkPurpose')}</li>
          <li>{t('planning.checkConstraints')}</li>
          <li>{t('planning.checkCompile')}</li>
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

const initialEntities: ErdEntity[] = [
  {
    id: 'customer',
    name: 'Customer',
    x: 128,
    y: 230.4,
    fields: [
      { id: 'customer_id', name: 'id', type: 'uuid', isPrimaryKey: true, isNotNull: true },
      { id: 'customer_email', name: 'email', type: 'string', isPrimaryKey: false, isNotNull: true },
    ],
  },
  {
    id: 'order',
    name: 'Order',
    x: 608,
    y: 384,
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
    x: 1072,
    y: 211.2,
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
      },
    ]
  })
}

function normalizeAiEntities(aiEntities: ErdEntity[]): ErdEntity[] {
  return aiEntities.map((entity, entityIndex) => {
    const entityId = normalizeId(entity.id || entity.name || `entity_${entityIndex + 1}`)
    const fields: ErdField[] = (entity.fields?.length ? entity.fields : [])
      .map((field, fieldIndex) => {
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
      })

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
      id: entityId,
      name: entity.name || toPascalLabel(entityId),
      x: Number.isFinite(entity.x) ? entity.x : 160 + (entityIndex % 3) * 420,
      y: Number.isFinite(entity.y) ? entity.y : 180 + Math.floor(entityIndex / 3) * 320,
      fields,
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
      requestedOwnerId === sourceId || requestedOwnerId === targetId ? requestedOwnerId : inferredOwnerId
    const referencedEntityId = foreignKeyOwnerId === sourceId ? targetId : sourceId
    const referencedEntity = entityById.get(referencedEntityId)
    const ownerEntityIndex = sanitizedEntities.findIndex((entity) => entity.id === foreignKeyOwnerId)

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
        resolveEntityId(field.referencesEntityId) || inferReferencedEntityIdFromField(field.name, entity.id)

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

function normalizeAiOperations(aiOperations: BackendOperation[], entities: ErdEntity[]): BackendOperation[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))

  return aiOperations
    .filter((operation) => entityById.has(operation.entityId))
    .map((operation, index) => {
      const entity = entityById.get(operation.entityId)
      const fieldIds = new Set(entity?.fields.map((field) => field.id) ?? [])
      const writableFieldIds = entity?.fields
        .filter((field) => !field.isPrimaryKey)
        .map((field) => field.id) ?? []
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
        requestFieldIds: (operation.requestFieldIds ?? operation.payloadFieldIds ?? writableFieldIds).filter(
          (fieldId) => fieldIds.has(fieldId),
        ),
        responseFieldIds: (operation.responseFieldIds ?? responseFieldIds).filter((fieldId) =>
          fieldIds.has(fieldId),
        ),
        requestCustomFields: normalizeCustomFields(operation.requestCustomFields ?? []),
        responseCustomFields: normalizeCustomFields(operation.responseCustomFields ?? []),
        description: operation.description || '',
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
        name: `Entity${nextIndex}`,
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
      return { x: (clientX - canvasPan.x) / canvasZoom, y: (clientY - canvasPan.y) / canvasZoom }
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
    const target = event.target as HTMLElement

    if (
      panStateRef.current?.moved ||
      target.closest('.entity-node, .relation-builder, .erd-toolbar, button, input, select, textarea, label')
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
                <strong>{selectedEntity.name}</strong>
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
              <marker id="arrow-end" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                <path d="M0,0 L8,4 L0,8 Z" />
              </marker>
              <marker id="arrow-start" markerHeight="8" markerWidth="8" orient="auto" refX="1" refY="4">
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
        <span className="entity-drag-handle" aria-label={t('erd.dragEntity', { name: entity.name })}>
          {t('erd.drag')}
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
              aria-label={t('erd.columnName', { entity: entity.name, field: field.name })}
              value={field.name}
              onChange={(event) => onUpdateField(entity.id, field.id, { name: event.target.value })}
            />
            <select
              aria-label={t('erd.columnType', { entity: entity.name, field: field.name })}
              value={field.type}
              onChange={(event) =>
                onUpdateField(entity.id, field.id, { type: event.target.value as FieldType })
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
        label: t('ops.customAction', { count: customCount }),
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
        description: t('ops.customActionDescription', { entity: selectedEntity.name }),
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
                        updateOperation(operation.id, { enabled: event.target.checked })
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
                      value={operation.label}
                      onChange={(event) =>
                        updateOperation(operation.id, { label: event.target.value })
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
                      value={operation.path}
                      onChange={(event) =>
                        updateOperation(operation.id, { path: event.target.value })
                      }
                    />
                  </label>
                  <label className="operation-description-field">
                    {t('ops.description')}
                    <textarea
                      value={operation.description ?? ''}
                      onChange={(event) =>
                        updateOperation(operation.id, { description: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="payload-picker">
                  <div className="field-tab-list" role="tablist" aria-label={t('ops.fieldDirection')}>
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
                      <button
                        type="button"
                        onClick={() => addCustomField(operation, fieldTab)}
                      >
                        {t('ops.addField')}
                      </button>
                    </div>
                    {customFields(operation, fieldTab).map((field) => (
                      <div className="custom-field-row" key={field.id}>
                        <input
                          aria-label={t('ops.customFieldName')}
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
  const { t } = useI18n()
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
        throw new Error(t('error.workspaceFailed'))
      }

      const workspaceData = (await response.json()) as GenerateWorkspace
      setWorkspace(workspaceData)
      setAgentResult(null)
      setTerminalLines([
        makeTerminalLine('success', t('generate.snapshotCreated')),
        makeTerminalLine('idle', workspaceData.workspacePath),
        makeTerminalLine('success', t('generate.wroteInputs', { files: workspaceData.files.join(', ') })),
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
      makeTerminalLine('running', t('generate.startAgent')),
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
          t('generate.finalBuild', {
            status: result.build?.success ? t('generate.passed') : t('generate.failed'),
          }),
        ),
        ...buildSummaryLines,
        makeTerminalLine('success', t('generate.generatedApp', { path: result.appPath })),
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
            {workspace?.workspaceId ?? (isGeneratingWorkspace ? t('generate.creating') : t('generate.notCreated'))}
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
              disabled={isGeneratingWorkspace}
              onClick={() => {
                hasRequestedWorkspace.current = true
                void createWorkspaceSnapshot()
              }}
            >
              {isGeneratingWorkspace ? t('generate.creating') : t('generate.createWorkspace')}
            </button>
            <button
              type="button"
              disabled={!workspace || isRunningAgent}
              onClick={() => runNestJsAgent()}
            >
              {isRunningAgent ? t('generate.creating') : t('generate.createNest')}
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
  const { t } = useI18n()

  return (
    <div className="flow-grid">
      <section className="flow-panel">
        <h3>{t('test.report')}</h3>
        <div className="metrics">
          <div>
            <span>12</span>
            {t('test.passing')}
          </div>
          <div>
            <span>0</span>
            {t('test.failing')}
          </div>
          <div>
            <span>82%</span>
            {t('test.coverage')}
          </div>
        </div>
        <p className="muted-copy">
          {t('test.ready', { framework: draftProject.framework })}
        </p>
      </section>
      <section className="flow-panel">
        <h3>{t('test.restClient')}</h3>
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
