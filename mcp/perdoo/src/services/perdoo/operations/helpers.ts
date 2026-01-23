/**
 * GraphQL operations for helper queries (timeframes, users, groups).
 *
 * These provide lookup data needed by other tools:
 * - Timeframes: Required for create_objective
 * - Users: Required for lead/contributor assignments
 * - Groups: Required for team assignment on objectives
 */

/**
 * List timeframes with pagination.
 * Returns timeframe IDs needed for create_objective.
 */
export const TIMEFRAMES_QUERY = `
  query ListTimeframes(
    $first: Int,
    $after: String,
    $active: Boolean,
    $status: String,
    $excludeArchived: Boolean
  ) {
    timeframes(
      first: $first,
      after: $after,
      active: $active,
      status: $status,
      excludeArchived: $excludeArchived,
      orderBy: "-startDate"
    ) {
      edges {
        node {
          id
          name
          startDate
          endDate
          status
          active
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * List users with pagination.
 * Returns user IDs needed for lead/contributor assignments.
 */
export const USERS_QUERY = `
  query ListUsers(
    $first: Int,
    $after: String,
    $isActive: Boolean,
    $name: String
  ) {
    allUsers(
      first: $first,
      after: $after,
      isActive: $isActive,
      name: $name
    ) {
      edges {
        node {
          id
          name
          email
          role
          isActive
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * List groups with pagination.
 * Returns group IDs needed for team assignment on objectives.
 */
export const GROUPS_QUERY = `
  query ListGroups(
    $first: Int,
    $after: String,
    $name: String,
    $archivedDate_Isnull: Boolean
  ) {
    allGroups(
      first: $first,
      after: $after,
      name: $name,
      archivedDate_Isnull: $archivedDate_Isnull,
      orderBy: "name"
    ) {
      edges {
        node {
          id
          name
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
