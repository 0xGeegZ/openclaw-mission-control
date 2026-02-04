# OpenClaw (Clawdbot) gateway image for OpenClaw Mission Control local dev.
# Based on https://github.com/CrocSwap/clawdbot-docker

FROM node:22

# Install basic tools + Chromium (required for OpenClaw web/browser skills)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    rsync \
    chromium \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"

ARG EXTRA_APT_PACKAGES=""
RUN if [ -n "$EXTRA_APT_PACKAGES" ]; then \
    apt-get update && apt-get install -y $EXTRA_APT_PACKAGES && rm -rf /var/lib/apt/lists/*; \
    fi

RUN npm install -g pnpm

# Install clawdbot (OpenClaw CLI). Pin for reproducible builds.
RUN npm install -g clawdbot@2026.1.24-3 \
    && clawdbot --version

COPY user-setup.sh /tmp/user-setup.sh
RUN chmod +x /tmp/user-setup.sh && /tmp/user-setup.sh

RUN mkdir -p /root/.clawdbot \
    && mkdir -p /root/.clawdbot-templates \
    && mkdir -p /root/clawd \
    && mkdir -p /root/clawd/skills

COPY start-openclaw.sh /usr/local/bin/start-openclaw.sh
RUN chmod +x /usr/local/bin/start-openclaw.sh

COPY openclaw.json.template /root/.clawdbot-templates/openclaw.json.template

WORKDIR /root/clawd

EXPOSE 18789

CMD ["/usr/local/bin/start-openclaw.sh"]
