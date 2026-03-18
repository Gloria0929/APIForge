#!/bin/bash
# APIForge 多架构构建并推送到 Docker Hub
# 用法: ./scripts/docker-push.sh [DOCKERHUB_USERNAME] [TAG]
# 示例: ./scripts/docker-push.sh myuser 1.0.0

set -e

DOCKERHUB_USER="${1:?请提供 Docker Hub 用户名，例如: ./scripts/docker-push.sh myuser}"
TAG="${2:-latest}"
IMAGE="apiforge"

echo ">>> 构建并推送 ${DOCKERHUB_USER}/${IMAGE}:${TAG} (amd64 + arm64)"
echo ">>> 请确保已执行: docker login"
echo ""

# 创建并使用 buildx builder（若不存在）
docker buildx create --name m1-builder --use 2>/dev/null || docker buildx use m1-builder
docker buildx inspect --bootstrap

# 多架构构建并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${DOCKERHUB_USER}/${IMAGE}:${TAG}" \
  --push \
  .

echo ""
echo ">>> 完成! 镜像已推送至:"
echo "    ${DOCKERHUB_USER}/${IMAGE}:${TAG}"
echo ""
echo ">>> 拉取示例:"
echo "    docker pull ${DOCKERHUB_USER}/${IMAGE}:${TAG}"
