# Use Node.js 20 Alpine as base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Accept build-time environment variables
ARG NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS
ARG NEXT_PUBLIC_USE_WEB_SEARCH
ARG NEXT_PUBLIC_USE_AGENTIC_MODE

# Set environment variables for the build
ENV NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=$NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS
ENV NEXT_PUBLIC_USE_WEB_SEARCH=$NEXT_PUBLIC_USE_WEB_SEARCH
ENV NEXT_PUBLIC_USE_AGENTIC_MODE=$NEXT_PUBLIC_USE_AGENTIC_MODE

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Increase Node.js heap size to 512MB to handle large web content
CMD ["node", "--max-old-space-size=512", "server.js"]
