FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY index.html ./
COPY css ./css
COPY src ./src
COPY server ./server
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
