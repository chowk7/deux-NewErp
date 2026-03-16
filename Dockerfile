# Cloud Run을 위한 Dockerfile
# 다이아 주얼리 ERP API 서버

FROM node:18-alpine

WORKDIR /app

# 백엔드 의존성 설치
COPY api/package*.json ./
RUN npm ci --omit=dev

# 백엔드 소스 복사
COPY api/ ./

# 프론트엔드 파일 복사 (Express static 서빙용)
COPY public/ ./public/
COPY css/ ./css/
COPY js/ ./js/

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "server.js"]
