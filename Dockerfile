FROM node:22-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN chown node:node /app
COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci

COPY --chown=node:node . .
RUN npx prisma generate \
  && npm run build \
  && mkdir -p .data

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
