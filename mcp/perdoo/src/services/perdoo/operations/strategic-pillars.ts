/**
 * GraphQL operations for Perdoo Strategic Pillars (Goal type).
 *
 * Strategic pillars are Goal entities in the Perdoo API, filtered by
 * type=STRATEGIC_PILLAR via PerdooApiGoalTypeChoices enum.
 *
 * Validated against real Perdoo API via __type introspection queries:
 * - goals query uses relay-style pagination with Django filter args
 * - goal query takes UUID! argument for singular goal
 * - PerdooApiGoalTypeChoices enum is used to filter by goal type
 * - PerdooApiGoalStatusChoices enum is used to filter by status
 *
 * Key findings from introspection:
 * - Plural query is `goals(...)` with type, status, stage, lead_Id, parent_Id, archived, orderBy filters
 * - Singular query is `goal(id: UUID!)`
 * - upsertGoal mutation handles both create (no id) and update (with id)
 */

/**
 * List strategic pillars with relay-style pagination and optional filters.
 *
 * Uses the `goals(...)` root query with type pre-set to STRATEGIC_PILLAR.
 * Returns a connection with pageInfo and edges containing core strategic pillar fields.
 * Filter args use Django-style naming (e.g., lead_Id, parent_Id).
 *
 * Available filters from introspection:
 * - status: PerdooApiGoalStatusChoices enum
 * - lead_Id: Lead user UUID
 * - parent_Id: Parent goal UUID (for sub-pillars)
 * - archived: Boolean
 * - orderBy: Sort field
 */
export const STRATEGIC_PILLARS_QUERY = `
  query ListStrategicPillars(
    $first: Int,
    $after: String,
    $type: PerdooApiGoalTypeChoices,
    $status: PerdooApiGoalStatusChoices,
    $lead_Id: UUID,
    $parent_Id: UUID,
    $archived: Boolean,
    $orderBy: String
  ) {
    goals(
      first: $first,
      after: $after,
      type: $type,
      status: $status,
      lead_Id: $lead_Id,
      parent_Id: $parent_Id,
      archived: $archived,
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
          progress
          currentValue
          startDate
          endDate
          archived
          lead {
            id
            name
          }
          timeframe {
            id
            name
          }
          parent {
            id
            name
          }
        }
      }
    }
  }
`;

/**
 * Get a single strategic pillar by UUID with full details.
 *
 * Uses the `goal(id: UUID!)` root query.
 * Returns all available scalar fields and key relationships.
 */
export const STRATEGIC_PILLAR_QUERY = `
  query GetStrategicPillar($id: UUID!) {
    goal(id: $id) {
      id
      name
      description
      status
      type
      progress
      currentValue
      startDate
      endDate
      archived
      private
      isCompanyGoal
      createdDate
      lead {
        id
        name
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
      children {
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
 * Upsert (create or update) a strategic pillar.
 *
 * Uses the `upsertGoal` mutation with type forced to STRATEGIC_PILLAR.
 * - To create: omit `id` from input (must include `name`)
 * - To update: include `id` in input
 *
 * Returns the goal and any validation errors.
 */
export const UPSERT_STRATEGIC_PILLAR_MUTATION = `
  mutation UpsertGoal($input: UpsertGoalMutationInput!) {
    upsertGoal(input: $input) {
      goal {
        id
        name
        description
        status
        type
        archived
        lead {
          id
          name
        }
        timeframe {
          id
          name
        }
        parent {
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
