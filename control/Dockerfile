# Build context: root repo (lihat docker-compose.yml), karena butuh web/ dan control/.

# 1. Dashboard (Vite) → control/internal/ui/dist
FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. Control-plane (Go), dengan dashboard di-embed
FROM golang:1.26-alpine AS build
WORKDIR /src/control
COPY control/go.mod control/go.sum ./
RUN go mod download
COPY control/ ./
COPY --from=web /src/control/internal/ui/dist ./internal/ui/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/control ./cmd/control
# Direktori data milik user nonroot, supaya volume baru ikut dimiliki user ini.
RUN mkdir -p /out/data && chown 65532:65532 /out/data

FROM scratch
COPY --from=build /out/control /control
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
EXPOSE 8080 9000
ENTRYPOINT ["/control"]
