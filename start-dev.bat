@echo off
setlocal enabledelayedexpansion

echo ================================================
echo   LMS - Development Startup
echo ================================================
echo.

echo [1/5] Checking Docker...
docker info > nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Docker is not running. Please start Docker Desktop first.
  pause
  exit /b 1
)
echo Docker is running.

echo.
echo [2/5] Starting infrastructure (PostgreSQL, Redis, MinIO, Mailhog)...
docker compose -f infrastructure\docker\docker-compose.yml up -d postgres redis minio mailhog
echo Waiting 6 seconds for services to be ready...
timeout /t 6 /nobreak > nul

echo.
echo [3/5] Running database migrations...
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V1__create_organizations.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V2__create_users.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V3__create_audit_log.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V4__create_courses.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V5__create_quiz_and_badges.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V6__create_agent_tables.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V7__create_enrollments.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V8__create_gamification.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V9__seed_badges.sql 2>nul
docker exec lms-postgres psql -U lms_user -d lms_db -f /dev/stdin < backend\shared\migrations\V10__course_scheduling_and_paths.sql 2>nul
echo Migrations done.

echo.
echo [4/5] Loading environment and clearing leftover ports...

REM Load root .env into this process so Node child processes inherit all vars
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "_ln=%%a"
  if not "!_ln!"=="" (
    set "_ch=!_ln:~0,1!"
    if not "!_ch!"=="#" (
      set "%%a=%%b"
    )
  )
)

REM Kill any processes still holding key ports from a previous run
for %%p in (3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3100 5000 5174) do (
  for /f "tokens=5" %%i in ('netstat -aon ^| findstr ":%%p " 2^>nul') do (
    taskkill /f /pid %%i > nul 2>&1
  )
)
echo Done.
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

echo.
echo [5/5] Starting all services...
echo.
echo  Admin Portal  : http://localhost:5000  (admin@lms.local / admin123)
echo  Learner Portal: http://localhost:5174
echo  Mailhog       : http://localhost:8025
echo  MinIO         : http://localhost:9001  (minioadmin / minioadmin)
echo.
echo Press Ctrl+C to stop all services.
echo ================================================
echo.

npx concurrently --kill-others-on-fail ^
  --names "USER,COURSE,QUIZ,BADGE,NOTIFY,AUDIT,MCP,CONTENT,CERT,AGENT,TOOLS,COMPANION,ADMIN,LEARNER" ^
  --prefix-colors "cyan,green,yellow,magenta,blue,white,gray,cyan,green,yellow,magenta,blue,red,green" ^
  "cd backend/services/user-service && npm run dev" ^
  "cd backend/services/course-service && npm run dev" ^
  "cd backend/services/quiz-engine && npm run dev" ^
  "cd backend/services/badge-engine && npm run dev" ^
  "cd backend/services/notification-service && npm run dev" ^
  "cd backend/services/audit-service && npm run dev" ^
  "cd backend/services/mcp-server && npm run dev" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3003 --reload --app-dir backend/services/content-service" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3006 --reload --app-dir backend/services/certificate-engine" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3008 --reload --app-dir backend/services/agent-orchestrator" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3009 --reload --app-dir backend/services/tool-registry" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3011 --reload --app-dir backend/services/learner-companion" ^
  "cd frontend/admin && npm run dev" ^
  "cd frontend/learner && npm run dev"

endlocal
