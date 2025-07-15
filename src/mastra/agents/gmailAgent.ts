// src/mastra/agents/gmail-agent.ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { MCPClient } from '@mastra/mcp';
import { GmailAuth } from './gmail-auth';
import { createTool } from '@mastra/core/tools';

// Global caches for performance optimization
const mcpClientCache = new Map<string, MCPClient>();
const toolsCache = new Map<string, any>();
const authStatusCache = new Map<string, { connectedAccountId: string | null, timestamp: number }>();

// Cache TTL (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Cleanup function to properly dispose of MCP clients
const cleanupMCPClient = async (key: string) => {
  const client = mcpClientCache.get(key);
  if (client) {
    try {
      await client.disconnect();
    } catch (error) {
      console.error('Error disconnecting MCP client:', error);
    }
    mcpClientCache.delete(key);
  }
  toolsCache.delete(key);
};

// Check if cache is still valid
const isCacheValid = (timestamp: number) => {
  return Date.now() - timestamp < CACHE_TTL;
};

// Get cached auth status or fetch fresh
const getCachedAuthStatus = async (userId: string, gmailAuth: GmailAuth) => {
  const cacheKey = `auth-${userId}`;
  const cached = authStatusCache.get(cacheKey);
  
  if (cached && isCacheValid(cached.timestamp)) {
    console.log(`📋 Using cached auth status for ${userId}: ${cached.connectedAccountId ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    return cached.connectedAccountId;
  }
  
  // Fetch fresh auth status
  console.log(`🔍 Checking fresh auth status for user: ${userId}`);
  const connectedAccountId = await gmailAuth.getConnectedAccountId();
  console.log(`🔍 Auth check result: ${connectedAccountId ? `AUTHENTICATED (ID: ${connectedAccountId})` : 'NOT AUTHENTICATED'}`);
  
  authStatusCache.set(cacheKey, {
    connectedAccountId,
    timestamp: Date.now()
  });
  
  return connectedAccountId;
};

// Get cached tools or fetch fresh
const getCachedTools = async (cacheKey: string, url: string, userId: string) => {
  // Check if we have valid cached tools
  if (toolsCache.has(cacheKey)) {
    console.log(`⚡ Using cached tools (${Object.keys(toolsCache.get(cacheKey)!).length} tools)`);
    return toolsCache.get(cacheKey)!;
  }

  // Check if we have an existing client
  let mcpClient = mcpClientCache.get(cacheKey);
  
  if (!mcpClient) {
    console.log(`🔌 Creating new MCP client for ${cacheKey}`);
    mcpClient = new MCPClient({
      id: `gmail-mcp-${userId}-${Date.now()}`,
      servers: {
        composio: {
          url: new URL(url),
        },
      },
    });
    mcpClientCache.set(cacheKey, mcpClient);
  }

  try {
    // Load tools from MCP server
    const tools = await mcpClient.getTools();
    console.log(`🔧 Loaded ${Object.keys(tools).length} fresh tools from Composio MCP server`);
    
    // Cache the tools
    toolsCache.set(cacheKey, tools);
    return tools;
    
  } catch (error) {
    console.error('Failed to load tools from MCP server:', error);
    // Clean up on error
    await cleanupMCPClient(cacheKey);
    return {};
  }
};

/**
 * Gmail MCP Agent with optimized caching for speed.
 * Uses persistent caching to avoid slow MCP client recreation.
 */
export const gmailMcpAgent = new Agent({
  name: 'Gmail MCP Agent',
  
  instructions: async ({ runtimeContext }) => {
    // Get userId from runtime context, fallback to 'default'
    const userId = (runtimeContext?.get('userId') as string) || 'default';
    const gmailAuth = new GmailAuth(userId);
    
    // Use cached auth status for speed
    const connectedAccountId = await getCachedAuthStatus(userId, gmailAuth);
    
    console.log(`📋 Instructions: User ${userId} auth status: ${connectedAccountId ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    
    if (connectedAccountId) {
      return `You are a Gmail assistant with full access to authenticated Gmail tools.

✅ Gmail is connected and authenticated! (Account ID: ${connectedAccountId})

You have full access to Gmail operations:
- Read emails from inbox
- Send emails  
- Search emails
- Manage email labels
- And many other Gmail operations

All tools are ready to use and will work with the user's authenticated Gmail account.`;
    } else {
      return `You are a Gmail assistant with access to Gmail tools, but authentication is required.

✅ Gmail tools are available but NOT YET AUTHENTICATED. 

Available tools include Gmail operations like:
- Reading emails
- Sending emails  
- Searching emails
- Managing labels
- And many other operations

However, to actually USE these Gmail tools, the user needs to authenticate first:
1. Use the 'initiate_gmail_oauth' tool to get the authorization URL
2. Ask the user to click the URL and complete Gmail authentication
3. After authentication, all Gmail tools will work with their Gmail data

The tools are loaded and ready - they just need Gmail authentication to access user data.`;
    }
  },

  model: openai('gpt-4o-mini'),

  tools: async ({ runtimeContext }) => {
    // Get userId from runtime context, fallback to 'default'
    const userId = (runtimeContext?.get('userId') as string) || 'default';
    const gmailAuth = new GmailAuth(userId);
    
    // OAuth tool (always available and cached)
    const oauthTool = createTool({
      id: 'initiate_gmail_oauth',
      description: 'Initiates Gmail OAuth flow and returns the authorization URL. Use this to connect your Gmail account so the Gmail tools can access your data.',
      execute: async () => {
        const connectionResult = await gmailAuth.initiateConnection();
        if (connectionResult.success) {
          // Clear auth cache on new connection
          authStatusCache.delete(`auth-${userId}`);
          console.log(`🔄 Cleared auth cache for ${userId} after OAuth initiation`);
          return {
            oauthUrl: connectionResult.redirectUrl,
            message: 'Please click the OAuth URL above to authorize Gmail access. After authorization, the Gmail tools will automatically be able to access your Gmail data.'
          };
        } else {
          return {
            error: 'Failed to initiate Gmail connection',
            message: 'Please try again or check your configuration.'
          };
        }
      }
    });

    // Use cached auth status for speed
    const connectedAccountId = await getCachedAuthStatus(userId, gmailAuth);
    
    console.log(`🔧 Tools: User ${userId} auth status: ${connectedAccountId ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    
    // Create cache key for this user/auth state
    const cacheKey = `gmail-${userId}-${connectedAccountId || 'unauth'}`;
    
    // Create MCP URL with or without authentication
    const url = connectedAccountId
      ? `https://mcp.composio.dev/composio/server/45799b7f-fa65-474b-95ad-b66019896efe/mcp?connected_account_id=${connectedAccountId}`
      : 'https://mcp.composio.dev/composio/server/45799b7f-fa65-474b-95ad-b66019896efe/mcp';

    console.log(`🌐 MCP URL: ${url}`);

    // Get cached tools or fetch fresh
    const allTools = await getCachedTools(cacheKey, url, userId);

    // Return combined tools
    return {
      initiate_gmail_oauth: oauthTool,
      ...allTools
    };
  },
});

// Cleanup function for graceful shutdown
export const cleanupGmailAgent = async () => {
  for (const key of mcpClientCache.keys()) {
    await cleanupMCPClient(key);
  }
  toolsCache.clear();
  authStatusCache.clear();
};

// Clear cache when authentication changes (call this after successful OAuth)
export const clearGmailAgentCache = (userId: string = 'default') => {
  authStatusCache.delete(`auth-${userId}`);
  // Clear both auth states for this user
  const authKey = `gmail-${userId}-unauth`;
  const unauthKey = `gmail-${userId}-null`;
  cleanupMCPClient(authKey);
  cleanupMCPClient(unauthKey);
};