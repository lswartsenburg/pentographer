import { NextRequest, NextResponse } from "next/server";
import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";
import { buildContext } from "./context";
import type { GraphQLContext } from "./context";

type ServerContext = { userId: string | null; orgId: string };

const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });

const yoga = createYoga<ServerContext, GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  graphiql: true,
  context: ({ userId, orgId }): GraphQLContext => ({ userId, orgId }),
});

export async function GET(req: NextRequest) {
  // Allow unauthenticated GET so the GraphiQL browser UI loads.
  const accepts = req.headers.get("accept") ?? "";
  if (accepts.includes("text/html")) {
    return yoga.fetch(req, { userId: "", orgId: "" });
  }
  const ctx = await buildContext(req);
  if (ctx instanceof NextResponse) return ctx;
  return yoga.fetch(req, ctx);
}

export async function POST(req: NextRequest) {
  const ctx = await buildContext(req);
  if (ctx instanceof NextResponse) return ctx;
  return yoga.fetch(req, ctx);
}
