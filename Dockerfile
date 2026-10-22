# use bun (1.2.19) for building, same version as
# `packageManager`
FROM oven/bun:1.2.19 AS build

WORKDIR /app

# copy root package.json and lockfile
COPY bun.lock package.json bunfig.toml ./

# copy every package `package.json` to the working
# directory
COPY packages/proxy/package.json ./packages/proxy/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/

COPY www/package.json ./www/

# install dependencies
# `--ignore-scripts` is passed due to `msw` postinstall
# scripts was failling
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

RUN bunx turbo run build --filter=db-studio

# node for staging (same version as CI)
FROM node:24-bookworm-slim

WORKDIR /app

# copy from building stage
COPY --from=build /app/packages/server/package.json ./
COPY --from=build /app/packages/server/dist ./dist

# `devDependencies` aren't needed at runtime, we're deleting
# them before installing. `npm` rejects the `workspaces:*`
# also, we ommited `--ignore-scripts` from this step, we
# already added it to the runtime stage
RUN npm pkg delete devDependencies && npm install --omit=dev

# create a config directory and privialge the user node
RUN mkdir -p /home/node/config && chown -R node:node /home/node/config

# set the `DB_STUDIO_CONFIG_DIR`
ENV DB_STUDIO_CONFIG_DIR=/home/node/config
VOLUME ["/home/node/config"]

USER node

ENV HOST=0.0.0.0
ENV PORT=3333

EXPOSE 3333

# run
CMD ["node", "dist/index.js", "--no-open"]
