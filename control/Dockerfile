# Build context: repo root (see docker-compose.yml), since it needs both web/ and control/.
#
# Multi-arch without emulation: the web and build stages always run on the build machine's
# architecture ($BUILDPLATFORM). The dashboard is architecture-independent, and the Go binary
# is cross-compiled to $TARGETOS/$TARGETARCH. Only the final stage (scratch) follows the target platform.

# 1. Dashboard (Vite) → control/internal/ui/dist/web
FROM --platform=$BUILDPLATFORM node:26-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. Control-plane (Go), with the dashboard embedded
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
ARG TARGETOS TARGETARCH
ARG VERSION=dev
ARG COMMIT=unknown
WORKDIR /src/control
COPY control/go.mod control/go.sum ./
RUN go mod download
COPY control/ ./
COPY --from=web /src/control/internal/ui/dist ./internal/ui/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath \
      -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
      -o /out/control ./cmd/control
# Data directory owned by the nonroot user, so new volumes are owned by this user too.
RUN mkdir -p /out/data && chown 65532:65532 /out/data

FROM scratch
COPY --from=build /out/control /control
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
EXPOSE 8080 9000
ENTRYPOINT ["/control"]
