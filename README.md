# 다이아 주얼리 가격/원가/매출 관리 시스템

복잡한 다이아 주얼리 비즈니스의 가격, 원가, 매출, 비용을 체계적으로 관리하는 웹 기반 ERP 시스템입니다.

## 기술 스택

- **프론트엔드**: HTML5 + Vanilla JavaScript
- **백엔드**: Node.js + Express (Cloud Run)
- **데이터베이스**: Firebase Firestore
- **스토리지**: GCP Cloud Storage
- **배포**: GCP Cloud Build + Cloud Run
- **인증**: Firebase Authentication

## 주요 기능

### 1. 가격관리
- 다이아단가표 관리
- 제품단가표 관리
- 각줄추가금액 관리
- 기타옵션값 관리

### 2. 매출관리
- 매출표 (주문건별)
- 제조원가표 (자동계산)
- 주문관리표 (상태추적)
- 판관비 관리
- P&L표 (자동생성)

### 3. 이미지 관리
- 영수증/주문서/공방전표 업로드
- GCP Storage 통합
- 이미지 갤러리

### 4. 대시보드 & 리포트
- 매출현황 차트
- P&L 분석
- 상태별 주문 현황

## 프로젝트 구조

```
.
├── public/                 # 프론트엔드 HTML 파일들
│   └── index.html          # 메인 페이지
├── api/                    # Cloud Run 백엔드
│   ├── server.js           # Express 서버
│   ├── package.json
│   └── routes/             # API 라우트들
├── js/                     # 프론트엔드 JavaScript
│   ├── app.js              # 메인 앱 로직
│   ├── auth.js             # 인증 로직
│   ├── firebaseConfig.js   # Firebase 설정
│   └── modules/            # 기능별 모듈
├── css/                    # 스타일시트
│   └── main.css
├── config/                 # 설정 파일
│   ├── firebaseConfig.example.js
│   └── gcp.example.json
├── docs/                   # 문서
│   ├── SETUP.md            # 설정 가이드
│   ├── FIREBASE.md         # Firebase 설정
│   └── GCP.md              # GCP 설정
├── .gitignore
├── cloudbuild.yaml         # Cloud Build 파이프라인
├── Dockerfile              # Cloud Run 배포용
└── README.md               # 이 파일
```

## 빠른 시작

### 1. GCP/Firebase 설정
[GCP 설정 가이드](./docs/GCP.md)를 참고하여 인프라를 설정합니다.

### 2. 설정 파일 생성
```bash
# Firebase 설정
cp config/firebaseConfig.example.js config/firebaseConfig.js
# GCP 설정
cp config/gcp.example.json config/gcp.json
```

### 3. 환경변수 설정
GCP Cloud Run에서 다음 환경변수를 설정합니다:
- `FIREBASE_API_KEY`
- `FIREBASE_PROJECT_ID`
- `GCP_STORAGE_BUCKET`
- `NODE_ENV=production`

### 4. 로컬 개발
```bash
cd api
npm install
npm start
```

프론트엔드는 `public/index.html`을 브라우저에서 열어 개발합니다.

### 5. 배포
```bash
git push origin claude/diamond-jewelry-webapp-xiVe2
# Cloud Build가 자동으로 배포합니다
```

## 데이터 구조

### Firestore Collections

```
prices/
├── diamondRates/          # 다이아단가표
├── productRates/          # 제품단가표
├── optionCharges/         # 각줄추가금액표
└── settings/              # 기타옵션값

sales/
├── orders/                # 매출표
├── manufacturingCosts/    # 제조원가표
├── orderManagement/       # 주문관리표
├── adminExpenses/         # 판관비표
└── profitLoss/            # P&L표
```

## 개발 로드맵

- ✅ Phase 1: 프로젝트 초기 설정
- 🔄 Phase 2: 데이터 모델 정의
- ⏳ Phase 3: 인증 구현
- ⏳ Phase 4: 핵심 기능 (가격관리, 매출관리)
- ⏳ Phase 5: 계산 로직 및 검증
- ⏳ Phase 6: 고급 기능 (대시보드, 리포트)

## 문제 해결

### Firebase 연결 안 됨
- Firebase 설정 파일이 올바른지 확인
- GCP 프로젝트가 활성화되어 있는지 확인
- Firestore 데이터베이스가 생성되어 있는지 확인

### Cloud Run 배포 실패
- `cloudbuild.yaml`이 올바른 GCS 버킷을 지정하고 있는지 확인
- Cloud Build 서비스 계정의 권한이 충분한지 확인
- 환경변수가 모두 설정되어 있는지 확인

## 기여 가이드

1. 기능 구현 전에 이슈를 생성해 논의합니다
2. 새로운 기능은 별도의 브랜치에서 개발합니다
3. 커밋 메시지는 명확하게 작성합니다
4. 코드 리뷰를 거친 후 메인 브랜치로 병합합니다

## 라이선스

이 프로젝트는 비공개 프로젝트입니다.

## 문의

프로젝트 관련 문의사항은 [여기](mailto:example@example.com)로 연락 주세요.
