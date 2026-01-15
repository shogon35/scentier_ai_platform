/**
 * BigQuery MCP HTTP Server
 *
 * This server wraps the stdio-based @ergut/mcp-bigquery-server
 * and exposes it as an HTTP/SSE endpoint compatible with LibreChat's
 * streamable-http MCP type.
 */

const express = require('express');
const { spawn } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID || 'scentier-analyzer';
const BQ_LOCATION = process.env.BQ_LOCATION || 'US';

let mcpProcess = null;
let messageId = 0;
const pendingRequests = new Map();

/**
 * Start the MCP server process
 */
function startMcpProcess() {
  if (mcpProcess) {
    return;
  }

  console.log('Starting BigQuery MCP server...');

  mcpProcess = spawn('npx', ['-y', '@ergut/mcp-bigquery-server'], {
    env: {
      ...process.env,
      BQ_PROJECT_ID,
      BQ_LOCATION
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';

  mcpProcess.stdout.on('data', (data) => {
    buffer += data.toString();

    // Process complete JSON-RPC messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('MCP Response:', JSON.stringify(response));

          if (response.id !== undefined && pendingRequests.has(response.id)) {
            const { resolve } = pendingRequests.get(response.id);
            pendingRequests.delete(response.id);
            resolve(response);
          }
        } catch (e) {
          console.error('Failed to parse MCP response:', line);
        }
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error('MCP stderr:', data.toString());
  });

  mcpProcess.on('close', (code) => {
    console.log(`MCP process exited with code ${code}`);
    mcpProcess = null;

    // Reject all pending requests
    for (const [id, { reject }] of pendingRequests) {
      reject(new Error('MCP process closed'));
      pendingRequests.delete(id);
    }
  });

  mcpProcess.on('error', (err) => {
    console.error('MCP process error:', err);
    mcpProcess = null;
  });
}

/**
 * Send a JSON-RPC request to the MCP process
 */
function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      startMcpProcess();
      // Wait a bit for the process to start
      setTimeout(() => {
        if (!mcpProcess) {
          reject(new Error('Failed to start MCP process'));
          return;
        }
        doSendRequest(method, params, resolve, reject);
      }, 2000);
    } else {
      doSendRequest(method, params, resolve, reject);
    }
  });
}

function doSendRequest(method, params, resolve, reject) {
  const id = ++messageId;
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params
  };

  console.log('Sending to MCP:', JSON.stringify(request));
  pendingRequests.set(id, { resolve, reject });

  mcpProcess.stdin.write(JSON.stringify(request) + '\n');

  // Timeout after 30 seconds
  setTimeout(() => {
    if (pendingRequests.has(id)) {
      pendingRequests.delete(id);
      reject(new Error('Request timeout'));
    }
  }, 30000);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bq-mcp-server' });
});

// MCP endpoints
app.post('/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    console.log(`Received MCP request: ${method}`);

    const response = await sendRequest(method, params);
    res.json(response);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// Initialize endpoint
app.post('/mcp/initialize', async (req, res) => {
  try {
    const response = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'librechat',
        version: '1.0.0'
      }
    });
    res.json(response);
  } catch (error) {
    console.error('Initialize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List tools endpoint
app.get('/mcp/tools', async (req, res) => {
  try {
    // First initialize if needed
    if (!mcpProcess) {
      await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'librechat',
          version: '1.0.0'
        }
      });
    }

    const response = await sendRequest('tools/list', {});
    res.json(response);
  } catch (error) {
    console.error('List tools error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call tool endpoint
app.post('/mcp/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    console.log(`Calling tool: ${name} with args:`, args);

    const response = await sendRequest('tools/call', {
      name,
      arguments: args
    });
    res.json(response);
  } catch (error) {
    console.error('Tool call error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for streaming (if needed)
app.get('/mcp/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write('data: {"type":"connected"}\n\n');

  req.on('close', () => {
    console.log('SSE connection closed');
  });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BigQuery MCP HTTP Server listening on port ${PORT}`);
  console.log(`BQ_PROJECT_ID: ${BQ_PROJECT_ID}`);
  console.log(`BQ_LOCATION: ${BQ_LOCATION}`);

  // Pre-start the MCP process
  startMcpProcess();
});
