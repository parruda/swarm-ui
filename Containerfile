# Multi-stage build for lean Alpine-based container
FROM ruby:3.4.4-alpine AS builder

# Accept RAILS_MASTER_KEY as build argument
ARG RAILS_MASTER_KEY

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    postgresql17-dev \
    nodejs \
    npm \
    git \
    curl \
    bash \
    tzdata \
    gcompat \
    yaml-dev \
    linux-headers

# Set up working directory
WORKDIR /app

# Copy dependency files
COPY Gemfile Gemfile.lock ./

# Install Ruby dependencies
RUN bundle config set --local deployment 'true' && \
    bundle install --jobs=4 --retry=3

# Copy application code
COPY . .

# Precompile assets for production
# Note: RAILS_MASTER_KEY must be provided as build arg
ARG RAILS_MASTER_KEY
RUN SECRET_KEY_BASE=dummy RAILS_ENV=production RAILS_MASTER_KEY=${RAILS_MASTER_KEY} bundle exec rails assets:precompile

# Remove unnecessary files
RUN rm -rf tmp/cache vendor/bundle/ruby/*/cache test spec

# Final stage
FROM ruby:3.4.4-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql17 \
    postgresql17-client \
    postgresql17-contrib \
    postgresql17-dev \
    nginx \
    supervisor \
    nodejs \
    npm \
    git \
    bash \
    tmux \
    curl \
    tzdata \
    gcompat \
    sudo \
    yaml-dev \
    build-base

# Install pgvector extension
RUN cd /tmp && \
    git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make PG_CONFIG=/usr/bin/pg_config && \
    make install PG_CONFIG=/usr/bin/pg_config && \
    cd / && \
    rm -rf /tmp/pgvector

# Install ttyd
RUN TTYD_VERSION=1.7.7 && \
    ARCH=$(uname -m) && \
    case ${ARCH} in \
        x86_64) TTYD_ARCH="x86_64" ;; \
        aarch64) TTYD_ARCH="aarch64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    curl -L "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}" -o /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd

# Install gh CLI from edge repository
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk add --no-cache github-cli@edge

# Install diff2html-cli
RUN npm install -g diff2html-cli

# Install gh webhook extension
RUN gh extension install cli/gh-webhook || true

# Create app user
RUN addgroup -g 1000 app && \
    adduser -D -u 1000 -G app -h /home/app -s /bin/bash app && \
    echo "app ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Create necessary directories
RUN mkdir -p /var/lib/postgresql/data /var/run/postgresql /var/log/supervisor /run/nginx /var/cache/nginx /var/log/nginx && \
    chown -R app:app /var/lib/postgresql /var/run/postgresql /var/log/supervisor && \
    chown -R app:app /run/nginx /var/cache/nginx /var/log/nginx && \
    chmod 755 /var/log/supervisor

# Set up working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=app:app /app /app

# Copy configuration files
COPY --chown=app:app docker/nginx.conf /etc/nginx/nginx.conf
COPY --chown=app:app docker/supervisord.conf /etc/supervisord.conf
COPY --chown=app:app docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=app:app docker/start-nginx.sh /usr/local/bin/start-nginx.sh

# Make scripts executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/start-nginx.sh

# Create Procfile for container environment
COPY --chown=app:app Procfile.start Procfile
RUN sed -i 's|postgres: bin/pg-start|# postgres managed by supervisor|' Procfile

# Set environment variables
ENV RAILS_ENV=production \
    RAILS_LOG_TO_STDOUT=true \
    RAILS_SERVE_STATIC_FILES=true \
    PORT=3000 \
    TTYD_PORT=8999 \
    DATABASE_URL=postgresql://swarm_ui:swarm_ui@localhost:5432/swarm_ui_production \
    PGDATA=/var/lib/postgresql/data \
    POSTGRES_USER=swarm_ui \
    POSTGRES_PASSWORD=swarm_ui \
    POSTGRES_DB=swarm_ui_production \
    SWARM_UI_DATABASE_PASSWORD=swarm_ui

# Switch to app user
USER app

# Expose port 8080
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]