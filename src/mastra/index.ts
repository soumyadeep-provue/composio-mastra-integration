
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { gmailMcpAgent } from './agents/gmailAgent';

// Create Mastra instance with the dynamic Gmail agent
export const mastra = new Mastra({
  workflows: {},
  agents: { 
    gmailagent: gmailMcpAgent  // Use the dynamic agent directly
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});

// Export helper function for direct agent access if needed
export const getGmailAgent = () => {
  return gmailMcpAgent;
};
