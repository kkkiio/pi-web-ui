FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN apt-get update \
  && apt-get install -y --no-install-recommends ripgrep fd-find jq file \
  && rm -rf /var/lib/apt/lists/* \
  && if [ -x /usr/bin/fdfind ] && [ ! -e /usr/local/bin/fd ]; then ln -s /usr/bin/fdfind /usr/local/bin/fd; fi

RUN id -u vscode >/dev/null 2>&1 || useradd --create-home --shell /bin/bash vscode \
  && git config --system --add safe.directory '*' \
  && mkdir -p /workspace \
  && chown -R vscode:vscode /workspace

USER vscode
WORKDIR /workspace
CMD ["sleep", "infinity"]
