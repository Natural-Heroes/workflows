/**
 * Perdoo GraphQL API types.
 *
 * Types for Perdoo OKR entities. Validated against real Perdoo API
 * via __type introspection queries (full introspection is disabled).
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
// Enums (validated via __type queries)
// ============================================================================

/**
 * Objective commit status (progress indicator).
 */
export type CommitStatus =
  | 'NO_STATUS'
  | 'OFF_TRACK'
  | 'NEEDS_ATTENTION'
  | 'ON_TRACK'
  | 'ACCOMPLISHED';

/**
 * Objective lifecycle stage.
 */
export type ObjectiveStage = 'DRAFT' | 'ACTIVE' | 'CLOSED';

/**
 * How objective progress is calculated.
 */
export type ProgressDriver = 'KEY_RESULTS' | 'ALIGNED_OBJECTIVES' | 'BOTH';

/**
 * Goal update cadence.
 */
export type GoalUpdateCycle =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'EVERY_4_MONTHS';

/**
 * Key result type (metric vs initiative).
 *
 * Discovered via PerdooApiKeyResultTypeChoices enum reference
 * in the objectives query filter (keyResults_Type).
 */
export type KeyResultType = 'KEY_RESULT' | 'INITIATIVE';

/**
 * KPI metric unit (currency or numerical type).
 *
 * Discovered via MetricUnit enum introspection.
 * Includes NUMERICAL, PERCENTAGE, and ISO 4217 currency codes.
 */
export type MetricUnit =
  | 'NUMERICAL'
  | 'PERCENTAGE'
  | 'AED' | 'EUR' | 'USD' | 'GBP' | 'AUD' | 'BRL' | 'CAD' | 'CHF'
  | 'CLP' | 'CNY' | 'CZK' | 'DKK' | 'HKD' | 'HUF' | 'IDR' | 'ILS'
  | 'INR' | 'IQD' | 'JOD' | 'JPY' | 'KES' | 'KRW' | 'KWD' | 'KZT'
  | 'MXN' | 'MYR' | 'NGN' | 'NOK' | 'NZD' | 'PHP' | 'PKR' | 'PLN'
  | 'RON' | 'RUB' | 'SAR' | 'SEK' | 'SGD' | 'THB' | 'TRY' | 'TWD'
  | 'ZAR';

/**
 * KPI target type (direction of progress).
 *
 * Discovered via TargetType enum introspection.
 */
export type KpiTargetType =
  | 'STAY_AT_OR_ABOVE'
  | 'STAY_AT_OR_BELOW'
  | 'INCREASE_TO'
  | 'DECREASE_TO';

/**
 * KPI goal operator (comparison direction for targets).
 *
 * Discovered via PerdooApiKpiGoalOperatorChoices enum introspection.
 */
export type KpiGoalOperator =
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL';

/**
 * KPI aggregation method (how child KPIs roll up).
 *
 * Discovered via AggregationMethod enum introspection.
 */
export type KpiAggregationMethod = 'WEIGHTED_AVERAGE' | 'SUM';

/**
 * KPI target frequency (how often targets are set).
 *
 * Discovered via GoalTargetFrequency enum introspection.
 */
export type KpiTargetFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/**
 * KPI progress driver choices (how progress is calculated).
 *
 * Discovered via ProgressDriverChoices enum introspection.
 * Different from objective ProgressDriver -- KPIs support MANUAL, INTEGRATION, ALIGNED_GOALS.
 */
export type KpiProgressDriver = 'MANUAL' | 'INTEGRATION' | 'ALIGNED_GOALS';

// ============================================================================
// Domain Types (validated against real Perdoo API)
// ============================================================================

/**
 * Perdoo user reference (lead, contributor).
 */
export interface PerdooUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * Perdoo group (team/department).
 */
export interface PerdooGroup {
  id: string;
  name: string;
}

/**
 * Perdoo timeframe (quarter, year, etc.).
 */
export interface PerdooTimeframe {
  id: string;
  name: string;
}

/**
 * Perdoo key result reference.
 */
