# 로컬 개발 환경 설정

## 1. 사전 요구사항

```bash
# Node.js 18 이상 설치 확인
node --version    # v18.0.0 이상
npm --version     # 8.0.0 이상

# Git 설치 확인
git --version     # 2.0.0 이상
```

---

## 2. 프로젝트 설정

### 2.1 저장소 클론

```bash
git clone https://github.com/chowk7/deux-NewErp.git
cd deux-NewErp
```

### 2.2 Node.js 패키지 설치

```bash
cd api
npm install
cd ..
```

### 2.3 환경 변수 설정

**`.env.local` 파일 생성** (프로젝트 루트):

```env
# Firebase 설정
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=newerp-8b277
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Cloud Run 설정 (선택사항)
NODE_ENV=development
PORT=8080
```

**Firebase 프로젝트 설정에서 값 확인하기:**
1. [Firebase 콘솔](https://console.firebase.google.com) 접속
2. 프로젝트 설정 (⚙️ 아이콘)
3. "일반" 탭의 "웹 앱" 섹션에서 `firebaseConfig` 객체의 값 복사

---

## 3. 로컬 서버 실행

### 3.1 Express 백엔드 실행

```bash
cd api
npm start
```

출력 예시:
```
Server running at http://localhost:8080
```

### 3.2 다른 터미널에서 프론트엔드 접속

```bash
# 웹 브라우저에서 열기
http://localhost:8080
```

---

## 4. Firestore 로컬 에뮬레이터 (선택)

### 4.1 Firebase CLI 설치

```bash
npm install -g firebase-tools
```

### 4.2 에뮬레이터 시작

```bash
firebase emulators:start --project=newerp-8b277
```

출력 예시:
```
┌─────────────────────────────────────────────────────────┐
│ ✔  Emulator Suite started at http://localhost:4000      │
├─────────────────────────────────────────────────────────┤
│ ✔  Firestore Emulator running on 127.0.0.1:8080         │
│ ✔  Hosting Emulator running on 127.0.0.1:5000           │
└─────────────────────────────────────────────────────────┘
```

### 4.3 에뮬레이터 연결 설정

`api/server.js`에 다음 코드 추가 (개발 환경에서만):

```javascript
// 로컬 에뮬레이터 사용 (개발 단계)
if (process.env.NODE_ENV === 'development') {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}
```

---

## 5. 문제 해결

### ❌ "Cannot find module 'express'"
```bash
→ cd api 폴더에서 실행했는지 확인
→ npm install 을 실행했는지 확인
→ node_modules 폴더가 생성되었는지 확인
```

### ❌ "EADDRINUSE: address already in use :::8080"
```bash
→ 포트 8080이 이미 사용 중
→ 다른 포트 사용: PORT=3000 npm start
→ 또는 기존 프로세스 종료:
   - Windows: netstat -ano | findstr :8080
   - Mac/Linux: lsof -i :8080
```

### ❌ Firestore 연결 안됨
```
1. Firestore API 활성화 확인
   → GCP 콘솔 → API 및 서비스 → Firestore API

2. 환경 변수 확인
   → .env.local 파일 생성 확인
   → Firebase 프로젝트 ID 정확성 확인

3. 보안 규칙 확인
   → Firebase 콘솔 → Firestore → Rules
   → "allow read, write: if request.auth != null;" 설정 확인
```

### ❌ CORS 오류
```
→ api/server.js의 CORS 설정 확인
→ 'http://localhost:8080' 이 허용된 origin인지 확인
```

---

## 6. 개발 워크플로우

### 단계 1: 로그인
```
http://localhost:8080 접속
→ 회원가입 또는 로그인
→ Firebase 콘솔에서 사용자 생성 가능
```

### 단계 2: 데이터 입력
```
메뉴 → "다이아단가표"
→ "+ 새 항목 추가" 클릭
→ 데이터 입력 → 저장
→ Firestore 콘솔에서 데이터 확인
```

### 단계 3: CSV 기능 테스트
```
"📥 양식 다운로드" → CSV 파일 다운로드
"📤 CSV 업로드" → 파일 선택 → 데이터 확인
```

### 단계 4: 필수항목/표시항목 설정
```
"⚙️ 필수항목 설정" → 필드 선택 → 저장
"📋 표시항목 설정" → 컬럼 선택 → 저장
```

---

## 7. 코드 수정 후 테스트

### 프론트엔드 변경
```bash
1. js/modules/ 또는 css/ 파일 수정
2. 브라우저 새로고침 (Ctrl+R 또는 Cmd+R)
3. 개발자 도구 Console에서 에러 확인
```

### 백엔드 변경
```bash
1. api/server.js 또는 api/ 파일 수정
2. npm start 종료 (Ctrl+C)
3. npm start 다시 실행
4. 브라우저 새로고침
```

---

## 8. 유용한 명령어

```bash
# 프로젝트 상태 확인
git status

# 변경 사항 조회
git diff

# 커밋 이력 조회
git log --oneline -10

# 변경 사항 스테이징
git add .

# 커밋 생성
git commit -m "메시지"

# 원격 저장소에 푸시
git push origin claude/diamond-jewelry-webapp-xiVe2

# 의존성 업데이트 (주의)
npm update
```

---

## 9. 체크리스트

- [ ] Node.js 18+ 설치 확인
- [ ] .env.local 파일 생성 및 Firebase 설정값 입력
- [ ] `npm install` 완료
- [ ] `npm start` 실행 성공
- [ ] http://localhost:8080 접속 가능
- [ ] 로그인 성공
- [ ] Firestore 데이터 입력/조회 성공
- [ ] 브라우저 개발자 도구 Console에 에러 없음

---

## 🔗 참고 자료

- [Node.js 다운로드](https://nodejs.org/)
- [Firebase 문서](https://firebase.google.com/docs)
- [Express.js 문서](https://expressjs.com/)
- [Git 가이드](https://git-scm.com/doc)
