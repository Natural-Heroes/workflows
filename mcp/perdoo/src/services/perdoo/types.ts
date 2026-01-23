/**
 * Perdoo GraphQL API types.
 *
 * Types for Perdoo OKR entities. These are initial placeholder types
 * that will be refined after schema introspection in Phase 1 Plan 3.
 */

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * GraphQL connection pagination info.
 */
export interface PageInfo {
  /** Whether there are more pages */
  hasNextPage: boolean;
  /** Whether there are previous pages */
  hasPreviousPage: boolean;
  /** Cursor for the first item */
  startCursor?: string;
  /** Cursor for the last item */
  endCursor?: string;
}

/**
 * Generic GraphQL connection type for paginated results.
 */
export interface Connection<T> {
  /** Array of edge nodes */
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  /** Pagination info */
  pageInfo: PageInfo;
  /** Total count of items */
  totalCount?: number;
}

// ============================================================================
// Domain Types (Placeholders - refined after introspection)
// ============================================================================

/**
 * Perdoo Objective entity.
 */
export interface Objective {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name: string;
  };
  team?: {
    id: string;
    name: string;
  };
  timeframe?: {
    id: string;
    name: string;
  };
  progress?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Response type for objectives list query.
 */
export interface ObjectivesData {
  objectives: Connection<Objective>;
}

/**
 * Response type for single objective query.
 */
export interface ObjectiveData {
  objective: Objective;
}

/**
 * Response type for create objective mutation.
 */
export interface CreateObjectiveData {
  createObjective: {
    objective: Objective;
  };
}

/**
 * Response type for update objective mutation.
 */
export interface UpdateObjectiveData {
  updateObjective: {
    objective: Objective;
  };
}

// ============================================================================
// Input Types (Placeholders - refined after introspection)
// ============================================================================

/**
 * Input for creating an objective.
 */
export interface CreateObjectiveInput {
  name: string;
  description?: string;
  ownerId?: string;
  teamId?: string;
  timeframeId?: string;
  [key: string]: unknown;
}

/**
 * Input for updating an objective.
 * Note: id is passed separately to the mutation, not in the input.
 */
export interface UpdateObjectiveInput {
  name?: string;
  description?: string;
  ownerId?: string;
  teamId?: string;
  timeframeId?: string;
  [key: string]: unknown;
}

// ============================================================================
// Introspection Types
// ============================================================================

/**
 * Response type for schema introspection query.
 */
export interface IntrospectionData {
  __schema: {
    queryType: { name: string } | null;
    mutationType: { name: string } | null;
    subscriptionType: { name: string } | null;
    types: Array<{
      kind: string;
      name: string;
      description?: string;
      fields?: Array<{
        name: string;
        description?: string;
        args: Array<{
          name: string;
          description?: string;
          type: IntrospectionTypeRef;
          defaultValue?: string;
        }>;
        type: IntrospectionTypeRef;
      }>;
      inputFields?: Array<{
        name: string;
        description?: string;
        type: IntrospectionTypeRef;
        defaultValue?: string;
      }>;
      enumValues?: Array<{
        name: string;
        description?: string;
      }>;
    }>;
  };
}

/**
 * GraphQL introspection type reference (recursive).
 */
export interface IntrospectionTypeRef {
  kind: string;
  name?: string;
  ofType?: IntrospectionTypeRef;
}
