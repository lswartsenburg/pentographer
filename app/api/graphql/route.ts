import { NextRequest } from "next/server";
import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { requireApiKey } from "@/lib/api-key-auth";
import type { GraphQLContext } from "./context";

// ServerContext is what we inject when calling yoga.fetch(req, serverCtx)
type ServerContext = { userId: string };

const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });

const yoga = createYoga<ServerContext, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  context: ({ userId }): GraphQLContext => ({ userId }),
});

export async function GET(req: NextRequest) {
  // Allow unauthenticated GET so the GraphiQL browser UI loads.
  // Actual query execution still requires a valid API key (handled in POST).
  const accepts = req.headers.get("accept") ?? "";
  if (accepts.includes("text/html")) {
    return yoga.fetch(req, { userId: "" });
  }
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;
  return yoga.fetch(req, { userId: auth.userId });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;
  return yoga.fetch(req, { userId: auth.userId });
}
