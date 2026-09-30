/**
 * Multi-Tenant Subdomain & Edge Routing Middleware Reference (`middleware.ts`)
 * Re-exports the Express/Edge multi-tenant routing handler used by `server.ts`
 * to identify root domain (`mypos.com`), `/admin` SuperAdmin routes, and store subdomains (`mystore.mypos.com`).
 */
export {
  tenantRoutingMiddleware,
  resolveTenantContext,
  parseTenantSlugFromRequest,
  type TenantRouteResolution,
} from './src/server/middleware/tenantMiddleware.ts';
