# Playwright base image: chromium + all OS deps preinstalled.
# IMPORTANT: pin this tag to the playwright npm version in package.json (1.59.x)
# so the chromium revision matches.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install deps first for layer caching.
# Prefer `npm ci` (reproducible) when a lockfile is present; fall back to
# `npm install` otherwise. Run `npm install` locally to generate the lockfile.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# App source (fixtures are kept for an in-container smoke test; see .dockerignore).
COPY . .

# Cloud Run convention: listen on $PORT (default 8080).
ENV PORT=8080
EXPOSE 8080

# Run as the non-root user the playwright image ships with.
USER pwuser

CMD ["node", "server.mjs"]
