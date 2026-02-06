# environment-configuration

**Tier:** MEDIUM (Phase 3)  
**Author:** Engineer (Full-Stack)  
**Category:** Configuration & Secrets Management  
**Status:** Operational  

## Overview
Comprehensive environment configuration and secrets management skill enabling .env file handling, secrets rotation, multi-environment setup, and configuration validation. Ensures secure and consistent application configuration across development, staging, and production environments.

## Core Competencies

### 1. .env Management
- `.env` file parsing and validation
- Environment variable loading and precedence
- Local vs. repository `.env` files
- `.env.local`, `.env.example` patterns
- Dotenv library integration (`dotenv`, `dotenv-expand`)
- Variable expansion and interpolation
- Comment handling and parsing
- Type coercion and casting

### 2. Secrets Rotation
- Automated secret rotation scheduling
- Secret versioning and history
- Key rotation without service downtime
- Gradual rollover strategies
- Revocation and expiry management
- Audit logging for all secret operations
- Access control for secret rotation
- Emergency rotation procedures

### 3. Multi-Environment Setup
- Environment detection (dev/staging/prod)
- Environment-specific configuration files
- Configuration inheritance and overrides
- Environment variable naming conventions
- Conditional logic based on environment
- Feature flag configuration per environment
- Build-time vs. runtime configuration
- Configuration export and import

### 4. Configuration Validation
- Schema validation (JSON Schema, Zod, Yup)
- Type checking for configuration values
- Required field enforcement
- Default value application
- Value range validation
- Format validation (URLs, emails, ports)
- Dependency validation between values
- Configuration drift detection

## Implementation Patterns

### Environment-Specific Configuration
```typescript
// config.ts - Centralized configuration
interface AppConfig {
  nodeEnv: 'development' | 'staging' | 'production';
  database: {
    host: string;
    port: number;
    ssl: boolean;
  };
  api: {
    baseUrl: string;
    timeout: number;
  };
  secrets: {
    jwtSecret: string;
    apiKey: string;
  };
}

function loadConfig(): AppConfig {
  const env = process.env.NODE_ENV || 'development';
  
  return {
    nodeEnv: env,
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: env === 'production'
    },
    api: {
      baseUrl: process.env.API_BASE_URL,
      timeout: parseInt(process.env.API_TIMEOUT || '30000')
    },
    secrets: {
      jwtSecret: process.env.JWT_SECRET,
      apiKey: process.env.API_KEY
    }
  };
}
```

### Secrets Rotation Implementation
```typescript
// secretsManager.ts
interface SecretRotationConfig {
  scheduleInterval: number; // ms
  gracefulTimeout: number;  // ms for old secret acceptance
  maxRetries: number;
}

async function rotateSecret(
  secretName: string,
  config: SecretRotationConfig
): Promise<void> {
  // Generate new secret
  const newSecret = await generateSecret();
  
  // Store new secret in vault (inactive)
  await vaultClient.storeSecret(secretName, newSecret, { active: false });
  
  // Notify services of pending rotation
  await notifyServices(secretName);
  
  // Wait for graceful period
  await sleep(config.gracefulTimeout);
  
  // Activate new secret
  await vaultClient.activateSecret(secretName, newSecret);
  
  // Audit rotation
  await auditLog('secret_rotated', { secretName, timestamp: Date.now() });
}
```

### Configuration Validation with Zod
```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().min(1).max(65535).default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  API_TIMEOUT: z.coerce.number().min(1000).max(300000).default(30000),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type Env = z.infer<typeof EnvSchema>;

function validateEnvironment(): Env {
  const result = EnvSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}
```

### .env File Loading with Fallback
```typescript
import dotenv from 'dotenv';
import path from 'path';

function loadEnvFiles() {
  const env = process.env.NODE_ENV || 'development';
  
  // Load in order of precedence (lowest to highest)
  const envFiles = [
    '.env',                      // Shared defaults
    `.env.${env}`,              // Environment-specific
    '.env.local',               // Local overrides (not committed)
    `.env.${env}.local`,        // Environment + local
  ];
  
  for (const file of envFiles) {
    const filePath = path.resolve(process.cwd(), file);
    
    try {
      dotenv.config({ path: filePath, override: true });
      console.log(`Loaded environment: ${file}`);
    } catch (error) {
      // File doesn't exist, continue
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
```

