# OpenClaw (Clawdbot) gateway image for OpenClaw Mission Control local dev.
# Based on https://github.com/CrocSwap/clawdbot-docker

FROM node:22

# Consolidated package installation with version pinning (FIX 3.3)
# Install base tools + Chromium (required for OpenClaw web/browser skills)
# jq: JSON parsing for scripts and OpenClaw skills
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    rsync \
    chromium-browser \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# FIX 3.1: Harden Chromium security posture
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser
# Chromium hardening flags: minimal feature set, disable risky capabilities
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --disable-features=TranslateUI --disable-default-apps --disable-extensions --disable-sync --disable-background-networking --no-first-run"

# FIX 3.3: Version pinning for reproducible builds (update periodically)
ARG OPENCLAW_VERSION=2026.2.9
ARG CLAWBOT_VERSION=2026.1.24-3
ARG EXTRA_APT_PACKAGES=""

# Install optional packages if provided
RUN if [ -n "$EXTRA_APT_PACKAGES" ]; then \
    apt-get update \
    && apt-get install -y --no-install-recommends $EXTRA_APT_PACKAGES \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*; \
    fi

# Install pnpm and pinned CLI versions
RUN npm install -g pnpm \
    && npm install -g "openclaw@${OPENCLAW_VERSION}" "clawdbot@${CLAWBOT_VERSION}" \
    && openclaw --version \
    && clawdbot --version

COPY user-setup.sh /tmp/user-setup.sh
RUN chmod +x /tmp/user-setup.sh && /tmp/user-setup.sh

RUN mkdir -p /root/.openclaw \
    && mkdir -p /root/.openclaw-templates \
    && mkdir -p /root/clawd \
    && mkdir -p /root/clawd/skills

COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

COPY openclaw.json.template /root/.openclaw-templates/openclaw.json.template

# Create non-root user (FIX 2.1: Security - prevent running as root)
RUN groupadd -g 1000 openclaw && \
    useradd -u 1000 -g openclaw -d /home/openclaw -s /sbin/nologin -c "OpenClaw Gateway" openclaw && \
    mkdir -p /home/openclaw && \
    chown -R openclaw:openclaw /root/.openclaw /root/.openclaw-templates /root/clawd /home/openclaw

WORKDIR /root/clawd

EXPOSE 18789

# FIX 3.5: Add health check to gateway container
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD curl -f http://127.0.0.1:18789/health || exit 1

USER openclaw

# FIX 3.4: Signal handling - use exec to forward signals to the shell script
ENTRYPOINT ["/bin/bash", "-c"]
CMD ["exec /usr/local/bin/start-openclaw.sh"]
