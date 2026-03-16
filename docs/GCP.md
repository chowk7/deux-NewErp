# GCP 및 Firebase 설정 가이드

이 가이드는 다이아 주얼리 관리 시스템을 위한 GCP 및 Firebase 인프라를 설정하는 방법을 설명합니다.

## 사전 요구사항

1. GCP 계정 (프리 티어 또는 유료)
2. `gcloud` CLI 설치
3. Node.js 14+ 설치
4. Git 설치

## 1단계: GCP 프로젝트 생성

### 1.1 GCP Console에서 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 상단의 프로젝트 선택 드롭다운 → "새 프로젝트"
3. 프로젝트 이름: `diamond-jewelry-erp`
4. "만들기" 클릭
5. 프로젝트가 생성될 때까지 기다립니다 (2-3분)

### 1.2 프로젝트 ID 확인
- 대시보드에서 프로젝트 ID를 복사합니다 (예: `diamond-jewelry-erp-xxxxx`)

## 2단계: 필수 API 활성화

Console에서 다음 API들을 활성화합니다:

```bash
gcloud services enable \
  firestore.googleapis.com \
  storage-api.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  compute.googleapis.com \
  identitytoolkit.googleapis.com
```

또는 GCP Console에서 수동으로 활성화:
1. "API 및 서비스" → "API 라이브러리"
2. 다음 각각을 검색하고 "활성화"를 클릭:
   - Cloud Firestore API
   - Cloud Storage API
   - Cloud Build API
   - Cloud Run API
   - Compute Engine API
   - Firebase Authentication REST API

## 3단계: Firestore 데이터베이스 설정

### 3.1 Firestore 생성
1. GCP Console → "Firestore" 검색
2. "Firestore 만들기" 클릭
3. **모드 선택**: "네이티브 모드" 선택
4. **위치 선택**: `asia-northeast1` (도쿄) 또는 `us-central1` (미국)
5. "Firestore 만들기" 클릭
6. 생성 완료까지 기다립니다 (2-3분)

### 3.2 Firestore 보안 규칙 설정

1. Firestore 콘솔 → "규칙" 탭
2. 다음 규칙을 붙여넣기:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 접근 가능
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. "게시" 클릭

## 4단계: Cloud Storage 설정

### 4.1 스토리지 버킷 생성
1. GCP Console → "Cloud Storage" → "버킷 만들기"
2. **버킷 이름**: `diamond-jewelry-images-{프로젝트ID}` (전역적으로 고유해야 함)
3. **위치**: Firestore와 같은 리전 선택
4. **스토리지 클래스**: "표준" 선택
5. **접근 제어**: "균일" 선택
6. "만들기" 클릭

### 4.2 CORS 설정

터미널에서 CORS 설정 파일을 생성합니다:

```json
[
  {
    "origin": ["https://yourdomain.com", "http://localhost:8000"],
    "method": ["GET", "HEAD", "DELETE", "PUT", "POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

파일을 `cors.json`으로 저장한 후:

```bash
gsutil cors set cors.json gs://diamond-jewelry-images-{프로젝트ID}
```

## 5단계: Firebase Authentication 설정

### 5.1 Firebase 프로젝트 생성 (또는 기존 GCP 프로젝트 연결)

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" → 위에서 생성한 GCP 프로젝트 선택
3. 분석 활성화 여부 선택 (선택사항)
4. "Firebase 프로젝트 만들기" 클릭

### 5.2 이메일/비밀번호 인증 활성화

1. Firebase Console → "Authentication" → "로그인 방법"
2. "이메일/비밀번호" → "활성화" 클릭
3. "저장" 클릭

### 5.3 Firebase 설정 가져오기

1. Firebase Console → "프로젝트 설정" (톱니바퀴 아이콘)
2. "웹앱" 섹션에서 `</>`를 클릭하여 새 앱 생성
3. 앱 등록 → 설정 코드 복사

설정 코드는 다음과 같은 형태입니다:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};
```

## 6단계: 로컬 개발 설정

### 6.1 Firebase 설정 파일 생성

1. 프로젝트 루트에서:

```bash
cp config/firebaseConfig.example.js config/firebaseConfig.js
```

2. `config/firebaseConfig.js`를 열고 위에서 복사한 Firebase 설정을 붙여넣기

### 6.2 GCP 설정 파일 생성

