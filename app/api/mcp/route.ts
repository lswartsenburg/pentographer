import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireApiKey } from "@/lib/api-key-auth";
import { createMcpServer } from "./server";

async function handle(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const server = createMcpServer(auth.userId ?? "", auth.orgId ?? "");
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — each request is independent
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
