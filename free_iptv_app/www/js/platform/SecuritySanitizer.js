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

    const sanitizeArg = (arg) => {
      if (typeof arg === 'string') return this.sanitizeString(arg);
      if (arg === null || arg === undefined || typeof arg === 'number' || typeof arg === 'boolean') {
        return arg;
      }
      if (arg instanceof Error) {
        return this.sanitizeString(arg.message || String(arg));
      }
      // Evitar serializar nodos del DOM, eventos o Window que causan bloqueo y excepciones circulares
      if (typeof arg === 'object') {
        if (arg.nodeType || arg.window || typeof arg.preventDefault === 'function') {
          return `[${arg.constructor ? arg.constructor.name : 'Object'}]`;
        }
        // Sanitización superficial rápida sin recursión infinita
        try {
          const shallow = Array.isArray(arg) ? [] : {};
          const keys = Object.keys(arg);
          const limit = Math.min(keys.length, 25); // límite de seguridad
          for (let i = 0; i < limit; i++) {
            const k = keys[i];
            const v = arg[k];
            const safeKey = k.toLowerCase();
            if (safeKey.includes('pass') || safeKey.includes('token') || safeKey.includes('secret') || safeKey.includes('pwd')) {
              shallow[k] = this.redacted;
            } else if (typeof v === 'string') {
              shallow[k] = this.sanitizeString(v);
            } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
              shallow[k] = v;
            } else {
              shallow[k] = typeof v;
            }
          }
          return shallow;
        } catch {
          return '[Object]';
        }
      }
      return arg;
    };

    const sanitizeArgs = (args) => {
      return args.map(arg => sanitizeArg(arg));
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
