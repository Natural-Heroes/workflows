/**
 * GraphQL operations for Perdoo KPIs.
 *
 * Validated against real Perdoo API via __type queries on the Query and Mutation types.
 * - allKpis query uses relay-style pagination with Django filter args
 * - kpi query takes UUID! argument for singular KPI
 * - upsertKpi handles both create (no id) and update (with id)
 *
 * Key findings from introspection:
 * - Singular query is `kpi(id: UUID!)`
 * - Plural query is `allKpis(...)` with extensive filter args
 * - Type name in schema is lowercase `kpi`
 * - Uses same upsert pattern as objectives and key results
 * - Mutation input type is `UpsertKPIMutationInput` (uppercase KPI)
 * - KPI uses MetricUnit enum (not free-text unit), TargetType enum, and CommitStatus
 */

/**
 * List KPIs with relay-style pagination and optional filters.
 *
 * Returns a connection with pageInfo and edges containing core KPI fields.
 * Filter args use Django-style naming (e.g., name_Icontains, lead_Id, group).
 *
 * Available filters from introspection:
 * - name_Icontains: Case-insensitive name search
 * - lead_Id: Lead user UUID
 * - group: Group UUID
 * - archived: Boolean
 * - status_In: Comma-separated CommitStatus values (lastCommitStatus)
 * - isCompanyGoal: Boolean
 * - goal_Id: Strategic goal UUID
 * - parent: Parent KPI UUID
 * - tags_Id: Tag ID
 * - orderBy: Sort field
 */
export const KPIS_QUERY = `
  query ListKpis(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $lead_Id: UUID,
    $group: UUID,
    $archived: Boolean,
    $status_In: String,
    $isCompanyGoal: Boolean,
    $goal_Id: UUID,
    $parent: UUID,
    $tags_Id: String,
    $orderBy: String
  ) {
    allKpis(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      lead_Id: $lead_Id,
      group: $group,
      archived: $archived,
      status_In: $status_In,
      isCompanyGoal: $isCompanyGoal,
      goal_Id: $goal_Id,
      parent: $parent,
      tags_Id: $tags_Id,
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
          lastCommitStatus
          metricUnit
          startValue
          currentValue
          targetType
          weight
          isCompanyGoal
          archived
          progressDriver
          goalUpdateCycle
          lead {
            id
            name
          }
          parent {
            id
            name
          }
          goal {
            id
            name
          }
        }
      }
    }
  }
`;

/**
 * Get a single KPI by UUID with full details.
 *
 * Uses the `kpi(id: UUID!)` root query.
 * Returns all available scalar fields and key relationships.
 */
export const KPI_QUERY = `
  query GetKpi($id: UUID!) {
    kpi(id: $id) {
      id
      name
      description
      lastCommitStatus
      metricUnit
      startValue
      currentValue
      targetType
      goalOperator
      weight
      isCompanyGoal
      archived
      private
      progressDriver
      goalUpdateCycle
      targetFrequency
      resetTargetEveryCycle
      aggregationMethod
      goalThreshold
      isOutdated
      progress
      createdDate
      archivedDate
      lead {
        id
        name
      }
      parent {
        id
        name
      }
      goal {
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
      tags {
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
    }
  }
`;

/**
 * Upsert (create or update) a KPI.
 *
 * The Perdoo API uses a single upsert mutation instead of separate create/update.
 * - To create: omit `id` from input (must include `name`)
 * - To update: include `id` in input
 *
 * Input type is UpsertKPIMutationInput (uppercase KPI).
 * Returns the KPI and any validation errors.
 */
export const UPSERT_KPI_MUTATION = `
  mutation UpsertKpi($input: UpsertKPIMutationInput!) {
    upsertKpi(input: $input) {
      kpi {
        id
        name
        description
        lastCommitStatus
        metricUnit
        startValue
        currentValue
        targetType
        weight
        isCompanyGoal
        archived
        progressDriver
        lead {
          id
          name
        }
        goal {
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
