# --- FX-Lite Dockerfile -----------------------------------------------
# Single-stage build is sufficient here: better-sqlite3 needs its native
# addon compiled, so we keep build tools available at runtime rather than
# doing a multi-stage copy that risks ABI/glibc mismatches between stages.

FROM node:20-slim

# python3, make, g++ are required to compile better-sqlite3's native
# bindings during `npm install` on the target architecture.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install dependencies first (separate layer) so `npm install` is only
# re-run when package.json/package-lock.json actually change.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application source.
COPY . .

# Persist the SQLite file outside the app layer via a mounted volume.
VOLUME ["/usr/src/app/data"]

ENV PORT=3000
ENV DB_PATH=/usr/src/app/data/fxlite.db
EXPOSE 3000

# Seed the DB (idempotent) then start the server.
CMD ["sh", "-c", "node scripts/initDb.js && node server.js"]
