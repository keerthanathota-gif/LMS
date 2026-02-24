@echo off
cd /d %~dp0
npx concurrently ^
  --names "CONTENT,CERT,AGENT,TOOLS,COMPANION" ^
  --prefix-colors "cyan,green,yellow,magenta,blue" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3003 --reload --app-dir backend/services/content-service" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3006 --reload --app-dir backend/services/certificate-engine" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3008 --reload --app-dir backend/services/agent-orchestrator" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3009 --reload --app-dir backend/services/tool-registry" ^
  "py -m uvicorn src.main:app --host 0.0.0.0 --port 3011 --reload --app-dir backend/services/learner-companion"
