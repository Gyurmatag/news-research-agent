FROM docker.io/cloudflare/sandbox:0.10.1
# Pin tag to exactly match @cloudflare/sandbox in package.json. :latest does not exist.

ARG CACHEBUST=3
# Bump CACHEBUST whenever agent-script.mjs changes to force a rebuild.

WORKDIR /workspace
RUN mkdir -p /workspace/output
COPY package.json ./
RUN npm install --omit=dev
COPY agent-script.mjs ./
ENV NODE_ENV=production
