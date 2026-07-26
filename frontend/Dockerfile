# --- Build stage ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --network-timeout 600000

COPY . .

# Baked into the JS bundle at build time (CRA/craco) — must be the public
# URL the browser will use, e.g. https://your-domain.com
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

# --- Runtime stage ---
FROM nginx:1.27-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
