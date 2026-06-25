import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTools } from "./tools/projects";
import { registerFindingTools } from "./tools/findings";
import { registerPlaybookTools } from "./tools/playbooks";

export function createMcpServer(userId: string, orgId: string): McpServer {
  const server = new McpServer({
    name: "pentographer",
    version: "1.0.0",
  });

  registerProjectTools(server, userId, orgId);
  registerFindingTools(server, userId);
  registerPlaybookTools(server, userId);

  return server;
}
