# Build context: root repo (lihat docker-compose.yml), karena butuh web/ dan control/.
#
# Multi-arch tanpa emulasi: stage web dan build selalu jalan di arsitektur mesin build
# ($BUILDPLATFORM). Dashboard tidak bergantung arsitektur, dan binary Go di-cross-compile
# ke $TARGETOS/$TARGETARCH. Hanya stage terakhir (scratch) yang mengikuti platform target.

# 1. Dashboard (Vite) → control/internal/ui/dist
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. Control-plane (Go), dengan dashboard di-embed
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
# Direktori data milik user nonroot, supaya volume baru ikut dimiliki user ini.
RUN mkdir -p /out/data && chown 65532:65532 /out/data

FROM scratch
COPY --from=build /out/control /control
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
EXPOSE 8080 9000
ENTRYPOINT ["/control"]
