# The daemon of agentree: the core, the command, the UI it serves and MCP, with git and the Docker client it starts a project's containers with.
FROM node:26.13.1-alpine AS ui
WORKDIR /app/ui
RUN npm install --global pnpm@12.23.0
COPY ui/package.json ui/pnpm-lock.yaml ui/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY ui ./
RUN pnpm build

FROM node:26.13.1-alpine
RUN apk add --no-cache git docker-cli && npm install --global pnpm@12.23.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
COPY extension ./extension
COPY rfcs/0001-agentree/standard ./rfcs/0001-agentree/standard
COPY seed/icon-grab ./seed/icon-grab
COPY --from=ui /app/ui/dist ./ui/dist
# The command by its name, for the daemon's own hooks and for `docker exec`.
RUN ln -s /app/src/command/main.ts /usr/local/bin/agentree
ENV AGENTREE_HOME=/var/lib/agentree AGENTREE_HOST=0.0.0.0
VOLUME /var/lib/agentree
EXPOSE 4517
CMD ["agentree", "serve"]
