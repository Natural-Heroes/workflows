/**
 * Perdoo GraphQL API client.
 *
 * Uses native fetch (Node 18+) with Bearer token authentication.
 * All logging goes to stderr via the logger module.
 *
 * Includes resilience features:
 * - Request queue (max 1 concurrent request)
 * - Token bucket rate limiter (30 capacity, 3 tokens/sec)
 * - Retry with exponential backoff (on retryable errors)
 * - Circuit breaker (5 failures opens, 30s timeout)
 *
 * Mutations are NEVER retried to prevent duplicate side effects.
 */

import { logger } from '../../lib/logger.js';
import {
  PerdooApiError,
  PerdooHttpError,
  type GraphQLResponse,
} from '../../lib/errors.js';
import { TokenBucket, createRateLimiter } from './rate-limiter.js';
import { RequestQueue, createRequestQueue } from './request-queue.js';
import { withRetry } from './retry.js';
import {
  CircuitBreaker,
  createCircuitBreaker,
} from './circuit-breaker.js';
import {
  OBJECTIVES_QUERY,
  OBJECTIVE_QUERY,
  UPSERT_OBJECTIVE_MUTATION,
} from './operations/objectives.js';
import {
  KEY_RESULTS_QUERY,
  KEY_RESULT_QUERY,
  UPSERT_KEY_RESULT_MUTATION,
} from './operations/key-results.js';
import { INITIATIVES_QUERY } from './operations/initiatives.js';
import {
  STRATEGIC_PILLARS_QUERY,
  STRATEGIC_PILLAR_QUERY,
} from './operations/strategic-pillars.js';
import {
  KPIS_QUERY,
  KPI_QUERY,
  UPSERT_KPI_MUTATION,
} from './operations/kpis.js';
import { INTROSPECTION_QUERY } from './operations/introspection.js';
import type {
  ObjectivesData,
  ObjectiveData,
  UpsertObjectiveData,
  UpsertObjectiveInput,
  KeyResultsData,
  KeyResultData,
  UpsertKeyResultData,
  UpsertKeyResultInput,
  InitiativesData,
  KpisData,
  KpiData,
  UpsertKpiData,
  UpsertKpiInput,
  StrategicPillarsData,
  StrategicPillarData,
  IntrospectionData,
} from './types.js';

/**
 * Perdoo client configuration.
 */
export interface PerdooClientConfig {
  /** Bearer token for Perdoo API authentication */
  token: string;
  /** GraphQL endpoint URL (optional, defaults to EU production) */
  endpoint?: string;
  /** Maximum retry attempts for queries (optional, defaults to 3) */
  maxRetries?: number;
  /** Enable circuit breaker (optional, defaults to true) */
  circuitBreakerEnabled?: boolean;
}

/**
 * Options for individual execute() calls.
 */
export interface ExecuteOptions {
  /** Whether this operation is a mutation (never retried) */
  isMutation?: boolean;
}

/**
 * Perdoo GraphQL API client.
 *
 * Provides a typed execute() method for running GraphQL operations
 * against the Perdoo API with full resilience stack.
 *
 * All requests automatically go through the resilience stack:
 * queue -> circuit breaker -> (if query: retry) -> rate limiter -> fetch
 */
export class PerdooClient {
  private readonly endpoint: string;
  private readonly token: string;

  // Resilience components
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;
  private readonly circuitBreakerEnabled: boolean;

  /**
   * Creates a new Perdoo API client.
   *
   * @param config - Client configuration with API token
   */
  constructor(config: PerdooClientConfig) {
    this.endpoint = config.endpoint ?? 'https://api-eu.perdoo.com/graphql/';
    this.token = config.token;

    // Initialize resilience components
    this.rateLimiter = createRateLimiter();
    this.queue = createRequestQueue();
    this.circuitBreaker = createCircuitBreaker();
    this.maxRetries = config.maxRetries ?? 3;
    this.circuitBreakerEnabled = config.circuitBreakerEnabled ?? true;
  }

