import type { NextFunction, Request, Response } from 'express';

// Wrap an async route handler so thrown errors reach the error middleware.
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
