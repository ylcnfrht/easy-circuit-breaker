import OpossumCircuitBreaker from 'opossum';

/**
 * Enum representing different levels of circuit breakers.
 */
export enum CircuitBreakerLevel {
  Endpoint = 'Endpoint',
  Service = 'Service',
  Application = 'Application',
  Database = 'Database',
  External = 'External',
}

/**
 * Type representing a request function that returns a promise.
 */
export type RequestFn<T> = (...args: any[]) => Promise<T>;

/**
 * Interface representing base parameters for a circuit breaker.
 */
interface BaseCircuitBreakerParams {
  level?: CircuitBreakerLevel;
  name: string;
  options?: Partial<OpossumCircuitBreaker.Options>;
}

/**
 * Interface representing parameters for a request function.
 */
interface RequestParams<T> {
  requestFn: RequestFn<T>;
  args?: Parameters<RequestFn<T>>;
}

/**
 * Interface representing parameters for a fallback function.
 */
interface FallbackParams<T> {
  fallbackFn?: RequestFn<T>;
  fallbackFnArgs?: Parameters<RequestFn<T>>;
}

/**
 * Type representing parameters for a circuit breaker.
 */
export type CircuitBreakerParams<T> = BaseCircuitBreakerParams &
  RequestParams<T> &
  Partial<FallbackParams<T>>;

/**
 * Interface representing event handlers for circuit breaker events.
 */
interface EventHandlers {
  fire?: () => void;
  reject?: () => void;
  timeout?: () => void;
  success?: () => void;
  failure?: () => void;
  open?: () => void;
  close?: () => void;
  halfOpen?: () => void;
  fallback?: () => void;
  semaphoreLocked?: () => void;
  healthCheckFailed?: () => void;
  shutdown?: () => void;
  cacheHit?: () => void;
  cacheMiss?: () => void;
}

/**
 * Class representing a circuit breaker.
 */
export class CircuitBreaker {
  private readonly circuitBreakers = new Map<string, OpossumCircuitBreaker>();
  private readonly eventHandlers: EventHandlers;

  /**
   * Creates an instance of CircuitBreaker.
   * @param eventHandlers - Event handlers for circuit breaker events.
   */
  constructor(
    eventHandlers: EventHandlers = {}
  ) {
    this.eventHandlers = eventHandlers;
  }

  /**
   * Creates a circuit breaker for the given request function with specified options.
   *
   * @template T - The type of the response from the request function.
   * @param requestFn - The request function to be wrapped by the circuit breaker.
   * @param  options - Configuration options for the circuit breaker.
   * @param name - The name of the circuit breaker.
   * @returns The created circuit breaker instance.
   *
   * @remarks
   * The following options can be provided:
   * - `timeout` (number, default: 10000): Max time (ms) for an operation to complete before failing.
   * - `errorThresholdPercentage` (number, default: 50): Failure rate (%) to trigger circuit breaker.
   * - `resetTimeout` (number, default: 30000): Time (ms) before transitioning to "half-open" state.
   * - `rollingCountTimeout` (number, default: 10000): Time window (ms) for tracking statistics.
   * - `rollingCountBuckets` (number, default: 10): Number of buckets in rollingCountTimeout window.
   * - `name` (string, default: function name): Custom name for the circuit breaker.
   * - `rollingPercentilesEnabled` (boolean, default: true): Enables percentile calculations.
   * - `capacity` (number, default: Number.MAX_SAFE_INTEGER): Max concurrent requests.
   * - `enabled` (boolean, default: true): Enables circuit breaker on startup.
   * - `allowWarmUp` (boolean, default: false): Prevents early circuit opening by ignoring failures initially.
   * - `volumeThreshold` (number, default: 0): Minimum requests before circuit breaker can open.
   * - `errorFilter` (function, default: () => false): Ignores specific errors if function returns true.
   * - `cache` (boolean, default: false): Enables caching of first successful response.
   * - `cacheTTL` (number, default: 0): Cache expiration time (ms), 0 means never expires.
   * - `cacheGetKey` (function, default: (...args) => JSON.stringify(args)): Defines cache key.
   * - `cacheTransport` (object, default: undefined): Custom caching mechanism with get, set, flush methods.
   * - `abortController` (AbortController, default: undefined): Uses AbortController to cancel async operations on timeout.
   * - `enableSnapshots` (boolean, default: true): Enables snapshot events for statistics.
   * - `rotateBucketController` (EventEmitter, default: undefined): Shares EventEmitter for multiple circuit breakers.
   */
  private createCircuitBreaker<T>(
    requestFn: RequestFn<T>,
    options: OpossumCircuitBreaker.Options,
    name: string
  ): OpossumCircuitBreaker {
    if (this.circuitBreakers.has(name)) {
      return this.circuitBreakers.get(name)!;
    }

    const breaker = new OpossumCircuitBreaker(requestFn, {
      timeout: 10000, // (Default: 10000) Max time (ms) for an operation to complete before failing.
      errorThresholdPercentage: 50, // (Default: 50) Failure rate (%) to trigger circuit breaker.
      resetTimeout: 30000, // (Default: 30000) Time (ms) before transitioning to "half-open" state.
      rollingCountTimeout: 10000, // (Default: 10000) Time window (ms) for tracking statistics.
      rollingCountBuckets: 10, // (Default: 10) Number of buckets in rollingCountTimeout window.
      name, // (Default: function name) Custom name for the circuit breaker.
      rollingPercentilesEnabled: true, // (Default: true) Enables percentile calculations.
      capacity: Number.MAX_SAFE_INTEGER, // (Default: MAX_SAFE_INTEGER) Max concurrent requests.
      enabled: true, // (Default: true) Enables circuit breaker on startup.
      allowWarmUp: false, // (Default: false) Prevents early circuit opening by ignoring failures initially.
      volumeThreshold: 0, // (Default: 0) Minimum requests before circuit breaker can open.
      errorFilter: () => false, // (Default: false) Ignores specific errors if function returns true.
      cache: false, // (Default: false) Enables caching of first successful response.
      cacheTTL: 0, // (Default: 0) Cache expiration time (ms), 0 means never expires.
      cacheGetKey: (...args) => JSON.stringify(args), // (Default: JSON.stringify(args)) Defines cache key.
      cacheTransport: undefined, // (Default: undefined) Custom caching mechanism with get, set, flush methods.
      abortController: undefined, // (Default: undefined) Uses AbortController to cancel async operations on timeout.
      enableSnapshots: true, // (Default: true) Enables snapshot events for statistics.
      rotateBucketController: undefined, // (Default: undefined) Shares EventEmitter for multiple circuit breakers.
      ...options,
    });

    this.setEventListeners(breaker);
    this.circuitBreakers.set(name, breaker);
    return breaker;
  }