  /**
   * Executes a GraphQL operation through the resilience stack.
   *
   * Pipeline: queue -> circuit breaker -> (if query: retry) -> rate limiter -> fetch
   *
   * Mutations are NEVER retried to prevent duplicate side effects.
   * Queries are retried on transient failures (rate limits, server errors).
   *
   * @param operation - GraphQL query or mutation string
   * @param variables - GraphQL variables object
   * @param options - Execution options (isMutation flag)
   * @returns Parsed response data
   * @throws PerdooApiError on GraphQL errors
   * @throws PerdooHttpError on HTTP errors
   * @throws CircuitBreakerOpenError if circuit is open
   */
  async execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<T> {
    const isMutation = options?.isMutation ?? false;

    logger.debug('GraphQL operation queued', {
      isMutation,
      hasVariables: !!variables,
    });

    // Queue ensures single concurrent request
    return this.queue.enqueue(async () => {
      // Wrapper for circuit breaker (optional)
      const executeWithOptionalCircuitBreaker = async (
        fn: () => Promise<T>
      ): Promise<T> => {
        if (this.circuitBreakerEnabled) {
          return this.circuitBreaker.execute(fn);
        }
        return fn();
      };

      return executeWithOptionalCircuitBreaker(async () => {
        // The actual request function
        const doRequest = async (): Promise<T> => {
          // Rate limiter ensures we don't exceed limits
          logger.debug('Waiting for rate limit token');
          await this.rateLimiter.waitForToken();
          logger.debug('Token acquired, sending request');

          return this.executeRequest<T>(operation, variables);
        };

        // Only retry queries, NEVER mutations
        if (!isMutation) {
          return withRetry(doRequest, { maxAttempts: this.maxRetries });
        }

        return doRequest();
      });
    });
  }

  // ===========================================================================
  // Typed Operations
  // ===========================================================================

  /**
   * Lists objectives with pagination and optional filters.
   *
   * Returns a relay-style connection with pageInfo and edges.
   * Supports Django-style filter arguments.
   *
   * @param params - Pagination and filter parameters
   * @returns Objectives connection data
   */
  async listObjectives(params?: {
    first?: number;
    after?: string;
    name_Icontains?: string;
    stage?: string;
    lead_Id?: string;
    groups_Id?: string;
    timeframe_Cadence_Id?: string;
    status?: string;
  }): Promise<ObjectivesData> {
    return this.execute<ObjectivesData>(OBJECTIVES_QUERY, {
      first: params?.first ?? 20,
      after: params?.after,
      name_Icontains: params?.name_Icontains,
      stage: params?.stage,
      lead_Id: params?.lead_Id,
      groups_Id: params?.groups_Id,
      timeframe_Cadence_Id: params?.timeframe_Cadence_Id,
      status: params?.status,
    });
  }

  /**
   * Gets a single objective by UUID with full details.
   *
   * @param id - Objective UUID
   * @returns Objective data with all fields and relationships
   */
  async getObjective(id: string): Promise<ObjectiveData> {
    return this.execute<ObjectiveData>(OBJECTIVE_QUERY, { id });
  }

  /**
   * Creates a new objective (upsert without id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertObjective mutation with id omitted.
   *
   * @param input - Objective creation input (must include name)
   * @returns Upsert result with objective and errors
   */
  async createObjective(input: Omit<UpsertObjectiveInput, 'id'>): Promise<UpsertObjectiveData> {
    return this.execute<UpsertObjectiveData>(
      UPSERT_OBJECTIVE_MUTATION,
      { input },
      { isMutation: true }
    );
  }

  /**
   * Updates an existing objective (upsert with id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertObjective mutation with id included.
   *
   * @param id - Objective UUID to update
   * @param input - Fields to update
   * @returns Upsert result with objective and errors
   */
  async updateObjective(id: string, input: Omit<UpsertObjectiveInput, 'id'>): Promise<UpsertObjectiveData> {
    return this.execute<UpsertObjectiveData>(
      UPSERT_OBJECTIVE_MUTATION,
      { input: { ...input, id } },
      { isMutation: true }
    );
  }

