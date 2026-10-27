#!/bin/bash
# APIForge 多架构构建并推送
#
# 用法:
#   ./scripts/docker-push.sh <dockerhub用户> [TAG]        # 只推 Docker Hub
#   REGISTRY=<仓库地址>/<命名空间> ./scripts/docker-push.sh [TAG]   # 只推私有/国内仓库
#   REGISTRY=<仓库地址>/<命名空间> ./scripts/docker-push.sh <dockerhub用户> [TAG]  # 两边都推
#
# 示例（阿里云 ACR 个人版）:
#   docker login --username=<阿里云账号> crpi-xxxx.cn-hangzhou.personal.cr.aliyuncs.com
#   REGISTRY=crpi-xxxx.cn-hangzhou.personal.cr.aliyuncs.com/<命名空间> ./scripts/docker-push.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 从 package.json 同步 VERSION_LATEST 到 .env
node scripts/sync-env-version.js

IMAGE="apiforge"
VERSION=$(node -p "require('./package.json').version")

# 参数识别规则：
#   v1.2.3 / 1.2.3            → TAG
#   xxx.aliyuncs.com/ns      → REGISTRY（首段含 "." 或 ":"，是带主机地址的仓库路径）
#   <用户名>                  → Docker Hub 用户名
#   ns/repo（首段无主机地址） → 报错。这种写法会被 Docker 解析成 docker.io/ns/repo，
#                               推 ACR 时最容易踩，必须写全 xxx.aliyuncs.com/ns
DOCKERHUB_USER=""
TAG=""
for arg in "$@"; do
  if [[ "$arg" =~ ^v?[0-9]+\.[0-9]+ ]]; then
    TAG="$arg"
  elif [[ "$arg" == */* && "$arg" =~ ^[^/]*[.:][^/]*/ ]]; then
    REGISTRY="$arg"
  elif [[ "$arg" == */* ]]; then
    echo "错误: 参数 '$arg' 缺少仓库主机地址。"
    echo ""
    echo "  '${arg}' 会被 Docker 解析成 docker.io/${arg}（Docker Hub），而不是你的私有仓库。"
    echo "  推阿里云 ACR 请写全:"
    echo "    REGISTRY=crpi-xxxx.cn-hangzhou.personal.cr.aliyuncs.com/${arg} $0"
    exit 1
  elif [ -z "$DOCKERHUB_USER" ]; then
    DOCKERHUB_USER="$arg"
  fi
done
TAG="${TAG:-latest}"

REGISTRY="${REGISTRY:-}"
REGISTRY="${REGISTRY%/}"

# REGISTRY 若由环境变量传入，同样要求首段带主机地址，否则会静默推到 Docker Hub
if [ -n "$REGISTRY" ] && ! [[ "$REGISTRY" =~ ^[^/]*[.:][^/]*/ ]]; then
  echo "错误: REGISTRY='$REGISTRY' 缺少仓库主机地址，会被解析成 Docker Hub 仓库。"
  echo "       请写成 <registry-host>/<命名空间>，例如:"
  echo "         crpi-xxxx.cn-hangzhou.personal.cr.aliyuncs.com/freyax"
  exit 1
fi

if [ -z "$DOCKERHUB_USER" ] && [ -z "$REGISTRY" ]; then
  echo "错误: 至少需要一个推送目标。"
  echo ""
  echo "  只推国内/私有仓库（推荐，绕开 Docker Hub）:"
  echo "    REGISTRY=crpi-xxxx.cn-hangzhou.personal.cr.aliyuncs.com/<命名空间> $0"
  echo ""
  echo "  只推 Docker Hub:"
  echo "    $0 <dockerhub用户> [TAG]"
  echo ""
  echo "  两边都推:"
  echo "    REGISTRY=... $0 <dockerhub用户> [TAG]"
  exit 1
fi

# 版本 tag 必须与 package.json 一致，否则镜像内版本号与推送 tag 不符，自动更新会一直误报
if [[ "$TAG" =~ ^v?[0-9]+\.[0-9]+ ]]; then
  if [ "${TAG#v}" != "$VERSION" ]; then
    echo "错误: TAG=${TAG} 与 package.json version=${VERSION} 不一致"
    echo "请先把 package.json 的 version 改为 ${TAG#v}，或省略 tag 只推 latest"
    exit 1
  fi