  /**
   * Sets event listeners for the circuit breaker.
   * @param circuitBreaker - The circuit breaker to set event listeners for.
   */
  private setEventListeners(circuitBreaker: OpossumCircuitBreaker) {
    const events = [
      'fire',
      'reject',
      'timeout',
      'success',
      'failure',
      'open',
      'close',
      'halfOpen',
      'fallback',
      'semaphoreLocked',
      'healthCheckFailed',
      'shutdown',
      'cacheHit',
      'cacheMiss',
    ] as const;
  

    events.forEach((event) => {
      circuitBreaker.on(event as any, () => {
        const eventHandler = this.eventHandlers[event];

        if (eventHandler) {
          eventHandler();
        }
      });
    });
  }

  /**
   * Executes a request function with circuit breaker protection.
   * @param params - Parameters for the circuit breaker.
   * @returns The result of the request function.
   * @throws Error if the request function fails.
   */
  async execute<T>(params: CircuitBreakerParams<T>): Promise<T> {
    const { name, requestFn, fallbackFn, options, args = [] } = params;
    this.validateInput(name, requestFn, fallbackFn);

    const circuitBreaker = this.createCircuitBreaker(
      requestFn,
      options || {},
      name
    );

    circuitBreaker.fallback( fallbackFn || this.defaultFallback(name));

    try {
      return (await circuitBreaker.fire(...args)) as T;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Gets statistics for all circuit breakers.
   * @returns An object containing statistics for all circuit breakers.
   */
  getCircuitBreakerStats(): Record<string, any> {
    return Object.fromEntries(
      Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [
        name,
        breaker.stats,
      ])
    );
  }

  /**
   * Validates input parameters for the circuit breaker.
   * @param name - Name of the circuit breaker.
   * @param requestFn - The request function to be executed.
   * @param fallbackFn - The fallback function to be executed.
   * @throws Error if any of the input parameters are invalid.
   */
  private validateInput<T>(
    name: string,
    requestFn: RequestFn<T>,
    fallbackFn?: RequestFn<T>
  ) {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid name provided for circuit breaker');
    }

    if (!requestFn || typeof requestFn !== 'function') {
      throw new Error('Invalid request function provided for circuit breaker');
    }

    if (fallbackFn && typeof fallbackFn !== 'function') {
      throw new Error('Invalid fallback function provided for circuit breaker');
    }
  }

  /**
   * Creates a default fallback function.
   * @param name - Name of the circuit breaker.
   * @returns A default fallback function.
   */
  private defaultFallback(name: string) {
    return () => {
      throw new Error('Service is currently unavailable');
    };
  }
}