  // ===========================================================================
  // Key Result Operations
  // ===========================================================================

  /**
   * Lists key results with pagination and optional filters.
   *
   * Returns a relay-style connection with pageInfo and edges.
   * Supports Django-style filter arguments.
   *
   * @param params - Pagination and filter parameters
   * @returns Key results connection data
   */
  async listKeyResults(params?: {
    first?: number;
    after?: string;
    name_Icontains?: string;
    objective?: string;
    lead_Id?: string;
    type?: string;
    archived?: boolean;
    status_In?: string;
    objectiveStage?: string;
    timeframe?: string;
    orderBy?: string;
  }): Promise<KeyResultsData> {
    return this.execute<KeyResultsData>(KEY_RESULTS_QUERY, {
      first: params?.first ?? 20,
      after: params?.after,
      name_Icontains: params?.name_Icontains,
      objective: params?.objective,
      lead_Id: params?.lead_Id,
      type: params?.type,
      archived: params?.archived,
      status_In: params?.status_In,
      objectiveStage: params?.objectiveStage,
      timeframe: params?.timeframe,
      orderBy: params?.orderBy,
    });
  }

  /**
   * Gets a single key result by UUID with full details.
   *
   * Uses the `result(id: UUID!)` root query.
   *
   * @param id - Key result UUID
   * @returns Key result data with all fields and relationships
   */
  async getKeyResult(id: string): Promise<KeyResultData> {
    return this.execute<KeyResultData>(KEY_RESULT_QUERY, { id });
  }

  /**
   * Creates a new key result (upsert without id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKeyResult mutation with id omitted.
   *
   * @param input - Key result creation input (must include name and objective)
   * @returns Upsert result with key result and errors
   */
  async createKeyResult(input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
    return this.execute<UpsertKeyResultData>(
      UPSERT_KEY_RESULT_MUTATION,
      { input },
      { isMutation: true }
    );
  }

  /**
   * Updates an existing key result (upsert with id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKeyResult mutation with id included.
   *
   * @param id - Key result UUID to update
   * @param input - Fields to update
   * @returns Upsert result with key result and errors
   */
  async updateKeyResult(id: string, input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
    return this.execute<UpsertKeyResultData>(
      UPSERT_KEY_RESULT_MUTATION,
      { input: { ...input, id } },
      { isMutation: true }
    );
  }

  // ===========================================================================
  // KPI Operations
  // ===========================================================================

  /**
   * Lists KPIs with pagination and optional filters.
   *
   * Returns a relay-style connection with pageInfo and edges.
   * Supports Django-style filter arguments.
   *
   * @param params - Pagination and filter parameters
   * @returns KPIs connection data
   */
  async listKpis(params?: {
    first?: number;
    after?: string;
    name_Icontains?: string;
    lead_Id?: string;
    group?: string;
    archived?: boolean;
    status_In?: string;
    isCompanyGoal?: boolean;
    goal_Id?: string;
    parent?: string;
    tags_Id?: string;
    orderBy?: string;
  }): Promise<KpisData> {
    return this.execute<KpisData>(KPIS_QUERY, {
      first: params?.first ?? 20,
      after: params?.after,
      name_Icontains: params?.name_Icontains,
      lead_Id: params?.lead_Id,
      group: params?.group,
      archived: params?.archived,
      status_In: params?.status_In,
      isCompanyGoal: params?.isCompanyGoal,
      goal_Id: params?.goal_Id,
      parent: params?.parent,
      tags_Id: params?.tags_Id,
      orderBy: params?.orderBy,
    });
  }

  /**
   * Gets a single KPI by UUID with full details.
   *
   * Uses the `kpi(id: UUID!)` root query.
   *
   * @param id - KPI UUID
   * @returns KPI data with all fields and relationships
   */
  async getKpi(id: string): Promise<KpiData> {
    return this.execute<KpiData>(KPI_QUERY, { id });
  }

