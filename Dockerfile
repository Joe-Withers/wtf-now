FROM node:20-slim AS web
WORKDIR /web
COPY frontend/ ./
RUN npm ci && npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir uv
WORKDIR /app/backend
COPY backend/ ./
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist /app/web
ENV WEB_ROOT=/app/web BUNDLE_PATH=/data/bundle APP_DATA_PATH=/data/app
EXPOSE 8100
CMD [".venv/bin/uvicorn", "wtf_now.main:app", "--host", "0.0.0.0", "--port", "8100"]
