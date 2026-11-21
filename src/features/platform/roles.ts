/** The web's platform operators (main.js): they see the platform console and are not counted in a franchise's usage. */
export const PLATFORM_ROLES = ['platform_admin', 'platform_support'];
export const isPlatformUser = (roles: unknown) =>
  Array.isArray(roles) && roles.some((r) => typeof r === 'string' && PLATFORM_ROLES.includes(r));
