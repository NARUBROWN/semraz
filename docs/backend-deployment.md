# Backend deployment

`main` 브랜치의 백엔드 파일이 변경되면 GitHub Actions가 먼저 깨끗한 환경에서
백엔드를 빌드한다. 빌드가 성공한 경우에만 운영 서버에 SSH로 접속해 서버 내부의
`scripts/deploy-backend.sh`를 실행한다. 프론트엔드만 변경된 커밋은 이 워크플로를
실행하지 않는다.

## 서버 최초 설정

Node.js와 PM2를 설치하고 저장소를 한 번 clone한다.

OpenAI 코드 생성 요청은 기본적으로 호출당 180초를 기다리고 최대 2회
재시도한다. 더 긴 생성 작업이 필요하면 PM2 환경에 다음 값을 설정할 수 있다.

```bash
OPENAI_TIMEOUT_MS=300000
OPENAI_MAX_RETRIES=2
```

```bash
git clone https://github.com/NARUBROWN/semraz.git ~/semraz
cd ~/semraz
npm install -g pm2
chmod +x scripts/deploy-backend.sh
cp /path/to/production.env .env
./scripts/deploy-backend.sh
pm2 startup
```

`pm2 startup`이 출력하는 명령을 한 번 실행해야 서버 재부팅 후에도 프로세스가
자동으로 복구된다. 비공개 저장소라면 서버가 `git pull`할 수 있도록 deploy key
또는 GitHub 인증도 설정한다.

## GitHub Environment 및 Secrets

GitHub 저장소의 `Settings > Environments > production`에 다음 Secrets를 만든다.

- `SSH_HOST`: 운영 서버 주소
- `SSH_PORT`: SSH 포트(일반적으로 `22`)
- `SSH_USER`: 배포용 SSH 사용자
- `SSH_PRIVATE_KEY`: 배포용 개인 키 전체 내용
- `SSH_KNOWN_HOSTS`: `ssh-keyscan -H <host>` 결과. 서버에서 직접 확인한 host key와 대조한 값을 사용한다.
- `DEPLOY_SCRIPT_PATH`: 서버의 절대 경로. 예: `/home/deploy/semraz/scripts/deploy-backend.sh`

배포 스크립트는 서버 작업 트리에 수정 사항이 있으면 안전을 위해 중단한다. 환경
변수는 Git에 넣지 않고 서버의 저장소 루트 `.env`에 유지한다.
