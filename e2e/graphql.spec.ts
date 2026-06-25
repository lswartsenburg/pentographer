import { test, expect, type APIRequestContext } from "@playwright/test";

async function gql(
  request: APIRequestContext,
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
) {
  const res = await request.post("/api/graphql", {
    headers: { Authorization: `Bearer ${token}` },
    data: { query, variables },
  });
  return { status: res.status(), body: await res.json() };
}

test.describe("GraphQL API", () => {
  let apiKey: string;
  let apiKeyId: string;
  let customerId: string;
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const customerRes = await request.post("/api/customers", {
      data: { name: `GQL Test Customer ${Date.now()}` },
    });
    expect(customerRes.status()).toBe(201);
    const cust = await customerRes.json();
    customerId = cust.id;

    const projectRes = await request.post("/api/projects", {
      data: { name: `GQL Test Project ${Date.now()}`, customerId },
    });
    expect(projectRes.status()).toBe(201);
    const proj = await projectRes.json();
    projectId = proj.id;

    const keyRes = await request.post("/api/settings/api-keys", {
      data: { name: `gql-integration-test-${Date.now()}` },
    });
    expect(keyRes.status()).toBe(201);
    const keyData = await keyRes.json();
    apiKey = keyData.key;
    apiKeyId = keyData.id;
  });

  test.afterAll(async ({ request }) => {
    if (apiKeyId) await request.delete(`/api/settings/api-keys/${apiKeyId}`);
    if (customerId) await request.delete(`/api/customers/${customerId}`);
  });

  test("rejects requests with no token", async ({ request }) => {
    const res = await request.post("/api/graphql", {
      data: { query: "{ me { id } }" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects requests with an invalid token", async ({ request }) => {
    const { status } = await gql(request, "ptg_not_a_real_key", "{ me { id } }");
    expect(status).toBe(401);
  });

  test("me returns the authenticated user", async ({ request }) => {
    const { status, body } = await gql(request, apiKey, "{ me { id name email } }");
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.me).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  test("customers returns array containing the test customer", async ({ request }) => {
    const { status, body } = await gql(request, apiKey, "{ customers { id name } }");
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    const ids = (body.data.customers as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(customerId);
  });

  test("customer(id) returns single customer with projects", async ({ request }) => {
    const { status, body } = await gql(
      request,
      apiKey,
      `query($id: ID!) { customer(id: $id) { id name projects { id name } } }`,
      { id: customerId }
    );
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.customer.id).toBe(customerId);
    const projectIds = (body.data.customer.projects as { id: string }[]).map((p) => p.id);
    expect(projectIds).toContain(projectId);
  });

  test("customer(id) returns null for a foreign id", async ({ request }) => {
    const { status, body } = await gql(
      request,
      apiKey,
      `query($id: ID!) { customer(id: $id) { id } }`,
      { id: "00000000-0000-0000-0000-000000000000" }
    );
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.customer).toBeNull();
  });

  test("projects returns array containing the test project", async ({ request }) => {
    const { status, body } = await gql(request, apiKey, "{ projects { id name status } }");
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    const ids = (body.data.projects as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(projectId);
  });

  test("project(id) returns project with findings array", async ({ request }) => {
    const { status, body } = await gql(
      request,
      apiKey,
      `query($id: ID!) { project(id: $id) { id name status findings { id } } }`,
      { id: projectId }
    );
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.project.id).toBe(projectId);
    expect(Array.isArray(body.data.project.findings)).toBe(true);
  });

  test("playbooks returns array", async ({ request }) => {
    const { status, body } = await gql(request, apiKey, "{ playbooks { id name isPublic } }");
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(Array.isArray(body.data.playbooks)).toBe(true);
  });

  test("createFinding mutation creates a finding", async ({ request }) => {
    const { status, body } = await gql(
      request,
      apiKey,
      `mutation($projectId: ID!, $input: FindingInput!) {
         createFinding(projectId: $projectId, input: $input) {
           id title riskLevel status
         }
       }`,
      { projectId, input: { title: "GQL Integration Test Finding", riskLevel: "high" } }
    );
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.createFinding).toMatchObject({
      id: expect.any(String),
      title: "GQL Integration Test Finding",
      riskLevel: "high",
      status: "draft",
    });
  });

  test("updateFindingStatus mutation transitions finding status", async ({ request }) => {
    // Create a finding first
    const { body: createBody } = await gql(
      request,
      apiKey,
      `mutation($projectId: ID!, $input: FindingInput!) {
         createFinding(projectId: $projectId, input: $input) { id status }
       }`,
      { projectId, input: { title: "Status Transition Test", riskLevel: "medium" } }
    );
    const findingId = createBody.data.createFinding.id;

    const { status, body } = await gql(
      request,
      apiKey,
      `mutation($findingId: ID!, $status: FindingStatus!) {
         updateFindingStatus(findingId: $findingId, status: $status) { id status }
       }`,
      { findingId, status: "in_review" }
    );
    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateFindingStatus.status).toBe("in_review");
  });

  test("querying a nonexistent field returns a GraphQL error", async ({ request }) => {
    const { status, body } = await gql(request, apiKey, "{ doesNotExist }");
    expect(status).toBe(200);
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });
});
