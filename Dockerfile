# API container for Railway: the API, the voice MCP server (/mcp), the agent, the Qloo bridge
# and background jobs. Anything that touches Qloo runs here, never on serverless.
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production TRANSFORMERS_CACHE=/app/apps/api/models
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Qloo harness, installed globally as the hackathon kit expects (`qloo mcp`).
RUN npm i -g @qloo/qloo-harness@0.1.26
ENV QLOO_BIN=qloo

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/scoring/package.json packages/scoring/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @tp/api...

COPY packages ./packages
COPY apps/api ./apps/api
COPY docs/demo-titles.json ./docs/demo-titles.json
RUN pnpm --filter @tp/api exec prisma generate

# Pre-download the RoBERTa fallback classifier (ONNX) so the fallback works offline.
RUN cd apps/api && node --input-type=module -e "const { pipeline, env } = await import('@huggingface/transformers'); env.cacheDir = process.env.TRANSFORMERS_CACHE; await pipeline('sentiment-analysis', 'Xenova/twitter-roberta-base-sentiment-latest', { dtype: 'q8' }); console.log('fallback model cached');"

WORKDIR /app/apps/api
EXPOSE 8080
CMD ["pnpm", "start"]
