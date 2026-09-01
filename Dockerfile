FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG CACHE_BUST=unknown
RUN echo "Building commit: $CACHE_BUST"
RUN pnpm build:server
RUN pnpm build:client
RUN pnpm build:migrate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/dist ./dist
COPY --from=base /app/migrations ./migrations
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
EXPOSE 3006
CMD ["node", "dist/index.js"]
