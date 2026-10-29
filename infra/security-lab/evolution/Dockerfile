FROM evoapicloud/evolution-api@sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252 AS vendor

FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS assemble
RUN apk add --no-cache git
WORKDIR /evolution
COPY --from=vendor /evolution/ ./
COPY harden-manifest.cjs /tmp/harden-manifest.cjs
COPY harden-npm.cjs /tmp/harden-npm.cjs
COPY npm-security/ /opt/velodrive-npm-security/
COPY package-lock.json ./package-lock.json
RUN npm install --global --ignore-scripts --no-audit --no-fund npm@12.2.1 \
    && npm ci --prefix /opt/velodrive-npm-security --ignore-scripts --no-audit --no-fund \
    && node /tmp/harden-npm.cjs \
    && node /tmp/harden-manifest.cjs \
    && npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && node /tmp/harden-manifest.cjs --disable-link-previews \
    && DATABASE_PROVIDER=postgresql npm run db:generate \
    && node -e "import('baileys').then(m=>{for(const k of ['initAuthCreds','useMultiFileAuthState','makeCacheableSignalKeyStore'])if(typeof m[k]!=='function')throw Error('BAILEYS_API_INCOMPATIBLE')})"
FROM assemble AS patched
COPY harden-media.cjs /tmp/harden-media.cjs
COPY secure-media.cjs ./security/secure-media.cjs
COPY request-budget.cjs ./security/request-budget.cjs
RUN node /tmp/harden-media.cjs \
    && node --check dist/main.js \
    && node --check node_modules/baileys/lib/Utils/messages-media.js \
    && node -e "import('baileys').then(m=>{if(typeof m.downloadContentFromMessage!=='function')throw Error('BAILEYS_MEDIA_API_INCOMPATIBLE')})"

FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS runtime
RUN apk add --no-cache tzdata ffmpeg bash openssl
WORKDIR /evolution
COPY --from=assemble --chown=1000:1000 /evolution/ ./
COPY --from=patched --chown=1000:1000 /evolution/dist/main.js ./dist/main.js
COPY --from=patched --chown=1000:1000 /evolution/node_modules/baileys/lib/Utils/messages-media.js ./node_modules/baileys/lib/Utils/messages-media.js
COPY --from=patched --chown=1000:1000 /evolution/security/ ./security/
COPY --from=assemble /usr/local/lib/node_modules/npm/ /usr/local/lib/node_modules/npm/
ENV DOCKER_ENV=true TZ=America/Sao_Paulo NODE_ENV=production
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod"]
