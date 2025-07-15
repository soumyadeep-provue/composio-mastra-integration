# Composio MCP Integration with Mastra

This project demonstrates how to integrate Composio's MCP (Model Context Protocol) tools with Mastra agents, specifically for Gmail functionality. The implementation provides OAuth authorization links directly in the chat interface with **dynamic tool loading** - no application restart required!

## Features

- ✅ **OAuth in Chat**: Authorization links provided directly in chat responses
- ✅ **Dynamic Tool Loading**: Tools automatically refresh when authentication changes
- ✅ **No Restart Required**: Authentication changes are detected automatically
- ✅ **Performance Optimized**: Multi-level caching for fast responses
- ✅ **MCP Tools Integration**: Direct access to Composio's Gmail MCP tools
- ✅ **User-Specific Sessions**: Each user gets their own authenticated context
- ✅ **Real-time Updates**: Agent adapts to authentication changes instantly

## Quick Start

### 1. Environment Setup

```bash
# Install dependencies
npm install

# Set environment variables
export COMPOSIO_API_KEY="your_composio_api_key"
```

### 2. Update Gmail Auth Config

Edit `src/mastra/agents/gmail-auth.ts` and update the `GMAIL_AUTH_CONFIG_ID`:

```typescript
const GMAIL_AUTH_CONFIG_ID = 'your_gmail_auth_config_id';
```

### 3. Start the Application

```bash
npm run dev
```

## Usage

### Seamless Authentication Flow

The agent automatically adapts to authentication changes without any restarts:

#### Step 1: Initial Interaction (Unauthenticated)
```
User: "Read my latest email"

Agent: "⚠️ Gmail tools are available but NOT YET AUTHENTICATED.

To use Gmail tools, you need to authenticate first:
1. Use the 'initiate_gmail_oauth' tool to get the authorization URL
2. Click the URL and complete Gmail authentication  
3. After authentication, all Gmail tools will work automatically!"
```

#### Step 2: Getting OAuth URL
```
User: "Help me authenticate with Gmail"

Agent: [Uses initiate_gmail_oauth tool]
"Please click this OAuth URL to authorize Gmail access: https://backend.composio.dev/api/v3/s/...

After authorization, the Gmail tools will automatically be able to access your Gmail data."
```

#### Step 3: Immediate Tool Access (No Restart!)
```
User: "I completed authentication. Now read my latest email"

Agent: "✅ Gmail is connected and authenticated! (Account ID: ca_...)

[Fetches and summarizes latest email using Gmail MCP tools]"
```

### Available Tools

#### Always Available
- `initiate_gmail_oauth`: Provides OAuth URL directly in chat

#### After Authentication (Automatically Available)
- All Gmail MCP tools (read emails, send emails, search, etc.)
- Tools automatically use the user's authenticated session
- **No restart required** - tools are loaded dynamically

## Architecture

### Files Structure

```
src/mastra/
├── index.ts              # Main Mastra instance with dynamic agent
├── agents/
│   ├── gmailAgent.ts     # Dynamic agent with caching & auto-refresh
│   └── gmail-auth.ts     # Authentication logic with debugging
└── mcp/
    └── server.ts         # MCP server configuration
```

### Key Components

1. **Dynamic Agent**: Automatically detects authentication changes
2. **Multi-Level Caching**: 
   - Tool cache (5 minutes)
   - Auth status cache (5 minutes)  
   - MCP client cache (persistent)
3. **Real-time Instructions**: Agent instructions update based on auth status
4. **Performance Optimization**: Cached tools load in ~100-200ms

## Performance Features

### Caching Strategy
- **First Request**: ~2-3 seconds (loads from MCP server)
- **Subsequent Requests**: ~100-200ms (⚡ cached tools)
- **Auth Status**: Cached for 5 minutes to avoid repeated API calls
- **Smart Invalidation**: Cache clears automatically on auth changes

### Visual Feedback
- `⚡ Using cached tools (X tools)` - Super fast cached execution
- `🔌 Creating new MCP client` - Only when needed
- `🔧 Loaded X fresh tools` - Only on cache miss
- `🔍 Checking fresh auth status` - When cache expires

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- Gmail Auth Config ID: Set in `src/mastra/agents/gmail-auth.ts`

## Debugging

The implementation includes comprehensive debugging output:

```bash
# Auth status checks
🔍 [GmailAuth] Checking connections for user: default
🔍 [GmailAuth] Found X connections
🔍 [GmailAuth] Gmail connection found: {id: "ca_...", status: "ACTIVE"}

# Agent behavior
📋 Instructions: User default auth status: AUTHENTICATED
🔧 Tools: User default auth status: AUTHENTICATED  
🌐 MCP URL: https://mcp.composio.dev/...?connected_account_id=ca_...

# Performance monitoring
⚡ Using cached tools (23 tools)
```

## Troubleshooting

### Authentication Issues
- Check debug output for connection status
- Verify `GMAIL_AUTH_CONFIG_ID` matches your Composio config
- Ensure Composio API key is valid
- Look for error messages in `[GmailAuth]` logs

### Performance Issues
- Check for cache hit/miss messages
- Monitor MCP client creation frequency
- Verify tools are being cached properly

### Tool Execution Issues
- Ensure authentication is complete before using Gmail tools
- Check MCP server URL in debug output
- Verify connected_account_id is included in authenticated URLs

## Benefits Over Traditional Approaches

- ✅ **No Restart Required**: Authentication changes detected automatically
- ✅ **OAuth in Chat**: No need to check console for authorization links
- ✅ **Performance Optimized**: Multi-level caching for speed
- ✅ **Real-time Updates**: Agent adapts instantly to auth changes
- ✅ **Better UX**: Seamless authentication flow
- ✅ **Scalable**: User-specific caching and sessions
- ✅ **Maintainable**: Clean dynamic agent pattern

## Example Complete Flow

```
User: "Read my latest email"
Agent: "⚠️ Gmail tools are available but NOT YET AUTHENTICATED..."

User: "Help me connect Gmail"  
Agent: [Provides OAuth URL] "Please click this link..."

User: [Completes OAuth in browser]

User: "Now read my latest email"
Agent: "✅ Gmail is connected! [Fetches email data]"
```

## Implementation Highlights

### Dynamic Agent Pattern
- Uses Mastra's dynamic `instructions` and `tools` functions
- Runtime context support for user-specific authentication
- Automatic tool loading based on current auth state

### Advanced Caching
- Tool cache with TTL (time-to-live)
- Auth status cache to reduce API calls
- MCP client connection pooling
- Smart cache invalidation on auth changes

### Performance Monitoring
- Comprehensive logging for debugging
- Cache hit/miss tracking
- Performance metrics in console output

## Production Considerations

- **Database Storage**: Replace in-memory auth cache with persistent storage
- **User Management**: Implement proper user session management  
- **Security**: Use secure token storage and validation
- **Monitoring**: Add proper application monitoring and alerts
- **Rate Limiting**: Implement rate limiting for API calls
- **Error Handling**: Add robust error handling and retry logic

## Support

For issues or questions:
- Check debug output for detailed error information
- Refer to Composio MCP documentation
- Open an issue in this repository with debug logs 