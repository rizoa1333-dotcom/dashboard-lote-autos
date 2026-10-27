FROM n8nio/n8n@sha256:d02752c6ab446ae9db8deec2f9cc887c378f77cdcad31650814df936b7386dfb
USER root
WORKDIR /opt/velodrive-security
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY harden-runtime.cjs ./harden-runtime.cjs
RUN node ./harden-runtime.cjs
USER node
WORKDIR /home/node
