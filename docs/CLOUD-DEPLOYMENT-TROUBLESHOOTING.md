# Cloud Run 배포 문제 해결 가이드

## 🚀 배포 전 확인사항

### 1. GCP 프로젝트 설정

```bash
# GCP 프로젝트 ID 설정
gcloud config set project newerp-8b277

# 현재 프로젝트 확인
gcloud config get-value project
```

### 2. 필수 API 활성화

```bash
# Cloud Run API
gcloud services enable run.googleapis.com

# Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Container Registry API
gcloud services enable containerregistry.googleapis.com

# Firestore API
gcloud services enable firestore.googleapis.com

# Storage API
gcloud services enable storage-api.googleapis.com
```

### 3. 환경 변수 설정 (Cloud Run)

[GCP 콘솔](https://console.cloud.google.com) → Cloud Run → 서비스 선택 → "수정 및 배포" → "환경 변수" 탭:

```
FIREBASE_API_KEY = [your-api-key]
FIREBASE_AUTH_DOMAIN = [your-project].firebaseapp.com
FIREBASE_PROJECT_ID = newerp-8b277
FIREBASE_STORAGE_BUCKET = [your-project].appspot.com
FIREBASE_MESSAGING_SENDER_ID = [your-sender-id]
FIREBASE_APP_ID = [your-app-id]
NODE_ENV = production
```

---

## ❌ 문제 및 해결책

### 문제 1: Firestore API 비활성화

**증상:**
```
Error: Could not load Cloud Firestore
permission-denied: Missing or insufficient permissions
```

**원인:**
- GCP 프로젝트에서 Firestore API가 비활성화됨
- Firestore Database가 생성되지 않음

**해결책:**
```
1. GCP 콘솔 접속 → https://console.cloud.google.com
2. 왼쪽 메뉴 → "API 및 서비스" → "라이브러리"
3. "Firestore" 검색
4. "Cloud Firestore API" 선택
5. "사용(ENABLE)" 버튼 클릭
6. 3~5분 대기

또는 CLI 사용:
$ gcloud services enable firestore.googleapis.com
```

---

### 문제 2: Firestore 보안 규칙 (permission-denied)

**증상:**
```
permission-denied: Missing or insufficient permissions.
```

**원인:**
- Firestore Security Rules가 읽기/쓰기를 거부함
- Rules가 배포되지 않음

**해결책:**

**Step 1: Firebase 콘솔에서 Rules 확인**
```
1. https://console.firebase.google.com 접속
2. "Firestore Database" 클릭
3. "Rules" 탭 클릭
```

**Step 2: 개발 단계 규칙 적용**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 모든 사용자는 모든 데이터 읽기/쓰기 가능 (개발 단계)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Step 3: Rules 배포**
```
1. 위 규칙 복사 → Firebase 콘솔의 Rules 에디터에 붙여넣기
2. "게시(Publish)" 버튼 클릭
3. 배포 완료 메시지 확인
```

**또는 CLI 사용:**
```bash
# 규칙 파일 생성 (firestore.rules)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

# 배포
firebase deploy --only firestore:rules
```

---

### 문제 3: Cloud Run 환경 변수 누락

**증상:**
```
Firebase config is empty
```

**원인:**
- Cloud Run 서비스의 환경 변수가 설정되지 않음
- api/server.js에서 .env 값을 읽을 수 없음

**해결책:**

**방법 1: GCP 콘솔에서 설정**
```
1. GCP 콘솔 → Cloud Run → 서비스 선택
2. "새 수정본 배포" 클릭
3. "환경 변수" 섹션 확장
4. 모든 FIREBASE_* 변수 입력
5. "배포" 클릭
```

**방법 2: gcloud CLI 사용**
```bash
gcloud run deploy deux-erp \
  --set-env-vars FIREBASE_API_KEY=xxx,\
FIREBASE_AUTH_DOMAIN=yyy,\
FIREBASE_PROJECT_ID=zzz,\
FIREBASE_STORAGE_BUCKET=aaa,\
FIREBASE_MESSAGING_SENDER_ID=bbb,\
FIREBASE_APP_ID=ccc
```

**방법 3: .env 파일 사용 (로컬 배포 시)**
```bash
# .env.production 파일 생성
FIREBASE_API_KEY=xxx
FIREBASE_AUTH_DOMAIN=yyy
...

# 배포
gcloud run deploy deux-erp --source .
```

---

### 문제 4: Cloud Storage 권한 오류

**증상:**
```
storage.googleapis.com: permission-denied
```

**원인:**
- Cloud Storage Bucket 권한 설정 부족
- CORS 설정 누락

**해결책:**

**Step 1: Cloud Storage 권한 설정**
```
GCP 콘솔 → Cloud Storage → Buckets
→ [your-bucket].appspot.com 선택
→ "권한" 탭 → IAM 정책 수정

필요한 역할:
- Cloud Run 서비스 계정: "Storage 객체 생성자", "Storage 객체 뷰어"
```

**Step 2: CORS 설정**
```bash
# cors.json 파일 생성
[
  {
    "origin": ["https://[your-domain]", "http://localhost:8080"],
    "method": ["GET", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]

# 적용
gsutil cors set cors.json gs://[your-bucket].appspot.com
```

---

### 문제 5: 데이터 조회/입력이 안 됨

**증상:**
```
- 새 항목 추가 버튼 클릭 → 반응 없음
- CSV 업로드 → 데이터가 저장되지 않음
- 테이블에 데이터 표시 안 됨
```

**원인:**
- Firestore 연결 실패
- 인증 토큰 만료
- 브라우저 캐시

**해결책:**

**Step 1: Firestore 연결 테스트**
```javascript
// 브라우저 개발자 도구 → Console에서 실행
firebase.firestore().collection('prices').doc('settings').get()
  .then(doc => {
    console.log('✅ 연결 성공:', doc.data());
  })
  .catch(err => {
    console.error('❌ 연결 실패:', err.code, err.message);
  });
```

**Step 2: 인증 상태 확인**
```javascript
firebase.auth().currentUser
  ? console.log('✅ 로그인됨:', firebase.auth().currentUser.email)
  : console.log('❌ 로그아웃 상태');
```

**Step 3: 브라우저 캐시 삭제**
```
1. 개발자 도구 → 우측 상단 ⋮ 아이콘
2. "더 많은 도구" → "개발자 도구 설정"
3. "Network conditions" → "Disable cache (while DevTools is open)" 체크
4. 페이지 새로고침 (Ctrl+Shift+R)
```

**Step 4: 로그아웃 후 재로그인**
```
1. 우측 상단 로그아웃 버튼 클릭
2. 로그인 페이지에서 다시 로그인
3. 기능 테스트
```

---

### 문제 6: CSV 기능이 작동하지 않음

**증상:**
```
- "📤 CSV 업로드" 버튼 → 클릭 반응 없음
- "📥 양식 다운로드" → 파일 다운로드 안 됨
```

**원인:**
- CSP(Content Security Policy) 위반
- JavaScript 로딩 실패
- 이벤트 리스너 미등록

**해결책:**

**Step 1: 콘솔 에러 확인**
```
개발자 도구 → Console 탭
→ 빨간색 에러 메시지 확인 및 스크린샷
```

**Step 2: 네트워크 확인**
```
개발자 도구 → Network 탭
→ 모든 js/modules/*.js 파일이 200 상태인지 확인
→ Failed 파일이 있으면 스크린샷
```

**Step 3: 버튼 클릭 테스트 (Console)**
```javascript
// 수동으로 함수 호출
window.ProductRatesModule.downloadTemplate()

// 에러 발생 시 스택 트레이스 확인
```

---

### 문제 7: "필수항목 설정", "표시항목 설정" 미동작

**증상:**
```
"⚙️ 필수항목 설정" → 클릭 후 아무것도 안 나타남
"📋 표시항목 설정" → 클릭 후 아무것도 안 나타남
```

**원인:**
- Utils.js 로딩 실패
- openModal 함수 호출 실패
- sessionStorage 접근 불가

**해결책:**

**Step 1: Utils 로딩 확인**
```javascript
// Console에서 확인
window.Utils
  ? console.log('✅ Utils 로드됨')
  : console.log('❌ Utils 미로드');

// 함수 확인
typeof window.Utils.openDisplayFieldsModal === 'function'
  ? console.log('✅ 함수 존재')
  : console.log('❌ 함수 미존재');
```

**Step 2: 모달 테스트**
```javascript
window.Utils.openModal('테스트', '<p>모달 테스트</p>', null, '닫기');
```

**Step 3: sessionStorage 확인**
```javascript
sessionStorage.getItem('productRates_displayFields')
  ? console.log('✅ 저장됨')
  : console.log('❌ 미저장');
```

---

## ✅ 배포 후 확인사항

```
☑️ GCP 콘솔에서 Firestore API 활성화 완료
☑️ Firebase 콘솔에서 Firestore Rules 배포 완료
☑️ Cloud Run 환경 변수 설정 완료
☑️ Cloud Storage CORS 설정 완료
☑️ Cloud Run 서비스 상태: Running
☑️ 앱 URL 접속 가능
☑️ 로그인 성공
☑️ 새 항목 추가 동작 확인
☑️ CSV 업로드/다운로드 동작 확인
☑️ 필수항목/표시항목 설정 동작 확인
```

---

## 🔗 유용한 링크

- [GCP 콘솔](https://console.cloud.google.com)
- [Firebase 콘솔](https://console.firebase.google.com)
- [Cloud Run 문서](https://cloud.google.com/run/docs)
- [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/start)
- [Cloud Storage 문서](https://cloud.google.com/storage/docs)

---

## 📞 추가 지원

위 해결책으로도 문제가 해결되지 않으면:

1. **에러 메시지 스크린샷** 촬영
2. **브라우저 콘솔 로그** 복사
3. **GCP/Firebase 콘솔 설정 스크린샷** 촬영
4. 위 정보들을 함께 문의
