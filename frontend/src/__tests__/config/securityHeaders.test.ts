import { describe, expect, it } from 'vitest';
import { frontendSecurityHeaders } from '../../config/securityHeaders';

describe('frontend security headers', () => {
  it('defines the static hosting headers required by the ZAP baseline', () => {
    expect(frontendSecurityHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(frontendSecurityHeaders['X-Frame-Options']).toBe('DENY');
    expect(frontendSecurityHeaders['Permissions-Policy']).toContain('camera=()');
    expect(frontendSecurityHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(frontendSecurityHeaders['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(frontendSecurityHeaders['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains; preload');
    expect(frontendSecurityHeaders['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(frontendSecurityHeaders['Content-Security-Policy']).toContain("object-src 'none'");
  });
});
