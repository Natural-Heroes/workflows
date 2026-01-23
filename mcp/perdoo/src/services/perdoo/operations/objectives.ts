/**
 * GraphQL operations for Perdoo Objectives.
 *
 * Validated against real Perdoo API via __type queries.
 * - objectives query uses relay-style pagination with Django filter args
 * - objective query takes UUID! argument
 * - upsertObjective handles both create (no id) and update (with id)
 */

/**
 * List objectives with relay-style pagination and optional filters.
 *
 * Returns a connection with pageInfo and edges containing core objective fields.
 * Filter args use Django-style naming (e.g., name_Icontains, stage, lead_Id).
 */
export const OBJECTIVES_QUERY = `
  query ListObjectives(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $stage: String,
    $lead_Id: UUID,
    $groups_Id: UUID,
    $timeframe_Cadence_Id: UUID,
    $status: CommitStatus
  ) {
    objectives(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      stage: $stage,
      lead_Id: $lead_Id,
      groups_Id: $groups_Id,
      timeframe_Cadence_Id: $timeframe_Cadence_Id,
      status: $status
    ) {
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
          description
          progress
          status
          stage
          lead {
            id
            name
          }
          timeframe {
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
        }
      }
    }
  }
`;

/**
 * Get a single objective by UUID with full details.
 *
 * Returns all available fields including relationships.
 * Uses UUID! scalar type (not ID!).
 */
export const OBJECTIVE_QUERY = `
  query GetObjective($id: UUID!) {
    objective(id: $id) {
      id
      name
      description
      progress
      status
      stage
      weight
      private
      isCompanyGoal
      completed
      progressDriver
      goalUpdateCycle
      startDate
      dueDate
      createdDate
      lastEditedDate
      lead {
        id
        name
        email
      }
      timeframe {
        id
        name
      }
      parent {
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
      keyResults {
        edges {
          node {
            id
            name
          }
        }
      }
      children {
        edges {
          node {
            id
            name
          }
        }
      }
      contributors {
        edges {
          node {
            id
            name
          }
        }
      }
      tags {
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
 * Upsert (create or update) an objective.
 *
 * The Perdoo API uses a single upsert mutation instead of separate create/update.
 * - To create: omit `id` from input
 * - To update: include `id` in input
 *
 * Returns the objective and any validation errors.
 */
export const UPSERT_OBJECTIVE_MUTATION = `
  mutation UpsertObjective($input: UpsertObjectiveMutationInput!) {
    upsertObjective(input: $input) {
      objective {
        id
        name
        description
        progress
        status
        stage
        lead {
          id
          name
        }
        timeframe {
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
      }
      errors {
        field
        messages
      }
      clientMutationId
    }
  }
`;
