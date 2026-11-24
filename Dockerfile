FROM node:20-alpine
WORKDIR /app
COPY package.json server.js index.html styles.css app.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
