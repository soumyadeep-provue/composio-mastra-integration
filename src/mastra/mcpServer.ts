// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { MCPServer } from '@mastra/mcp';
import { gmailMcpAgent } from './agents/gmailAgent';

// Create the MCP server with your Gmail agent
const server = new MCPServer({
  name: 'Gmail MCP Server',
  version: '1.0.0',
  description: 'MCP server exposing Gmail functionality through Composio integration',
  tools: {}, // Required field - agents will be exposed as tools automatically
  agents: {
    gmail: gmailMcpAgent, // This will become tool "ask_gmail"
  },
});

// Set up HTTP server
const PORT = process.env.MCP_PORT || 3001;

const httpServer = http.createServer(async (req, res) => {
  // Enable CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    await server.startHTTP({
      url: new URL(req.url || '', `http://localhost:${PORT}`),
      httpPath: '/mcp',
      req,
      res,
      options: {
        sessionIdGenerator: () => {
          // Generate a simple session ID - in production, use a more secure method
          return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        },
        onsessioninitialized: (sessionId: string) => {
          console.log(`🔄 New MCP session initialized: ${sessionId}`);
        },
      },
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`🚀 Gmail MCP Server listening on port ${PORT}`);
  console.log(`📡 MCP clients can connect to: http://localhost:${PORT}/mcp`);
  console.log(`🔧 Available tools: ask_gmail (Gmail agent)`);
  console.log(`📧 Gmail agent provides authentication and Gmail operations`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down Gmail MCP Server...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 