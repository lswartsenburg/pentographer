export const typeDefs = /* GraphQL */ `
  type Mutation {
    # Finding mutations
    createFinding(projectId: ID!, input: FindingInput!): Finding!
    updateFindingStatus(findingId: ID!, status: FindingStatus!, justification: String): Finding!
    addFindingVersion(findingId: ID!, input: FindingVersionInput!): FindingVersion!

    # Playbook mutations
    createPlaybook(input: PlaybookInput!): Playbook!
    updatePlaybook(id: ID!, input: PlaybookUpdateInput!): Playbook!
    createPlaybookVersion(playbookId: ID!, input: PlaybookVersionInput!): PlaybookVersion!
    publishPlaybookVersion(versionId: ID!): PlaybookVersion!
    addPlaybookCategory(versionId: ID!, input: PlaybookCategoryInput!): PlaybookCategory!
    addPlaybookItem(categoryId: ID!, input: PlaybookItemInput!): PlaybookItem!
    updatePlaybookItem(itemId: ID!, input: PlaybookItemUpdateInput!): PlaybookItem!
  }

  # --- Finding inputs ---

  input FindingInput {
    title: String!
    riskLevel: RiskLevel!
    description: String
    remediation: String
    playbookItemId: ID
  }

  input FindingVersionInput {
    title: String
    description: String
    remediation: String
    riskLevel: RiskLevel
    cvssScore: Float
  }

  # --- Playbook inputs ---

  input PlaybookInput {
    name: String!
    description: String
    isPublic: Boolean
  }

  input PlaybookUpdateInput {
    name: String
    description: String
    isPublic: Boolean
  }

  input PlaybookVersionInput {
    version: String!
    changelog: String
  }

  input PlaybookCategoryInput {
    name: String!
    frameworkRef: String
    displayOrder: Int
  }

  input PlaybookItemInput {
    name: String!
    description: String
    defaultRemediation: String
    defaultRisk: RiskLevel
    displayOrder: Int
  }

  input PlaybookItemUpdateInput {
    name: String
    description: String
    defaultRemediation: String
    defaultRisk: RiskLevel
    active: Boolean
  }

  # --- Queries ---

  type Query {
    me: User
    customers: [Customer!]!
    customer(id: ID!): Customer
    projects(customerId: ID): [Project!]!
    project(id: ID!): Project
    playbooks: [Playbook!]!
    playbook(id: ID!): Playbook
  }

  # --- Types ---

  type User {
    id: ID!
    name: String!
    email: String!
    companyName: String
  }

  type Customer {
    id: ID!
    name: String!
    contactEmail: String
    projects: [Project!]!
  }

  type Project {
    id: ID!
    name: String!
    status: ProjectStatus!
    scope: String
    applicationUrl: String
    startDate: String
    endDate: String
    customer: Customer
    findings: [Finding!]!
  }

  type Finding {
    id: ID!
    title: String!
    riskLevel: RiskLevel!
    cvssScore: Float
    status: FindingStatus!
    latestVersion: FindingVersion
    versions: [FindingVersion!]!
  }

  type FindingVersion {
    id: ID!
    title: String!
    description: String
    remediation: String
    riskLevel: RiskLevel!
    cvssScore: Float
    status: FindingStatus!
    authorType: AuthorType!
    createdAt: String!
  }

  type Playbook {
    id: ID!
    name: String!
    description: String
    isPublic: Boolean!
    versions: [PlaybookVersion!]!
    activeVersion: PlaybookVersion
    categories: [PlaybookCategory!]!
  }

  type PlaybookVersion {
    id: ID!
    version: String!
    changelog: String
    status: String!
    isActive: Boolean!
    categories: [PlaybookCategory!]!
  }

  type PlaybookCategory {
    id: ID!
    name: String!
    frameworkRef: String
    items: [PlaybookItem!]!
  }

  type PlaybookItem {
    id: ID!
    name: String!
    description: String
    defaultRemediation: String
    defaultRisk: RiskLevel!
    active: Boolean!
  }

  # --- Enums ---

  enum RiskLevel {
    high
    medium
    low
    informational
  }

  enum FindingStatus {
    draft
    in_review
    confirmed
    informational
    false_positive
  }

  enum ProjectStatus {
    in_progress
    under_review
    complete
  }

  enum AuthorType {
    human
    ai
  }
`;
