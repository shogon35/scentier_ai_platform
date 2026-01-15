# BigQuery MCP HTTP Server
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Install the BigQuery MCP server globally
RUN npm install -g @ergut/mcp-bigquery-server

# Copy server code
COPY server.js ./

# Environment variables
ENV PORT=8080
ENV BQ_PROJECT_ID=scentier-analyzer
ENV BQ_LOCATION=US
ENV GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-bq-key.json

EXPOSE 8080

CMD ["npm", "start"]
