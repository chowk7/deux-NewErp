# Firestore 활성화 및 보안 규칙 설정 가이드

## 1. Cloud Firestore API 활성화 (필수)

### GCP 콘솔에서 활성화하기

1. **GCP 콘솔 접속**
   - https://console.cloud.google.com 에 접속
   - 프로젝트: `newerp-8b277` (또는 당신의 프로젝트명) 선택

2. **Firestore API 활성화**
   - 좌측 메뉴 → "API 및 서비스" → "라이브러리" 클릭
   - 검색창에 "Firestore" 입력
   - "Cloud Firestore API" 선택
   - **"사용(ENABLE)" 버튼 클릭**
   - ⏱️ 활성화까지 3~5분 소요

3. **활성화 확인**
   ```
   API 및 서비스 → 활성화된 API
   → "Cloud Firestore API" 가 목록에 표시되는지 확인
   ```

---

## 2. Firestore 보안 규칙 설정

### Firebase 콘솔에서 규칙 설정하기

1. **Firebase 콘솔 접속**
   - https://console.firebase.google.com 에 접속
   - 프로젝트 선택

2. **Firestore 규칙 수정**
   - 좌측 메뉴 → "Firestore Database"
   - "Rules" 탭 클릭
   - 기존 규칙을 아래 내용으로 **전체 교체**

### 개발 단계 규칙 (테스트용)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 모든 사용자는 모든 데이터 읽기/쓰기 가능
    // 개발 단계에서만 사용, 프로덕션에서는 더 엄격한 규칙 필요
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 프로덕션 규칙 (권장)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 접근 가능
    match /prices/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /sales/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. **규칙 배포**
   - 수정 완료 후 **"게시(Publish)" 버튼 클릭**
   - 배포 완료 메시지 확인

---

## 3. 문제 해결

### ❌ "permission-denied" 오류 계속 발생
```
1. Firestore Rules가 "allow read, write: if true" 인지 확인
2. Rules 탭에서 "게시" 버튼을 클릭했는지 확인
3. 브라우저 새로고침 (Ctrl+Shift+R 또는 Cmd+Shift+R)
```

### ❌ "RESOURCE_EXHAUSTED" 오류
```
→ Firestore 할당량 초과
→ Google Cloud 콘솔 → Quotas 에서 확인
→ 프로덕션 프로젝트는 유료 결제 설정 필요
```

### ❌ "service cloud.firestore could not be started"
```
→ Firestore API가 아직 비활성화 상태
→ GCP 콘솔에서 "사용(ENABLE)" 버튼 클릭
→ 3~5분 후 다시 시도
```

### ✅ 연결 확인 방법

브라우저 개발자 도구 → Console 탭에서:

```javascript
// Firestore 연결 테스트
firebase.firestore().collection('prices').doc('settings').get()
  .then(doc => {
    console.log('✅ Firestore 연결 성공:', doc.data());
  })
  .catch(err => {
    console.error('❌ Firestore 연결 실패:', err.code, err.message);
  });
```

---

## 4. 컬렉션 초기 구조 (선택사항)

Firestore 콘솔에서 아래 컬렉션들을 수동으로 생성하거나, 앱에서 데이터 입력 시 자동으로 생성됩니다.

```
prices/
  ├── diamondRates/
  │   └── items/ (다이아단가 데이터)
  ├── productRates/
  │   └── items/ (제품단가 데이터)
  ├── optionCharges/
  │   └── items/ (옵션추가금액 데이터)
  └── settings/ (금시세 등 공통 설정)

sales/
  ├── orders/
  │   └── items/ (매출표 데이터)
  ├── manufacturingCosts/
  │   └── items/ (제조원가표 데이터)
  ├── orderManagement/
  │   └── items/ (주문관리 데이터)
  ├── adminExpenses/
  │   └── items/ (판관비 데이터)
  └── profitLoss/
      └── items/ (P&L 데이터)
```

---

## 5. 기능별 필요 권한

| 기능 | 필요 권한 |
|------|----------|
| 데이터 조회 | read |
| 새 항목 추가 | write, create |
| 항목 수정 | write |
| 항목 삭제 | delete |
| CSV 업로드 | write, create |
| 필수항목/표시항목 설정 저장 | write |

---

## ✅ 확인 체크리스트

- [ ] GCP 콘솔에서 Firestore API 활성화 완료
- [ ] Firebase 콘솔에서 Firestore Rules 게시 완료
- [ ] 브라우저 개발자 도구 Console에서 연결 테스트 성공
- [ ] 앱 새로고침 후 로그인
- [ ] "새 항목 추가" 버튼 클릭 → 폼 나타남
- [ ] 데이터 입력 후 저장 → 테이블에 표시됨
- [ ] CSV 업로드 → 모달 나타남
- [ ] 필수항목/표시항목 설정 → 선택 모달 나타남

---

## 🔗 관련 문서

- [Firebase 콘솔](https://console.firebase.google.com)
- [GCP 콘솔](https://console.cloud.google.com)
- [Firestore 보안 규칙 문서](https://firebase.google.com/docs/firestore/security/start)
