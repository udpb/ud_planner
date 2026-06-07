# Playwright base image: chromium + all OS deps preinstalled.
# IMPORTANT: pin this tag to the playwright npm version in package.json (1.59.x)
# so the chromium revision matches.
#
# ⚠️ BUILD CONTEXT = REPO ROOT (DECK-3b-3). The worker now also serves /render-deck, which renders
#    DeckSpec JSON -> self-contained HTML using deck-render.bundle.mjs. That bundle reads the deck
#    CSS (src/styles/underdogs-slide.css) + fonts/images (public/design-kit/**) from disk at runtime,
#    so those repo assets must be COPYable. Build from the repo root:
#        docker build -f render-worker/Dockerfile -t ud-render-worker .
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install deps first for layer caching.
# Prefer `npm ci` (reproducible) when a lockfile is present; fall back to
# `npm install` otherwise. Run `npm install` locally to generate the lockfile.
# (devDependencies incl. esbuild are NOT needed at runtime — the bundle is committed/COPYed below.)
COPY render-worker/package.json render-worker/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Worker source (server.mjs, the committed deck-render bundle, fixtures, test).
# fixtures/ are kept for an in-container smoke test; see .dockerignore.
COPY render-worker/ ./

# Deck render assets read at RUNTIME by deck-render.bundle.mjs:
#   - public/design-kit/** : fonts (woff2, inlined as data URI), logo svg, sample images
#   - src/styles/underdogs-slide.css : the slide stylesheet (read via DECK_REPO_ROOT)
# DECK_ASSETS_DIR points at the public root; DECK_REPO_ROOT at the repo root inside the image.
COPY public/design-kit/ ./assets/public/design-kit/
COPY src/styles/ ./assets/src/styles/
ENV DECK_ASSETS_DIR=/app/assets/public
ENV DECK_REPO_ROOT=/app/assets

# Cloud Run convention: listen on $PORT (default 8080).
ENV PORT=8080
EXPOSE 8080

# Run as the non-root user the playwright image ships with.
USER pwuser

CMD ["node", "server.mjs"]
