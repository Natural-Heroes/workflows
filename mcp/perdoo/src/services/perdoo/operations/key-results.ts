/**
 * GraphQL operations for Perdoo Key Results.
 *
 * Validated against real Perdoo API via __type queries on the Query type.
 * - keyResults query uses relay-style pagination with Django filter args
 * - result query takes UUID! argument for singular key result
 * - upsertKeyResult handles both create (no id) and update (with id)
 *
 * Key findings from introspection:
 * - Singular query is `result(id: UUID!)` (NOT `keyResult`)
 * - Plural query is `keyResults(...)` with extensive filter args
 * - Type name in schema is lowercase `keyResult`
 * - Uses same upsert pattern as objectives
 */

/**
 * List key results with relay-style pagination and optional filters.
 *
 * Returns a connection with pageInfo and edges containing core key result fields.
 * Filter args use Django-style naming (e.g., name_Icontains, lead_Id, objective).
 *
 * Available filters from introspection:
 * - name_Icontains: Case-insensitive name search
 * - objective: Parent objective UUID
 * - lead_Id: Lead user UUID
 * - type: Key result type (STRING from PerdooApiKeyResultTypeChoices)
 * - archived: Boolean
 * - status_In: Comma-separated CommitStatus values
 * - objectiveStage: Filter by parent objective stage
 * - timeframe: Timeframe UUID
 * - orderBy: Sort field
 */
export const KEY_RESULTS_QUERY = `
  query ListKeyResults(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $objective: UUID,
    $lead_Id: UUID,
    $type: String,
    $archived: Boolean,
    $status_In: String,
    $objectiveStage: String,
    $timeframe: UUID,
    $orderBy: String
  ) {
    keyResults(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      objective: $objective,
      lead_Id: $lead_Id,
      type: $type,
      archived: $archived,
      status_In: $status_In,
      objectiveStage: $objectiveStage,
      timeframe: $timeframe,
      orderBy: $orderBy
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
          status
          type
          weight
          startValue
          endValue
          currentValue
          metricUnit
          archived
          startDate
          dueDate
          lead {
            id
            name
          }
          objective {
            id
            name
          }
        }
      }
    }
  }
`;

/**
 * Get a single key result by UUID with full details.
 *
 * Uses the `result(id: UUID!)` root query (NOT `keyResult`).
 * Returns all available fields including relationships.
 */
export const KEY_RESULT_QUERY = `
  query GetKeyResult($id: UUID!) {
    result(id: $id) {
      id
      name
      description
      status
      type
      weight
      startValue
      endValue
      currentValue
      metricUnit
      targetType
      archived
      startDate
      dueDate
      createdDate
      lastEditedDate
      lead {
        id
        name
      }
      objective {
        id
        name
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
 * Upsert (create or update) a key result.
 *
 * The Perdoo API uses a single upsert mutation instead of separate create/update.
 * - To create: omit `id` from input (must include `objective` and `name`)
 * - To update: include `id` in input
 *
 * Returns the key result and any validation errors.
 */
export const UPSERT_KEY_RESULT_MUTATION = `
  mutation UpsertKeyResult($input: UpsertKeyResultMutationInput!) {
    upsertKeyResult(input: $input) {
      keyResult {
        id
        name
        description
        status
        type
        weight
        startValue
        endValue
        currentValue
        metricUnit
        targetType
        lead {
          id
          name
        }
        objective {
          id
          name
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