fi

TAGS=()
TARGETS=()
add_target() {
  local target="$1"
  TARGETS+=("${target}")
  TAGS+=(-t "${target}:${TAG}")
  # TAG 与版本号相同时不重复打 tag
  if [ "${TAG#v}" != "${VERSION}" ]; then
    TAGS+=(-t "${target}:${VERSION}")
  fi
}
if [ -n "$REGISTRY" ]; then add_target "${REGISTRY}/${IMAGE}"; fi
if [ -n "$DOCKERHUB_USER" ]; then add_target "${DOCKERHUB_USER}/${IMAGE}"; fi

# 容器内显示的镜像地址优先用私有仓库，自动更新时会按它拉取
PRIMARY_IMAGE="${TARGETS[0]}"

# 备选源：两边都推时用 Docker Hub 兜底，只推一边时留空
if [ -n "$REGISTRY" ] && [ -n "$DOCKERHUB_USER" ]; then
  MIRROR_IMAGE="${DOCKERHUB_USER}/${IMAGE}"
else
  MIRROR_IMAGE=""
fi

echo ">>> 构建并推送 ${PRIMARY_IMAGE}:${TAG} (amd64 + arm64)"
echo ">>> 同时推送版本 tag ${VERSION}（供运行中实例自动检测更新）"
for target in "${TARGETS[@]}"; do
  echo "    - ${target}"
done
echo ">>> 请先确认已登录对应仓库: docker login <仓库地址>"
echo ""

# 推送权限前置校验：多架构构建耗时长，先确认凭据有 push 权限再开工
# （否则镜像名写错/凭据失效时，要等整轮构建完才在 push 阶段报 insufficient_scope）
echo ">>> 校验推送权限..."
node scripts/check-registry-push.js "${TARGETS[@]}"
echo ""

# 创建并使用 buildx builder（若不存在）
docker buildx create --name m1-builder --use 2>/dev/null || docker buildx use m1-builder
docker buildx inspect --bootstrap

# 推送 latest 和版本 tag（同一镜像，版本 tag 用于自动更新检测）
# 传入 DOCKER_IMAGE（跟随本次推送的 tag）和 VERSION（镜像版本标签）
#
# 关于 ACR 报错 "unknown manifest class for application/vnd.oci.empty.v1+json"：
# BuildKit 默认会附加 provenance/SBOM 证明，生成的索引里带一个 OCI 空描述符，
# 阿里云 ACR 个人版不认识。因此这里关掉证明，并强制使用 Docker 媒体类型（manifest list）。
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg DOCKER_IMAGE="${PRIMARY_IMAGE}:${TAG}" \
  --build-arg DOCKER_IMAGE_MIRRORS="${MIRROR_IMAGE}" \
  --build-arg VERSION="${VERSION}" \
  --provenance="${PROVENANCE:-false}" \
  --sbom=false \
  --output "type=image,push=true,oci-mediatypes=${OCI_MEDIATYPES:-false}" \
  "${TAGS[@]}" \
  .

echo ""
echo ">>> 完成! 镜像已推送至:"
for target in "${TARGETS[@]}"; do
  echo "    ${target}:${TAG}"
  echo "    ${target}:${VERSION}"
done

echo ""
echo ">>> 拉取示例:"
echo "    docker pull ${PRIMARY_IMAGE}:${VERSION}"

if [ -n "$REGISTRY" ]; then
  echo ""
  echo ">>> 容器更新源配置（docker-compose 的 .env 或 docker run 的 -e）:"
  echo "    DOCKER_IMAGE=${REGISTRY}/${IMAGE}"
  if [ -n "$DOCKERHUB_USER" ]; then
    echo "    DOCKER_IMAGE_MIRRORS=${DOCKERHUB_USER}/${IMAGE}"
  fi
  echo ""
  echo ">>> 版本清单（可选，上传到对象存储后配合 VERSION_MANIFEST_URL 使用）:"
  echo "    {\"version\":\"${VERSION}\",\"image\":\"${REGISTRY}/${IMAGE}:${VERSION}\"}"
  echo ""
  echo "提示: 若推送报 repository does not exist，先在 ACR 控制台创建 ${IMAGE} 仓库，"
  echo "      或开启「仓库自动创建」。"
fi
