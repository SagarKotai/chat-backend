import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

type Target = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware factory.
 *
 * @param schema  — Zod schema to validate against
 * @param target  — which request property to validate (default: body)
 */
export const validate =
  (schema: ZodSchema, target: Target = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      sendError(res, 'Validation failed', 422, errors);
      return;
    }

    // Replace the raw value with the parsed (coerced + stripped) value
    if (target === 'body') {
      req.body = result.data;
    } else if (target === 'query') {
      req.query = result.data as Request['query'];
    } else {
      req.params = result.data as Request['params'];
    }
    next();
  };
