FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS apk-tools
FROM n8nio/n8n@sha256:80e23ced901f0e22597d4f3464e3aaf9d835372262ea6f08ef760d8ca35df25c
USER root
COPY --from=apk-tools /sbin/apk /usr/lib/libapk.so.3.0.0 /opt/velodrive-apk/
RUN LD_LIBRARY_PATH=/opt/velodrive-apk /opt/velodrive-apk/apk add --no-cache 'brotli-libs=1.2.1-r0' 'libcurl=8.23.0-r0' \
    && rm -rf /opt/velodrive-apk
WORKDIR /opt/velodrive-security
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY harden-runtime.cjs mcp-patches.cjs mcp-input-guard.cjs ./
RUN node ./harden-runtime.cjs
USER node
WORKDIR /home/node