  /**
   * Creates a new KPI (upsert without id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKpi mutation with id omitted.
   *
   * @param input - KPI creation input (must include name)
   * @returns Upsert result with KPI and errors
   */
  async createKpi(input: Omit<UpsertKpiInput, 'id'>): Promise<UpsertKpiData> {
    return this.execute<UpsertKpiData>(
      UPSERT_KPI_MUTATION,
      { input },
      { isMutation: true }
    );
  }

  /**
   * Updates an existing KPI (upsert with id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKpi mutation with id included.
   *
   * @param id - KPI UUID to update
   * @param input - Fields to update
   * @returns Upsert result with KPI and errors
   */
  async updateKpi(id: string, input: Omit<UpsertKpiInput, 'id'>): Promise<UpsertKpiData> {
    return this.execute<UpsertKpiData>(
      UPSERT_KPI_MUTATION,
      { input: { ...input, id } },
      { isMutation: true }
    );
  }

  // ===========================================================================
  // Initiative Operations
  // ===========================================================================

  /**
   * Lists initiatives with pagination and optional filters.
   *
   * Uses the dedicated `initiatives(...)` root query which is pre-filtered
   * server-side to return only key results with type=INITIATIVE.
   * Initiatives are key results with type=INITIATIVE under the hood.
   *
   * @param params - Pagination and filter parameters
   * @returns Initiatives connection data (same KeyResult type, filtered by type=INITIATIVE)
   */
  async listInitiatives(params?: {
    first?: number;
    after?: string;
    name_Icontains?: string;
    objective?: string;
    lead_Id?: string;
    archived?: boolean;
    status_In?: string;
    objectiveStage?: string;
    timeframe?: string;
    orderBy?: string;
  }): Promise<InitiativesData> {
    return this.execute<InitiativesData>(INITIATIVES_QUERY, {
      first: params?.first ?? 20,
      after: params?.after,
      name_Icontains: params?.name_Icontains,
      objective: params?.objective,
      lead_Id: params?.lead_Id,
      archived: params?.archived,
      status_In: params?.status_In,
      objectiveStage: params?.objectiveStage,
      timeframe: params?.timeframe,
      orderBy: params?.orderBy,
    });
  }

  /**
   * Gets a single initiative by UUID with full details.
   *
   * Reuses the `result(id: UUID!)` root query (works for both key results
   * and initiatives since they are the same underlying type).
   *
   * @param id - Initiative UUID
   * @returns Key result data (initiative is a key result with type=INITIATIVE)
   */
  async getInitiative(id: string): Promise<KeyResultData> {
    return this.execute<KeyResultData>(KEY_RESULT_QUERY, { id });
  }

  /**
   * Creates a new initiative (upsert without id, type forced to INITIATIVE).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKeyResult mutation with type set to INITIATIVE.
   * Initiatives are key results with type=INITIATIVE under the hood.
   *
   * @param input - Initiative creation input (must include name and objective)
   * @returns Upsert result with key result (initiative) and errors
   */
  async createInitiative(input: Omit<UpsertKeyResultInput, 'id' | 'type'>): Promise<UpsertKeyResultData> {
    return this.execute<UpsertKeyResultData>(
      UPSERT_KEY_RESULT_MUTATION,
      { input: { ...input, type: 'INITIATIVE' } },
      { isMutation: true }
    );
  }

  /**
   * Updates an existing initiative (upsert with id).
   *
   * Mutations are never retried to prevent duplicate side effects.
   * Uses the upsertKeyResult mutation with the ID included.
   * Does not force type on update (initiative type is already set).
   *
   * @param id - Initiative UUID to update
   * @param input - Fields to update
   * @returns Upsert result with key result (initiative) and errors
   */
  async updateInitiative(id: string, input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
    return this.execute<UpsertKeyResultData>(
      UPSERT_KEY_RESULT_MUTATION,
      { input: { ...input, id } },
      { isMutation: true }
    );
  }

