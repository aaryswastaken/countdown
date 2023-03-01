FROM node:19

WORKDIR /usr/src/app

COPY ./package.json .

RUN npm install bcrypt
RUN npm install

COPY . .

CMD [ "node", "server.js" ]