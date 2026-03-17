# 다이아 주얼리 ERP 시스템

복잡한 다이아 주얼리 비즈니스의 가격, 원가, 매출, 비용을 체계적으로 관리하는 웹 기반 ERP 시스템입니다.

**⚠️ 주의: 시스템이 정상 작동하려면 [📋 필수 설정](##-필수-설정)을 먼저 완료해주세요.**

---

## 🚀 필수 설정

### ❌ 지금 문제가 있다면:

1. **"새 항목 추가" 등 기능이 작동 안 함**
   → [Firestore 설정 가이드](docs/FIRESTORE-SETUP.md) 필독

2. **"permission-denied" 오류 발생**
   → [Firestore 보안 규칙](docs/FIRESTORE-SETUP.md#2-firestore-보안-규칙-설정) 확인

3. **로컬에서 테스트하고 싶음**
   → [로컬 개발 환경 설정](docs/LOCAL-DEVELOPMENT.md)

4. **Cloud Run 배포 문제**
   → [배포 문제 해결](docs/CLOUD-DEPLOYMENT-TROUBLESHOOTING.md)

---

## 📋 빠른 체크리스트

시스템이 정상 작동하려면 이 3가지가 필수입니다:

```
☑️ 1. GCP에서 Firestore API 활성화
   → https://console.cloud.google.com
   → API 및 서비스 → Firestore API → 사용(ENABLE)

☑️ 2. Firebase 콘솔에서 보안 규칙 설정
   → https://console.firebase.google.com
   → Firestore Database → Rules
   → 아래 규칙 입력 → 게시(Publish)

☑️ 3. Cloud Run 환경 변수 설정
   → GCP 콘솔 → Cloud Run → 환경 변수
   → FIREBASE_* 변수 입력
```

### Firebase 보안 규칙 (개발 단계)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

👉 **[상세 가이드](docs/FIRESTORE-SETUP.md)**

---

## 📚 문서

| 문서 | 설명 |
|------|------|
| **[🔧 Firestore 설정](docs/FIRESTORE-SETUP.md)** | **⭐️ 필수** - API 활성화 + 보안 규칙 |
| **[🖥️ 로컬 개발](docs/LOCAL-DEVELOPMENT.md)** | 로컬 환경에서 개발하기 |
| **[☁️ 배포 문제 해결](docs/CLOUD-DEPLOYMENT-TROUBLESHOOTING.md)** | Cloud Run 배포 및 에러 해결 |

---

## 기술 스택

- **프론트엔드**: HTML5 + Vanilla JavaScript (CSP 규격 준수)
- **백엔드**: Node.js + Express (Cloud Run)
- **데이터베이스**: Firebase Firestore
- **스토리지**: GCP Cloud Storage
- **배포**: GCP Cloud Build + Cloud Run
- **인증**: Firebase Authentication

---

## 주요 기능

### 📊 가격관리
- **다이아단가표** - 다이아 종류별 원가 관리
- **제품단가표** - 34개 필드로 상세한 상품 단가 및 마진 자동계산
- **옵션추가금액** - 각줄/옵션별 추가금액 관리

### 💰 매출관리
- **매출표** - 27개 필드로 주문건별 상세 정보 기록
- **제조원가표** - 동적 나석 필드 (1~10개) 및 자동 계산
- **주문관리** - 상태 추적 및 이미지 4종 관리 (GCP Storage)

### 📈 분석
- **판관비** - 9개 계정과목으로 상세 분류
- **P&L표** - 월별 손익계산서 자동 생성

### 🛠️ 관리
- **필수항목 설정** - 각 표에서 필수 입력 필드 커스터마이징
- **표시항목 설정** - 테이블에 표시할 컬럼 선택
- **CSV 기능** - 템플릿 다운로드, 대량 업로드, 데이터 다운로드

---

## 프로젝트 구조

```
deux-NewErp/
├── public/                    # 정적 파일
│   └── index.html            # SPA HTML
├── js/                        # JavaScript
│   ├── app.js                # 메인 앱
│   ├── auth.js               # 인증
│   ├── firebaseManager.js    # Firebase 초기화
│   ├── utils.js              # 공통 유틸리티
│   └── modules/              # 기능별 모듈 (6개)
├── css/                       # 스타일시트
│   └── main.css
├── api/                       # Express 백엔드
│   ├── server.js
│   └── package.json
├── docs/                      # 📚 필독 문서
│   ├── FIRESTORE-SETUP.md    # ⭐️ 필수 설정
│   ├── LOCAL-DEVELOPMENT.md
│   └── CLOUD-DEPLOYMENT-TROUBLESHOOTING.md
├── Dockerfile                 # Cloud Run
├── cloudbuild.yaml           # CI/CD
└── README.md
```

---

## 데이터 구조

### Firestore Collections

```
prices/
├── diamondRates/items
├── productRates/items
├── optionCharges/items
└── settings/

sales/
├── orders/items
├── manufacturingCosts/items
├── orderManagement/items
├── adminExpenses/items
└── profitLoss/items
```

---

## ❌ 자주 발생하는 문제

### 문제 1: "permission-denied" 또는 "Service Unavailable"
```
→ Firestore API 활성화 여부 확인
→ 보안 규칙 배포 여부 확인
→ [Firestore 설정 가이드](docs/FIRESTORE-SETUP.md) 참고
```

### 문제 2: "새 항목 추가" 등 기능 미동작
```
→ 위 1번 문제 해결
→ 브라우저 개발자 도구 Console에서 에러 확인
→ [배포 문제 해결](docs/CLOUD-DEPLOYMENT-TROUBLESHOOTING.md#문제-5-데이터-조회입력이-안-됨) 참고
```

### 문제 3: "firebase config is empty"
```
→ Cloud Run 환경 변수 설정 확인
→ [환경 변수 설정](docs/CLOUD-DEPLOYMENT-TROUBLESHOOTING.md#3-환경-변수-설정-cloud-run) 참고
```

---

## 🔗 유용한 링크

- [GCP 콘솔](https://console.cloud.google.com)
- [Firebase 콘솔](https://console.firebase.google.com)
- [Firebase 문서](https://firebase.google.com/docs)
- [Cloud Run 문서](https://cloud.google.com/run/docs)

---

## 개발 로드맵

- ✅ Phase 1: 프로젝트 초기 설정
- ✅ Phase 2: 데이터 모델 정의
- ✅ Phase 3: 인증 구현
- ✅ Phase 4: 핵심 기능 (가격관리, 매출관리)
- 🔄 Phase 5: CSP 준수 및 필드 커스터마이징
- ⏳ Phase 6: 고급 기능 (대시보드, 리포트)

---

## 라이선스

이 프로젝트는 비공개 프로젝트입니다.