export interface PerdooKeyResult {
  id: string;
  name: string;
}

/**
 * Perdoo tag reference.
 */
export interface PerdooTag {
  id: string;
  name: string;
}

/**
 * Perdoo Objective entity.
 *
 * Type name in API is lowercase `objective`. Uses UUID scalars for IDs.
 * Status is a CommitStatus enum, stage is ObjectiveStage enum.
 */
export interface Objective {
  id: string;
  name: string;
  description?: string | null;
  progress?: number | null;
  status: CommitStatus;
  stage: ObjectiveStage;
  weight: number;
  private: boolean;
  isCompanyGoal: boolean;
  completed: boolean;
  progressDriver: ProgressDriver;
  goalUpdateCycle: GoalUpdateCycle;
  lead?: PerdooUser | null;
  timeframe: PerdooTimeframe;
  parent?: { id: string; name: string } | null;
  groups: Connection<PerdooGroup>;
  keyResults?: Connection<PerdooKeyResult> | null;
  children: Connection<{ id: string; name: string }>;
  contributors: Connection<PerdooUser>;
  tags: Connection<PerdooTag>;
  startDate?: string | null;
  dueDate?: string | null;
  createdDate: string;
  lastEditedDate: string;
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
 * Response type for upsertObjective mutation.
 *
 * The API uses a single upsert mutation for both create and update.
 * When input.id is null/omitted, it creates. When present, it updates.
 */
export interface UpsertObjectiveData {
  upsertObjective: {
    objective: Objective | null;
    errors: Array<{ field: string; messages: string[] }>;
    clientMutationId?: string | null;
  };
}

// ============================================================================
// Key Result Types (validated via __type queries + Query/Mutation introspection)
// ============================================================================

/**
 * Perdoo Key Result entity.
 *
 * Type name in API is lowercase `keyResult`. Uses UUID scalars for IDs.
 * Status is a CommitStatus enum, type is KeyResultType.
 * Singular query: `result(id: UUID!)`
 * Plural query: `keyResults(...)`
 */
export interface KeyResult {
  id: string;
  name: string;
  description?: string | null;
  progress?: number | null;
  status: CommitStatus;
  type: KeyResultType;
  weight: number;
  startValue?: number | null;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  private?: boolean;
  archived?: boolean;
  lead?: PerdooUser | null;
  objective?: { id: string; name: string } | null;
  timeframe?: PerdooTimeframe | null;
  groups?: Connection<PerdooGroup> | null;
  contributors?: Connection<PerdooUser> | null;
  tags?: Connection<PerdooTag> | null;
  startDate?: string | null;
  dueDate?: string | null;
  createdDate?: string;
  lastEditedDate?: string;
}

/**
 * Response type for keyResults list query.
 */
export interface KeyResultsData {
  keyResults: Connection<KeyResult>;
}

/**
 * Response type for single key result query (result query).
 *
 * Note: The singular query is `result(id: UUID!)` not `keyResult(id: ...)`.
 */
export interface KeyResultData {
  result: KeyResult;
}

/**
 * Response type for initiatives list query.
 *
 * Initiatives are key results with type=INITIATIVE. The dedicated `initiatives(...)`
 * root query returns the same keyResultConnection type, pre-filtered to only
 * include initiatives. Reuses the KeyResult type since the schema type is identical.
 */
export interface InitiativesData {
  initiatives: Connection<KeyResult>;
}

/**
 * Response type for upsertKeyResult mutation.
 *
 * Uses same upsert pattern as objectives:
 * - When input.id is omitted, creates a new key result
 * - When input.id is provided, updates the existing key result
 */
export interface UpsertKeyResultData {
  upsertKeyResult: {
    keyResult: KeyResult | null;
    errors: Array<{ field: string; messages: string[] }>;
    clientMutationId?: string | null;
  };
}

// ============================================================================
// KPI Types (validated via __type queries + Query/Mutation introspection)
// ============================================================================

/**
 * Perdoo KPI entity.
 *
 * Type name in API is lowercase `kpi`. Uses UUID scalars for IDs.
 * Status is CommitStatus enum (field: lastCommitStatus), metricUnit is MetricUnit enum.
 * Singular query: `kpi(id: UUID!)`
 * Plural query: `allKpis(...)`
 */
export interface Kpi {
  id: string;
  name: string;
  description?: string | null;
  lastCommitStatus: CommitStatus;
  metricUnit: MetricUnit;
  startValue?: number | null;
  currentValue?: number | null;
  targetType: KpiTargetType;
  goalOperator?: KpiGoalOperator | null;
  weight: number;
  isCompanyGoal: boolean;
  archived: boolean;
  private: boolean;
  progressDriver: KpiProgressDriver;
  goalUpdateCycle: GoalUpdateCycle;
  targetFrequency: KpiTargetFrequency;
  resetTargetEveryCycle: boolean;
  aggregationMethod: KpiAggregationMethod;
  goalThreshold?: number | null;
  isOutdated: boolean;
  progress?: number | null;
  createdDate: string;
  archivedDate?: string | null;
  lead?: PerdooUser | null;
  parent?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
  groups?: Connection<PerdooGroup> | null;
  tags?: Connection<PerdooTag> | null;
  children?: Connection<{ id: string; name: string }> | null;
}

/**
 * Response type for allKpis list query.
 */
export interface KpisData {
  allKpis: Connection<Kpi>;
}

/**
 * Response type for single KPI query.
 */
export interface KpiData {
  kpi: Kpi;
}

/**
 * Response type for upsertKpi mutation.
 *
 * Uses same upsert pattern as objectives and key results:
 * - When input.id is omitted, creates a new KPI
 * - When input.id is provided, updates the existing KPI
 *
 * Input type name is UpsertKPIMutationInput (uppercase KPI).
 */
export interface UpsertKpiData {
  upsertKpi: {
    kpi: Kpi | null;
    errors: Array<{ field: string; messages: string[] }>;
    clientMutationId?: string | null;
  };
}

// ============================================================================
// Input Types (validated via __type on UpsertObjectiveMutationInput)
// ============================================================================

/**
 * Input for upserting an objective (create or update).
 *
 * Maps to UpsertObjectiveMutationInput in the Perdoo GraphQL schema.
 * All fields are optional. When `id` is omitted, a new objective is created.
 * When `id` is provided, the existing objective is updated.
 */
export interface UpsertObjectiveInput {
  /** Objective ID (omit for create, provide for update) */
  id?: string;
  /** Objective name/title */
  name?: string;
  /** Objective description */
  description?: string;
  /** Lead user ID */
  lead?: string;
  /** Group IDs */
  groups?: string[];
  /** Timeframe ID */
  timeframe?: string;
  /** Parent objective ID */
  parent?: string;
  /** Lifecycle stage (DRAFT, ACTIVE, CLOSED) */
  stage?: string;
  /** Contributor user IDs */
  contributors?: string[];
  /** Whether objective is private */
  private?: boolean;
  /** Progress driver (KEY_RESULTS, ALIGNED_OBJECTIVES, BOTH) */
  progressDriver?: string;
  /** Whether this is a company-level goal */
  isCompanyGoal?: boolean;
  /** Update cadence (WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, EVERY_4_MONTHS) */
  goalUpdateCycle?: string;
  /** Display order index */
  mapIndex?: number;
  /** Strategic pillar/goal ID */
  goal?: string;
  /** KPI ID */
  kpi?: string;
  /** Parent key result ID */
  parentKeyResult?: string;
  /** Tag IDs */
  tags?: string[];
  /** Client mutation ID for request tracking */
  clientMutationId?: string;
}

// ============================================================================
// Key Result Input Types
// ============================================================================

/**
 * Input for upserting a key result (create or update).
 *
 * Maps to UpsertKeyResultMutationInput in the Perdoo GraphQL schema.
 * Follows same upsert pattern as objectives.
 * When `id` is omitted, a new key result is created.
 * When `id` is provided, the existing key result is updated.
 */
export interface UpsertKeyResultInput {
  /** Key result ID (omit for create, provide for update) */
  id?: string;
  /** Key result name/title */
  name?: string;
  /** Key result description */
  description?: string;
  /** Parent objective ID (required for create) */
  objective?: string;
  /** Lead user ID */
  lead?: string;
  /** Key result type (KEY_RESULT or INITIATIVE) */
  type?: string;
  /** Starting value for metric tracking */
  startValue?: number;
  /** Target value for metric tracking */
  targetValue?: number;
  /** Current value for metric tracking */
  currentValue?: number;
  /** Unit label for metric values */
  unit?: string;
  /** Weight for progress contribution */
  weight?: number;
  /** Timeframe ID */
  timeframe?: string;
  /** Whether key result is private */
  private?: boolean;
  /** Whether key result is archived */
  archived?: boolean;
  /** Contributor user IDs */
  contributors?: string[];
  /** Group IDs */
  groups?: string[];
  /** Tag IDs */
  tags?: string[];
  /** Client mutation ID for request tracking */
  clientMutationId?: string;
}

// ============================================================================
// KPI Input Types (validated via __type on UpsertKPIMutationInput)
// ============================================================================

/**
 * Input for upserting a KPI (create or update).
 *
 * Maps to UpsertKPIMutationInput in the Perdoo GraphQL schema.
 * Follows same upsert pattern as objectives and key results.
 * When `id` is omitted, a new KPI is created.
 * When `id` is provided, the existing KPI is updated.
 *
 * Note: The input type name uses uppercase KPI (UpsertKPIMutationInput)
 * while the entity type uses lowercase (kpi).
 */
export interface UpsertKpiInput {
  /** KPI ID (omit for create, provide for update) */
  id?: string;
  /** KPI name/title */
  name?: string;
  /** KPI description */
  description?: string;
  /** Lead user ID */
  lead?: string;
  /** Group IDs */
  groups?: string[];
  /** Metric unit (NUMERICAL, PERCENTAGE, or currency code) */
  metricUnit?: string;
  /** Current metric value */
  currentValue?: number;
  /** Starting metric value */
  startValue?: number;
  /** Target type direction (STAY_AT_OR_ABOVE, STAY_AT_OR_BELOW, INCREASE_TO, DECREASE_TO) */
  targetType?: string;
  /** Goal operator (GREATER_THAN_OR_EQUAL, LESS_THAN_OR_EQUAL) */
  goalOperator?: string;
  /** Weight for aggregation contribution */
  weight?: number;
  /** Whether this is a company-level KPI */
  isCompanyGoal?: boolean;
  /** Strategic goal ID */
  goal?: string;
  /** Parent KPI ID */
  parent?: string;
  /** Whether KPI is private */
  private?: boolean;
  /** Progress driver (MANUAL, INTEGRATION, ALIGNED_GOALS) */
  progressDriver?: string;
  /** Update cadence (WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, EVERY_4_MONTHS) */
  goalUpdateCycle?: string;
  /** Target frequency (WEEKLY, MONTHLY, QUARTERLY, YEARLY) */
  targetFrequency?: string;
  /** Whether to reset target every cycle */
  resetTargetEveryCycle?: boolean;
  /** Aggregation method (WEIGHTED_AVERAGE, SUM) */
  aggregationMethod?: string;
  /** Goal threshold value */
  goalThreshold?: number;
  /** Whether KPI is archived */
  archived?: boolean;
  /** Tag IDs */
  tags?: string[];
  /** Users visible to (for private KPIs) */
  visibleTo?: string[];
  /** Integration ID */
  integration?: string;
  /** Integration field name */
  integrationField?: string;
  /** Progress integration ID */
  progressIntegration?: string;
  /** Progress integration config JSON */
  progressIntegrationConfig?: string;
  /** Data source identifier */
  source?: string;
  /** Client mutation ID for request tracking */
  clientMutationId?: string;
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
        isDeprecated?: boolean;
        deprecationReason?: string;
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
        isDeprecated?: boolean;
        deprecationReason?: string;
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
