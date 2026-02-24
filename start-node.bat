@echo off
cd /d %~dp0
npx concurrently ^
  --names "USER,COURSE,QUIZ,BADGE,NOTIFY,AUDIT,MCP" ^
  --prefix-colors "cyan,green,yellow,magenta,blue,white,gray" ^
  "cd backend/services/user-service && npm run dev" ^
  "cd backend/services/course-service && npm run dev" ^
  "cd backend/services/quiz-engine && npm run dev" ^
  "cd backend/services/badge-engine && npm run dev" ^
  "cd backend/services/notification-service && npm run dev" ^
  "cd backend/services/audit-service && npm run dev" ^
  "cd backend/services/mcp-server && npm run dev"
