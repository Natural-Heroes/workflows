/**
 * GraphQL operations for Perdoo Objectives.
 *
 * NOTE: These operation signatures are LOW confidence and will be
 * validated/updated after introspection in Plan 03.
 */

/**
 * List objectives with relay-style pagination.
 *
 * Returns a connection with pageInfo and edges containing basic objective fields.
 */
export const OBJECTIVES_QUERY = `
  query ListObjectives($first: Int, $after: String) {
    objectives(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          name
          status
          progress
          timeframe {
            name
          }
        }
      }
    }
  }
`;

/**
 * Get a single objective by ID with full details.
 *
 * Returns all available fields including relationships.
 */
export const OBJECTIVE_QUERY = `
  query GetObjective($id: ID!) {
    objective(id: $id) {
      id
      name
      description
      status
      progress
      timeframe {
        name
      }
      lead {
        id
        name
      }
      groups {
        edges {
          node {
            id
            name
          }
        }
      }
      results {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
`;

/**
 * Create a new objective.
 *
 * Returns the created objective's basic fields.
 */
export const CREATE_OBJECTIVE_MUTATION = `
  mutation CreateObjective($input: CreateObjectiveInput!) {
    createObjective(input: $input) {
      objective {
        id
        name
        status
      }
    }
  }
`;

/**
 * Update an existing objective.
 *
 * Returns the updated objective's fields including progress.
 */
export const UPDATE_OBJECTIVE_MUTATION = `
  mutation UpdateObjective($id: ID!, $input: UpdateObjectiveInput!) {
    updateObjective(id: $id, input: $input) {
      objective {
        id
        name
        status
        progress
      }
    }
  }
`;