## Cross-Functional Validation Points

**@qa Validation:**
- Configuration correctness in different environments
- Secrets properly isolated and not leaked
- Environment-specific behavior validation
- Configuration validation accuracy
- Secret rotation without service disruption
- Fallback to default values when expected
- File parsing and interpolation accuracy

**Test Coverage:**
- Unit: Config parsing, validation, type coercion
- Integration: Multi-environment config loading
- E2E: Full application startup with various env configs
- Security: Secrets not logged, not exposed in errors

## Tools & Standards

### Configuration Management Tools
- `dotenv` - Simple .env loading
- `dotenv-expand` - Variable expansion
- `zod` / `yup` - Schema validation
- `joi` - Data validation
- AWS Secrets Manager / HashiCorp Vault - Secrets management

### Environment Variable Naming Conventions
```
DATABASE_*          // Database connection settings
API_*              // API configuration
JWT_*              // JWT/Auth secrets
LOG_*              // Logging configuration
FEATURE_*          // Feature flags
CACHE_*            // Cache configuration
REDIS_*            // Redis connection
AWS_*              // AWS service configuration
```

### File Structure
```
.env                    # Base configuration (can commit)
.env.example           # Template for required vars (commit this)
.env.development       # Dev-specific (commit or git-ignore)
.env.staging          # Staging-specific (do not commit)
.env.production        # Production-specific (do not commit)
.env.local            # Local overrides (always .gitignore)
.env.*.local          # Env-specific local (always .gitignore)
```

## Security Best Practices

| Practice | Reason |
|----------|--------|
| Never commit secrets | Prevent credential exposure in VCS history |
| Use .env.example template | Document required variables without secrets |
| Add .env* to .gitignore | Protect sensitive local files |
| Validate all configuration | Catch misconfigurations early |
| Rotate secrets regularly | Reduce impact of compromise |
| Use vault/secrets manager | Centralized secret management |
| Log configuration access | Audit trail for compliance |
| Encrypt secrets at rest | Protect stored credentials |

## Common Pitfalls & Solutions

| Pitfall | Solution |
|---------|----------|
| Secrets in version control | Use .gitignore, pre-commit hooks, git-secrets |
| Hardcoded values | Use environment variables consistently |
| Missing validation | Add schema validation at startup |
| Wrong env precedence | Document and test load order |
| Env pollution | Isolate environments, clear between tests |
| Rotation downtime | Implement graceful acceptance period |
| Configuration drift | Regular audits, IaC templating |

## Metrics & Monitoring

- Configuration validation success rate
- Secret rotation frequency and duration
- Configuration audit events
- Environment-specific error rates
- Secrets access frequency and patterns
- Configuration deployment time

## Environment-Specific Configurations

### Development
```bash
NODE_ENV=development
LOG_LEVEL=debug
API_TIMEOUT=60000
DATABASE_URL=postgresql://user:pass@localhost/dbname_dev
FEATURE_VERBOSE_ERRORS=true
```

### Staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
API_TIMEOUT=30000
DATABASE_URL=<vault-managed-secret>
FEATURE_VERBOSE_ERRORS=false
```

### Production
```bash
NODE_ENV=production
LOG_LEVEL=warn
API_TIMEOUT=10000
DATABASE_URL=<vault-managed-secret>
FEATURE_VERBOSE_ERRORS=false
ENABLE_APM=true
```

## Related Skills
- **dependency-management** (configuration-dependent package selection)
- **async-concurrency-patterns** (async config initialization)
- **error-handling-resilience** (handling config errors gracefully)
- **logging-observability** (config-driven logging levels)
- **security-hardening** (secrets protection)

## References & Standards
- [12-Factor App - Config](https://12factor.net/config)
- [OWASP Secrets Management](https://owasp.org/www-community/Sensitive_Data_Exposure)
- [Node.js dotenv Documentation](https://github.com/motdotla/dotenv)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [JSON Schema Specification](https://json-schema.org/)

## Skill Maturity

**Level 1 (Foundational):** Basic .env loading, environment detection
**Level 2 (Intermediate):** Multi-env setup, validation, secrets rotation
**Level 3 (Advanced):** Dynamic secrets, complex rotation strategies, observability
**Current:** Level 2 (Intermediate)

---
**Last Updated:** 2026-02-06
**Phase:** 3 (Medium Priority)
