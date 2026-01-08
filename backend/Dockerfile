FROM node:22.18.0

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4500
CMD ["npm", "start"]
