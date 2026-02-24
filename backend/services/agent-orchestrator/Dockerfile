FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
ENV PYTHONUTF8=1
ENV PYTHONIOENCODING=utf-8
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import httpx; httpx.get('http://localhost:3008/health')" || exit 1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3008"]
