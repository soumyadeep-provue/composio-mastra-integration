// src/mastra/agents/gmail-auth.ts
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Gmail OAuth configuration
const GMAIL_AUTH_CONFIG_ID = 'ac_u_MdLEvtemfj'; // Replace with your actual config ID

/**
 * Handles Gmail authentication and connection management
 */
export class GmailAuth {
  private userId: string;

  constructor(userId: string = 'default') {
    this.userId = userId;
  }

  /**
   * Check if user has an active Gmail connection
   */
  async checkConnection() {
    try {
      console.log(`🔍 [GmailAuth] Checking connections for user: ${this.userId}, authConfig: ${GMAIL_AUTH_CONFIG_ID}`);
      
      const connections = await composio.connectedAccounts.list({
        userIds: [this.userId],
        authConfigIds: [GMAIL_AUTH_CONFIG_ID],
      });
      
      console.log(`🔍 [GmailAuth] Found ${connections.items.length} connections`);
      console.log(`🔍 [GmailAuth] Connections:`, connections.items.map(conn => ({
        id: conn.id,
        toolkit: conn.toolkit.slug,
        status: conn.status
      })));
      
      const gmailConnection = connections.items.find(conn => 
        conn.toolkit.slug === 'gmail' && conn.status === 'ACTIVE'
      );
      
      console.log(`🔍 [GmailAuth] Gmail connection found:`, gmailConnection ? {
        id: gmailConnection.id,
        status: gmailConnection.status,
        toolkit: gmailConnection.toolkit.slug
      } : 'None');
      
      return {
        connected: !!gmailConnection,
        connectionId: gmailConnection?.id,
        message: gmailConnection 
          ? 'Gmail is connected and ready to use.'
          : 'Gmail is not connected. Use initiateConnection to connect.',
      };
    } catch (error) {
      console.error(`❌ [GmailAuth] Error checking connection:`, error);
      return {
        connected: false,
        error: `Failed to check Gmail connection: ${error}`,
      };
    }
  }

  /**
   * Initiate Gmail OAuth connection
   */
  async initiateConnection() {
    try {
      const connection = await composio.connectedAccounts.initiate(this.userId, GMAIL_AUTH_CONFIG_ID);
      
      console.log(`[Gmail MCP Agent] Authorize at: ${connection.redirectUrl}`);
      
      return {
        success: true,
        redirectUrl: connection.redirectUrl,
        connectionId: connection.id,
        message: `Please click this link to connect your Gmail account: ${connection.redirectUrl}`,
      };
    } catch (error) {
      console.error(`❌ [GmailAuth] Error initiating connection:`, error);
      return {
        success: false,
        error: `Failed to initiate Gmail connection: ${error}`,
      };
    }
  }

  /**
   * Get the connected account ID for MCP server
   */
  async getConnectedAccountId() {
    const connectionStatus = await this.checkConnection();
    console.log(`🔍 [GmailAuth] getConnectedAccountId result:`, {
      connected: connectionStatus.connected,
      connectionId: connectionStatus.connectionId,
      error: connectionStatus.error
    });
    
    if (connectionStatus.connected && connectionStatus.connectionId) {
      return connectionStatus.connectionId;
    }
    return null;
  }
} 