/**
 * GraphQL operations for Perdoo Initiatives.
 *
 * Initiatives are key results with type=INITIATIVE, but the Perdoo API provides
 * a dedicated `initiatives(...)` root query that is pre-filtered server-side.
 * This avoids needing to pass a type filter manually.
 *
 * Key findings:
 * - Plural query is `initiatives(...)` (pre-filtered, returns keyResultConnection)
 * - Singular query reuses `result(id: UUID!)` (same as key results)
 * - Create/update reuses `upsertKeyResult` mutation with type: INITIATIVE
 */

/**
 * List initiatives with relay-style pagination and optional filters.
 *
 * Uses the dedicated `initiatives(...)` root query which is pre-filtered
 * server-side to return only key results with type=INITIATIVE.
 * Does NOT require a $type variable (filtering is implicit).
 *
 * Returns a connection with pageInfo and edges containing core initiative fields.
 * Filter args use Django-style naming (e.g., name_Icontains, lead_Id, objective).
 *
 * Available filters:
 * - name_Icontains: Case-insensitive name search
 * - objective: Parent objective UUID
 * - lead_Id: Lead user UUID
 * - archived: Boolean
 * - status_In: Comma-separated CommitStatus values
 * - objectiveStage: Filter by parent objective stage
 * - timeframe: Timeframe UUID
 * - orderBy: Sort field
 */
export const INITIATIVES_QUERY = `
  query ListInitiatives(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $objective: UUID,
    $lead_Id: UUID,
    $archived: Boolean,
    $status_In: String,
    $objectiveStage: String,
    $timeframe: UUID,
    $orderBy: String
  ) {
    initiatives(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      objective: $objective,
      lead_Id: $lead_Id,
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
