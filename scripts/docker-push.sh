#!/bin/bash
# APIForge 多架构构建并推送到 Docker Hub
# 用法: ./scripts/docker-push.sh [DOCKERHUB_USERNAME] [TAG]
# 示例: ./scripts/docker-push.sh myuser 1.0.0

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 从 package.json 同步 VERSION_LATEST 到 .env
node scripts/sync-env-version.js

DOCKERHUB_USER="${1:?请提供 Docker Hub 用户名，例如: ./scripts/docker-push.sh myuser}"
TAG="${2:-latest}"
IMAGE="apiforge"
VERSION=$(node -p "require('./package.json').version")

# 版本 tag 必须与 package.json 一致，否则镜像内版本号与推送 tag 不符，自动更新会一直误报
if [[ "$TAG" =~ ^v?[0-9]+\.[0-9]+ ]]; then
  if [ "${TAG#v}" != "$VERSION" ]; then
    echo "错误: TAG=${TAG} 与 package.json version=${VERSION} 不一致"
    echo "请先把 package.json 的 version 改为 ${TAG#v}，或省略第二个参数只推 latest"
    exit 1
  fi
fi

echo ">>> 构建并推送 ${DOCKERHUB_USER}/${IMAGE}:${TAG} (amd64 + arm64)"
echo ">>> 同时推送版本 tag ${VERSION}（供运行中实例自动检测更新）"
echo ">>> 请确保已执行: docker login"
echo ""

# 创建并使用 buildx builder（若不存在）
docker buildx create --name m1-builder --use 2>/dev/null || docker buildx use m1-builder
docker buildx inspect --bootstrap

# 推送 latest 和版本 tag（同一镜像，版本 tag 用于自动更新检测）
# 传入 DOCKER_IMAGE 和 VERSION，避免容器内显示 latest
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg DOCKER_IMAGE="${DOCKERHUB_USER}/${IMAGE}:${VERSION}" \
  --build-arg VERSION="${VERSION}" \
  -t "${DOCKERHUB_USER}/${IMAGE}:${TAG}" \
  -t "${DOCKERHUB_USER}/${IMAGE}:${VERSION}" \
  --push \
  .

echo ""
echo ">>> 完成! 镜像已推送至:"
echo "    ${DOCKERHUB_USER}/${IMAGE}:${TAG}"
echo "    ${DOCKERHUB_USER}/${IMAGE}:${VERSION}"
echo ""
echo ">>> 拉取示例:"
echo "    docker pull ${DOCKERHUB_USER}/${IMAGE}:${TAG}"
