FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import httpx; httpx.get('http://localhost:3006/health')" || exit 1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3006"]