1. GCP Service Account 키 생성:
   - GCP Console → "서비스 계정" → "계정 만들기"
   - 이름: `diamond-jewelry-app`
   - "만들기 및 계속"
   - 역할: "Editor" 선택 (또는 더 제한적인 역할)
   - "계속" → "완료"

2. 키 생성:
   - 방금 생성한 서비스 계정 클릭
   - "키" 탭 → "새 키 추가" → JSON 선택
   - JSON 파일 다운로드

3. 파일을 `config/gcp.json`으로 저장

### 6.3 환경변수 설정

프로젝트 루트에 `.env` 파일 생성:

```env
# Firebase
REACT_APP_FIREBASE_API_KEY=YOUR_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET

# GCP
GCP_STORAGE_BUCKET=diamond-jewelry-images-{프로젝트ID}
NODE_ENV=development
```

## 7단계: Cloud Build 설정

### 7.1 Cloud Build 서비스 계정에 권한 부여

```bash
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --format='table(bindings.role)' \
  --filter="bindings.members:cloudservices"
```

다음 역할을 추가:
- Cloud Run 관리자
- Cloud Build 편집자
- Firestore 사용자
- Storage 객체 관리자

### 7.2 cloudbuild.yaml 생성

프로젝트 루트에 `cloudbuild.yaml` 생성:

```yaml
steps:
  # Install dependencies
  - name: 'gcr.io/cloud-builders/npm'
    dir: 'api'
    args: ['install']

  # Run tests (if available)
  - name: 'gcr.io/cloud-builders/npm'
    dir: 'api'
    args: ['test']

  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/diamond-jewelry-api:$COMMIT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/diamond-jewelry-api:latest'
      - './api'

  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/diamond-jewelry-api:$COMMIT_SHA'

  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gke-deploy'
    args:
      - 'run'
      - '--filename=.'
      - '--image=gcr.io/$PROJECT_ID/diamond-jewelry-api:$COMMIT_SHA'
      - '--location=asia-northeast1'

images:
  - 'gcr.io/$PROJECT_ID/diamond-jewelry-api:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/diamond-jewelry-api:latest'

substitutions:
  _REGION: 'asia-northeast1'
```

### 7.3 Cloud Build 트리거 생성

1. GCP Console → "Cloud Build" → "트리거"
2. "트리거 만들기"
3. GitHub 리포지토리 연결
4. 리포지토리 선택 및 브랜치 선택: `claude/diamond-jewelry-webapp-xiVe2`
5. 빌드 구성: 사용 `cloudbuild.yaml`
6. 저장

## 8단계: Dockerfile 생성

`api/Dockerfile` 생성:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
```

## 9단계: 첫 배포

### 9.1 로컬 테스트

```bash
cd api
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속하여 앱이 작동하는지 확인

### 9.2 Git Push로 자동 배포

```bash
git add .
git commit -m "Initial project setup with GCP/Firebase configuration"
git push origin claude/diamond-jewelry-webapp-xiVe2
```

Cloud Build가 자동으로 배포를 시작합니다.

### 9.3 배포 상태 확인

```bash
gcloud builds list --limit=5

# 특정 빌드 상세 정보
gcloud builds log BUILD_ID --stream
```

## 10단계: 운영

### 로그 확인

```bash
gcloud run logs read diamond-jewelry-api --limit=50
```

### 스케일 조정

Cloud Run 콘솔에서:
1. 서비스 선택
2. "YAML 편집"
3. `maxInstances` 조정 (기본값: 100)

## 문제 해결

### 1. Firestore 접근 거부 오류

**해결책:**
- 보안 규칙이 올바른지 확인
- Firestore Console → "규칙" 탭에서 테스트

```firestore
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### 2. Cloud Storage CORS 오류

**해결책:**
```bash
# CORS 설정 확인
gsutil cors get gs://bucket-name

# CORS 설정 다시 적용
gsutil cors set cors.json gs://bucket-name
```

### 3. Cloud Build 실패

**해결책:**
1. Build 로그 확인: `gcloud builds log BUILD_ID`
2. Cloud Build 서비스 계정 권한 확인
3. `cloudbuild.yaml` 문법 확인

### 4. Cloud Run 배포 실패

**해결책:**
1. Docker 이미지 빌드 확인
2. 환경변수 설정 확인
3. 포트가 8080으로 설정되어 있는지 확인

## 참고 자료

- [GCP 공식 문서](https://cloud.google.com/docs)
- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Cloud Run 배포 가이드](https://cloud.google.com/run/docs)
- [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/start)
