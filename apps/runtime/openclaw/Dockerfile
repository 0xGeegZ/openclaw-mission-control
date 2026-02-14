# OpenClaw (Clawdbot) gateway image for local dev.
# Ref: https://github.com/CrocSwap/clawdbot-docker

FROM node:22

# Base tools + Chromium for web/browser skills; jq for scripts; gh for GitHub integration.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    rsync \
    chromium \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage --disable-features=TranslateUI --disable-default-apps --disable-extensions --disable-sync --disable-background-networking --no-first-run"

ARG OPENCLAW_VERSION=2026.2.9
ARG CLAWBOT_VERSION=2026.1.24-3
ARG EXTRA_APT_PACKAGES=""

RUN if [ -n "$EXTRA_APT_PACKAGES" ]; then \
    apt-get update \
    && apt-get install -y --no-install-recommends $EXTRA_APT_PACKAGES \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*; \
    fi

RUN npm install -g pnpm \
    && npm install -g "openclaw@${OPENCLAW_VERSION}" "clawdbot@${CLAWBOT_VERSION}" \
    && openclaw --version \
    && clawdbot --version

COPY user-setup.sh /tmp/user-setup.sh
RUN chmod +x /tmp/user-setup.sh && /tmp/user-setup.sh

RUN mkdir -p /root/.openclaw /root/.openclaw-templates /root/clawd /root/clawd/skills

COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

COPY openclaw.json.template /root/.openclaw-templates/openclaw.json.template

# start-openclaw.sh uses /root/.openclaw and /root/clawd; switch to non-root only after
# moving those paths to a user-owned directory (e.g. /home/openclaw).
WORKDIR /root/clawd

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD curl -f http://127.0.0.1:18789/health || exit 1

ENTRYPOINT ["/bin/bash", "-c"]
CMD ["exec /usr/local/bin/start-openclaw.sh"]
