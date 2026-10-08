# syntax=docker/dockerfile:1

# Runtime image for the ClinicBridge voice worker.
#
# The build context is the staging directory produced by `node scripts/stage-pilot.mjs`
# (package manifests + prebuilt dist/*.mjs only). dist is bundled from the monorepo because the
# worker imports shared ClinicBridge modules through tsconfig paths, so it cannot be rebuilt from
# this context. Secrets are injected at runtime by LiveKit Cloud secrets management; never COPY
# env files and never set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET here.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

# The LiveKit native core reads the system CA bundle; slim Node images do not ship it.
RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

WORKDIR /app

COPY --chown=appuser:appuser package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=appuser:appuser dist/main.mjs dist/agent.mjs ./dist/

USER appuser

ENV NODE_ENV=production
ENV LOG_LEVEL=error

CMD ["node", "dist/main.mjs", "start"]
