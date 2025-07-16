# Build stage
FROM node:22 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM node:22

WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production

RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "5173"]

EXPOSE 5173

# Command to build and run the Docker container, not recomended
# docker build -t texlyre . && docker run -p 5173:5173 texlyre