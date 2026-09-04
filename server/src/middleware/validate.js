import { ApiError } from '../utils/ApiError.js';

/**
 * Zod validation for any part of a request.
 *
 * Parsed output is written to `req.validated.{body,params,query,files}` rather
 * than back over the Express originals — controllers must read the validated
 * copy, so an unvalidated field can never be used by accident.
 *
 *   router.post('/books', validate({ body: createBookSchema }), controller)
 */
export function validate(schemas = {}) {
  const parts = Object.entries(schemas);

  return (req, _res, next) => {
    req.validated ??= {};
    const issues = [];

    for (const [part, schema] of parts) {
      if (!schema) continue;
      const result = schema.safeParse(req[part]);

      if (result.success) {
        req.validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({
            path: [part, ...issue.path].join('.'),
            message: issue.message,
            code: issue.code,
          });
        }
      }
    }

    if (issues.length > 0) {
      return next(ApiError.validation(issues));
    }

    return next();
  };
}

export default validate;
