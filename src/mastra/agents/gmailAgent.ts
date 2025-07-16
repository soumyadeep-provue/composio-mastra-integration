// src/mastra/agents/gmail-agent.ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { MCPClient } from '@mastra/mcp';
import { Composio } from '@composio/core';
import { createTool } from '@mastra/core/tools';
import { v4 as uuidv4 } from 'uuid';

// Initialize Composio client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Global caches for performance optimization
const mcpClientCache = new Map<string, MCPClient>();
const toolsCache = new Map<string, any>();
const authStatusCache = new Map<string, { connected: boolean, connectionId: string | null, timestamp: number }>();

// Persistent user ID storage - in production, this should be stored in a database
const userSessionCache = new Map<string, string>();

// Cache TTL (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Helper function to get or generate user ID with persistence
const getUserId = (runtimeContext?: any): string => {
  const contextUserId = runtimeContext?.get('userId') as string;
  if (contextUserId) {
    console.log(`📋 Using provided userId: ${contextUserId}`);
    return contextUserId;
  }
  
  // Try to get a session identifier to maintain user identity
  const sessionId = runtimeContext?.get('sessionId') as string || 'default-session';
  
  // Check if we already have a userId for this session
  if (userSessionCache.has(sessionId)) {
    const existingUserId = userSessionCache.get(sessionId)!;
    console.log(`🔄 Using existing userId for session ${sessionId}: ${existingUserId}`);
    return existingUserId;
  }
  
  // Generate new UUID and store it for this session
  const generatedUserId = uuidv4();
  userSessionCache.set(sessionId, generatedUserId);
  console.log(`🆔 Generated new userId for session ${sessionId}: ${generatedUserId}`);
  return generatedUserId;
};

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
const getCachedAuthStatus = async (userId: string) => {
  const cacheKey = `auth-${userId}`;
  const cached = authStatusCache.get(cacheKey);
  
  if (cached && isCacheValid(cached.timestamp)) {
    console.log(`📋 Using cached auth status for ${userId}: ${cached.connected ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    return cached;
  }
  
  // Fetch fresh auth status using Composio's connection check
  console.log(`🔍 Checking fresh auth status for user: ${userId}`);
  try {
    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
    });
    
    const gmailConnection = connections.items.find(conn => 
      conn.toolkit.slug === 'gmail' && conn.status === 'ACTIVE'
    );
    
    const authStatus = {
      connected: !!gmailConnection,
      connectionId: gmailConnection?.id || null,
      timestamp: Date.now()
    };
    
    console.log(`🔍 Auth check result: ${authStatus.connected ? `AUTHENTICATED (ID: ${authStatus.connectionId})` : 'NOT AUTHENTICATED'}`);
    
    authStatusCache.set(cacheKey, authStatus);
    return authStatus;
  } catch (error) {
    console.error('Error checking auth status:', error);
    const authStatus = { connected: false, connectionId: null, timestamp: Date.now() };
    authStatusCache.set(cacheKey, authStatus);
    return authStatus;
  }
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
 * Gmail MCP Agent with simplified Composio authorization.
 * Uses Composio's built-in authorize() method instead of custom OAuth handling.
 */
export const gmailMcpAgent = new Agent({
  name: 'Gmail MCP Agent',
  
  instructions: async ({ runtimeContext }: { runtimeContext?: any }) => {
    // Get userId from runtime context or generate UUID
    const userId = getUserId(runtimeContext);
    
    // Use cached auth status for speed
    const authStatus = await getCachedAuthStatus(userId);
    
    console.log(`📋 Instructions: User ${userId} auth status: ${authStatus.connected ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    
    if (authStatus.connected) {
      return `You are a Gmail assistant with full access to authenticated Gmail tools.

✅ Gmail is connected and authenticated! (Account ID: ${authStatus.connectionId})

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
1. Use the 'authorize_gmail' tool to get the authorization URL
2. Ask the user to click the URL and complete Gmail authentication
3. After authentication, all Gmail tools will work with their Gmail data

The tools are loaded and ready - they just need Gmail authentication to access user data.`;
    }
  },

  model: openai('gpt-4o-mini'),

  tools: async ({ runtimeContext }: { runtimeContext?: any }) => {
    // Get userId from runtime context or generate UUID
    const userId = getUserId(runtimeContext);
    
    // Simplified OAuth tool using Composio's authorize() method
    const authorizeTool = createTool({
      id: 'authorize_gmail',
      description: 'Authorizes Gmail access using Composio\'s built-in OAuth flow. Use this to connect your Gmail account so the Gmail tools can access your data.',
              execute: async () => {
          try {
            console.log(`🔄 Starting Gmail authorization for user: ${userId}`);
            console.log(`📊 Current user sessions:`, Object.fromEntries(userSessionCache));
          
          // Use Composio's built-in authorize method - much simpler!
          const connectionRequest = await composio.toolkits.authorize(userId, 'gmail');
          
          // Clear auth cache on new connection
          authStatusCache.delete(`auth-${userId}`);
          console.log(`🔄 Cleared auth cache for ${userId} after OAuth initiation`);
          
          return {
            success: true,
            authUrl: connectionRequest.redirectUrl,
            connectionId: connectionRequest.id,
            message: `Please click this link to authorize Gmail access: ${connectionRequest.redirectUrl}
            
After authorization, your Gmail tools will automatically work with your Gmail data.
You can also wait for the connection to be established and then try using Gmail tools.`
          };
        } catch (error) {
          console.error('Error during Gmail authorization:', error);
          return {
            success: false,
            error: `Failed to initiate Gmail authorization: ${error}`,
            message: 'Please try again or check your Composio configuration.'
          };
        }
      }
    });

    // Use cached auth status for speed
    const authStatus = await getCachedAuthStatus(userId);
    
    console.log(`🔧 Tools: User ${userId} auth status: ${authStatus.connected ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
    
    // Create cache key for this user/auth state
    const cacheKey = `gmail-${userId}-${authStatus.connectionId || 'unauth'}`;
    
    // Create MCP URL with or without authentication
    const url = authStatus.connectionId
      ? `https://mcp.composio.dev/composio/server/524a8d53-e118-46f8-abf0-f077f281469e/mcp?connected_account_id=${authStatus.connectionId}`
      : 'https://mcp.composio.dev/composio/server/524a8d53-e118-46f8-abf0-f077f281469e/mcp';

    console.log(`🌐 MCP URL: ${url}`);

    // Get cached tools or fetch fresh
    const allTools = await getCachedTools(cacheKey, url, userId);

    // Return combined tools
    return {
      authorize_gmail: authorizeTool,
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
  userSessionCache.clear();
};

// Clear cache when authentication changes (call this after successful OAuth)
export const clearGmailAgentCache = (userId: string) => {
  authStatusCache.delete(`auth-${userId}`);
  // Clear both auth states for this user
  const authKey = `gmail-${userId}-unauth`;
  const unauthKey = `gmail-${userId}-null`;
  cleanupMCPClient(authKey);
  cleanupMCPClient(unauthKey);
};

// Clear session cache (useful for testing or user logout)
export const clearUserSession = (sessionId?: string) => {
  if (sessionId) {
    userSessionCache.delete(sessionId);
    console.log(`🗑️ Cleared session: ${sessionId}`);
  } else {
    userSessionCache.clear();
    console.log(`🗑️ Cleared all user sessions`);
  }
};