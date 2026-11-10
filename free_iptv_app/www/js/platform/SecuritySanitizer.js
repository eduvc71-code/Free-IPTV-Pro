// =========================================================
// Free-IPTV Pro - SecuritySanitizer.js (FASE 7)
// Sanitiza logs en consola y archivo local: nunca imprime
// contraseñas, tokens o credenciales de Xtream en texto plano.
// =========================================================

class SecuritySanitizer {
  constructor() {
    this.patterns = [
      // Contraseñas en URLs Xtream: ?password=xxx o &pass=xxx
      /([?&](?:password|pass|pwd)=)[^&]+/gi,
      // Usuario en URLs: ?username=xxx o &user=xxx
      /([?&](?:username|user)=)[^&]+/gi,
      // Tokens tipo JWT o Bearer
      /(Bearer\s+)[A-Za-z0-9\-._~+\/]+=*/gi,
      // Authorization headers básicos
      /(Authorization:\s*Basic\s+)[A-Za-z0-9\-._~+\/]+=*/gi,
      // Cualquier cosa que parezca clave/secret en JSON de logs
      /("password"\s*:\s*")[^"]+(")/gi,
      /("secret"\s*:\s*")[^"]+(")/gi,
      /("apiKey"\s*:\s*")[^"]+(")/gi,
      /("token"\s*:\s*")[^"]+(")/gi
    ];

    this.redacted = '[REDACTADO]';

    this.installConsoleInterceptor();
  }

  installConsoleInterceptor() {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const sanitizeArgs = (args) => {
      return args.map(arg => {
        if (typeof arg === 'string') return this.sanitizeString(arg);
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.parse(JSON.stringify(arg, (key, value) => {
              if (typeof value === 'string') return this.sanitizeString(value);
              return value;
            }));
          } catch (e) {
            return arg;
          }
        }
        return arg;
      });
    };

    console.log = (...args) => {
      origLog.apply(console, sanitizeArgs(args));
    };
    console.warn = (...args) => {
      origWarn.apply(console, sanitizeArgs(args));
    };
    console.error = (...args) => {
      origError.apply(console, sanitizeArgs(args));
    };
  }

  sanitizeString(str) {
    let result = str;
    this.patterns.forEach(pattern => {
      result = result.replace(pattern, (match, p1) => p1 + this.redacted);
    });
    return result;
  }

  // Sanitizar un objeto completo antes de enviarlo a logs o almacenamiento local
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    const sanitized = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      const safeKey = key.toLowerCase();
      if (safeKey.includes('password') || safeKey.includes('pass') ||
          safeKey.includes('secret') || safeKey.includes('token') ||
          safeKey.includes('apiKey') || safeKey.includes('pwd')) {
        sanitized[key] = this.redacted;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Sanitizar antes de guardar en localStorage / sessionStorage
  sanitizeForStorage(value) {
    if (typeof value === 'string') return this.sanitizeString(value);
    if (typeof value === 'object' && value !== null) return this.sanitizeObject(value);
    return value;
  }
}

window.SecuritySanitizer = SecuritySanitizer;
window.securitySanitizer = new SecuritySanitizer();

console.log('[SecuritySanitizer] Interceptor de logs instalado. Credenciales serán redactadas.');
