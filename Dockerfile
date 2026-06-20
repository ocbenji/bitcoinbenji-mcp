# Container image so Glama (and other MCP hosts) can launch + introspect the server.
# It's a stdio MCP server — Glama runs it, sends an initialize/list-tools handshake,
# and scores it. No env required to start (BITCOIN_BENJI_API_KEY is optional; the
# 402 pay-per-call flow works without it).
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App code.
COPY index.js ./

# stdio MCP server. Use CMD (not ENTRYPOINT) so Glama's deploy reads a command
# argument — an ENTRYPOINT-only image trips "At least one command argument is required".
CMD ["node", "index.js"]
