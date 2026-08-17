# ───────────────────────────────────────────────────────────────────────────
# AnsCloud Dockerfile — multi-stage build for smaller image.
#   Stage 1 (deps):    install production deps with Bun
#   Stage 2 (builder): compile Next.js to .next/standalone
#   Stage 3 (runner):  minimal runtime image with persistent volumes
# ───────────────────────────────────────────────────────────────────────────

FROM oven/bun:1 AS deps
WORKDIR /app

# Install dependencies (use lockfile for reproducible builds).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the standalone Next.js output.
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user for security.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy standalone build output (includes only what's needed at runtime).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Create persistent data directories owned by nextjs.
# Mount these as volumes in docker-compose to keep data across restarts.
RUN mkdir -p /app/db /app/storage \
 && chown -R nextjs:nodejs /app/db /app/storage

# Copy Prisma schema & migrations so `db:push` can run on first start.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

# Run Prisma migrations on startup, then start the server.
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && node server.js"]

# Volume hints for docker-compose.
VOLUME ["/app/db", "/app/storage"]
