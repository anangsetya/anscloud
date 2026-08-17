#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Switch Prisma provider between PostgreSQL (production) and SQLite (dev)
#
# Usage:
#   ./scripts/switch-db.sh postgres   # Use PostgreSQL (default, for Vercel)
#   ./scripts/switch-db.sh sqlite      # Use SQLite (local dev only)
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

TARGET=${1:-postgres}
SCHEMA_DIR="$(dirname "$0")/../prisma"

case "$TARGET" in
  postgres|postgresql)
    cp "$SCHEMA_DIR/schema.postgres.prisma" "$SCHEMA_DIR/schema.prisma"
    echo "✓ Switched to PostgreSQL (production mode)"
    echo "  Make sure DATABASE_URL points to Neon Postgres in .env"
    ;;
  sqlite)
    cp "$SCHEMA_DIR/schema.sqlite.prisma" "$SCHEMA_DIR/schema.prisma"
    echo "✓ Switched to SQLite (local dev mode)"
    echo "  Make sure DATABASE_URL=file:./db/custom.db in .env"
    ;;
  *)
    echo "Usage: $0 [postgres|sqlite]"
    echo "  postgres  — for Vercel/Neon production (default)"
    echo "  sqlite    — for local dev only"
    exit 1
    ;;
esac

# Regenerate Prisma client
echo "Regenerating Prisma client..."
bun run db:generate
echo "✓ Done. Run 'bun run db:push' to sync schema."
