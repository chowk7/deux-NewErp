# Cloud Run을 위한 Dockerfile
# 다이아 주얼리 ERP API 서버

FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json 복사
COPY api/package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --only=production

# 소스 코드 복사
COPY api/ ./

# 포트 8080 노출 (Cloud Run 기본값)
EXPOSE 8080

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

# 서버 시작
CMD ["node", "server.js"]
