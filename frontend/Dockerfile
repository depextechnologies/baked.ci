# ==========================================================
# Build Stage
# ==========================================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency files first for better Docker cache
COPY package.json yarn.lock ./

RUN yarn install \
    --frozen-lockfile \
    --network-timeout 600000

# Copy application source
COPY . .

# Build-time environment variables
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

ARG REACT_APP_GOOGLE_MAPS_API_KEY
ENV REACT_APP_GOOGLE_MAPS_API_KEY=${REACT_APP_GOOGLE_MAPS_API_KEY}

RUN yarn build

# ==========================================================
# Runtime Stage
# ==========================================================
FROM nginx:1.27-alpine

# Copy built application
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration as a template so SERVER_NAME is substituted from
# the environment at container start (nginx's docker-entrypoint.d scripts
# run envsubst on *.template files in /etc/nginx/templates/).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default used if SERVER_NAME isn't provided at runtime (local dev)
ENV SERVER_NAME=localhost

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]