  // ===========================================================================
  // Strategic Pillar Operations
  // ===========================================================================

  /**
   * Lists strategic pillars with pagination and optional filters.
   *
   * Uses the `goals(...)` root query with type pre-set to STRATEGIC_PILLAR.
   * Returns a relay-style connection with pageInfo and edges.
   * Supports Django-style filter arguments.
   *
   * Note: Strategic pillars are read-only (no mutation exists in the API).
   *
   * @param params - Pagination and filter parameters
   * @returns Strategic pillars connection data
   */
  async listStrategicPillars(params?: {
    first?: number;
    after?: string;
    status?: string;
    lead_Id?: string;
    parent_Id?: string;
    archived?: boolean;
    orderBy?: string;
  }): Promise<StrategicPillarsData> {
    return this.execute<StrategicPillarsData>(STRATEGIC_PILLARS_QUERY, {
      first: params?.first ?? 20,
      after: params?.after,
      type: 'STRATEGIC_PILLAR',
      status: params?.status,
      lead_Id: params?.lead_Id,
      parent_Id: params?.parent_Id,
      archived: params?.archived,
      orderBy: params?.orderBy,
    });
  }

  /**
   * Gets a single strategic pillar by UUID with full details.
   *
   * Uses the `goal(id: UUID!)` root query.
   *
   * @param id - Strategic pillar UUID
   * @returns Strategic pillar data with all fields and relationships
   */
  async getStrategicPillar(id: string): Promise<StrategicPillarData> {
    return this.execute<StrategicPillarData>(STRATEGIC_PILLAR_QUERY, { id });
  }

  // ===========================================================================
  // Introspection
  // ===========================================================================

  /**
   * Runs a schema introspection query.
   *
   * Used to discover available types, fields, and operations.
   *
   * @returns Schema introspection data
   */
  async introspect(): Promise<IntrospectionData> {
    return this.execute<IntrospectionData>(INTROSPECTION_QUERY);
  }

  // ===========================================================================
  // Private Implementation
  // ===========================================================================

  /**
   * Executes the actual GraphQL HTTP request.
   *
   * @param operation - GraphQL query or mutation string
   * @param variables - GraphQL variables object
   * @returns Parsed response data
   * @throws PerdooApiError on GraphQL errors in response
   * @throws PerdooHttpError on non-2xx HTTP status
   */
  private async executeRequest<T>(
    operation: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();

    const body = JSON.stringify({
      query: operation,
      variables: variables ?? undefined,
    });

    logger.debug('Perdoo GraphQL request', {
      endpoint: this.endpoint,
      bodyLength: body.length,
    });

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body,
      });

      const duration = Date.now() - startTime;

      // Handle HTTP errors
      if (!response.ok) {
        logger.error('Perdoo API HTTP error', {
          status: response.status,
          statusText: response.statusText,
          duration,
        });

        throw new PerdooHttpError(response.status, response.statusText);
      }

      // Parse GraphQL response
      const result = (await response.json()) as GraphQLResponse<T>;

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        logger.error('Perdoo API GraphQL errors', {
          errorCount: result.errors.length,
          errors: result.errors.map((e) => e.message),
          duration,
        });

        throw new PerdooApiError(result.errors);
      }

      // Ensure data is present
      if (result.data === null || result.data === undefined) {
        throw new PerdooApiError([
          { message: 'GraphQL response contained no data' },
        ]);
      }

      logger.debug('Perdoo GraphQL response', {
        duration,
        hasData: !!result.data,
      });

      return result.data;
    } catch (error) {
      // Re-throw our custom errors as-is
      if (error instanceof PerdooApiError || error instanceof PerdooHttpError) {
        throw error;
      }

      // Wrap network/other errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Perdoo GraphQL request failed', { error: message });

      throw new PerdooHttpError(0, `Request failed: ${message}`);
    }
  }
}

// Re-export CircuitBreakerOpenError for callers to catch
export { CircuitBreakerOpenError } from './circuit-breaker.js';
