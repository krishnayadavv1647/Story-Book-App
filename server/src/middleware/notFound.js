import { ApiError } from '../utils/ApiError.js';

/** Terminal 404 for any unmatched route, kept inside the standard envelope. */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

export default notFound;
