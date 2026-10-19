/**
 * Errors services throw for expected failures. Input adapters map them to HTTP responses or MCP
 * tool errors; anything else is an internal error.
 */
export class ServiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 501,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ServiceError {
  constructor(message: string) {
    super(400, 'invalid_request', message);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(what: string) {
    super(403, 'forbidden', `${what} belongs to another user`);
  }
}

export class NotFoundError extends ServiceError {
  constructor(what: string) {
    super(404, 'not_found', `${what} not found`);
  }
}

export class ConflictError extends ServiceError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class NotImplementedError extends ServiceError {
  constructor(operation: string) {
    super(501, 'not_implemented', `${operation} is not implemented yet`);
  }
}

/** Placeholder for a service method that doesn't exist yet: callers get a 501. */
export const notImplemented = (operation: string) => (): never => {
  throw new NotImplementedError(operation);
};
