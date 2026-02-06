# dependency-management

**Tier:** MEDIUM (Phase 3)  
**Author:** Engineer (Full-Stack)  
**Category:** Supply Chain & Security  
**Status:** Operational  

## Overview
Comprehensive dependency lifecycle management skill enabling supply chain security, vulnerability scanning, version updates, and dependency auditing across Node.js/npm ecosystems. Ensures production-grade dependency hygiene and compliance.

## Core Competencies

### 1. Supply Chain Security
- **npm audit** scanning and vulnerability remediation
- Automated security vulnerability detection
- Dependency provenance verification
- Software Bill of Materials (SBOM) generation
- CVE monitoring and alerting
- Lockfile integrity validation

### 2. npm Audit & Scanning
- Full dependency tree analysis
- `npm audit` command execution and parsing
- Vulnerability severity classification (critical, high, moderate, low)
- Automated fix recommendations
- Audit report generation and archival
- Custom audit policies and thresholds

### 3. Update Strategies
- Semantic versioning compliance (major/minor/patch)
- Automated update workflows
- Dependency constraint evaluation
- Breaking change detection
- Version pinning vs. range strategies
- Outdated package identification
- Release notes integration

### 4. Version Management
- Monorepo version synchronization
- Workspace dependency alignment
- Version lock enforcement
- Rollback procedures
- Migration path planning
- Deprecation tracking
- License compliance verification

## Implementation Patterns

### npm Audit Workflow
```javascript
// Execute npm audit scan
// Parse vulnerability data
// Classify by severity
// Generate remediation recommendations
// Apply fixes (if safe)
// Validate lockfile
// Report results
```

### Dependency Update Process
```javascript
// Check for outdated packages
// Evaluate breaking changes
// Run test suite pre-update
// Apply version increments
// Update lockfiles
// Test post-update
// Create PR with changelog
```

### Version Compliance Check
```javascript
// Validate semantic versioning
// Check license compatibility
// Verify deprecation status
// Confirm security posture
// Report compliance status
```

## Cross-Functional Validation Points

**@qa Validation:**
- Dependency scanning accuracy and completeness
- Vulnerability detection reliability
- Update recommendation safety
- Lockfile integrity after modifications
- Compliance report accuracy

**Test Coverage:**
- Unit: npm audit parsing, version comparison logic
- Integration: Full dependency update workflow
- E2E: Security scanning with real vulnerable packages

## CLI Commands & Examples

```bash
# Audit dependencies for vulnerabilities
npm audit

# Audit with JSON output for parsing
npm audit --json

# Auto-fix vulnerabilities (safe fixes only)
npm audit fix

# Check for outdated packages
npm outdated

# Update specific package
npm update <package-name>

# Install with specific version
npm install <package>@<version>

# List vulnerabilities with custom output
npm audit --severity=high
```

## Configuration & Integration

### .npmrc Settings
```
audit-level=moderate
legacy-peer-deps=false
```

### Integration Points
- CI/CD pipeline security scanning
- Dependency dashboards
- Release management systems
- License scanning tools
- Container vulnerability scanning

## Security Considerations
- Validate fixes don't introduce breaking changes
- Test updates in isolated environments pre-production
- Maintain audit trails for compliance
- Monitor transitive dependencies
- Use integrity hashes in lockfiles
- Implement version pinning for critical dependencies

## Common Challenges & Resolutions

| Challenge | Resolution |
|-----------|-----------|
| Conflicting peer dependencies | Evaluate compatibility or use legacy-peer-deps |
| Breaking changes in updates | Run comprehensive test suite, review changelogs |
| Transitive vulnerability injection | Deep scan and constraint analysis |
| License incompatibility | Implement license scanning and policy enforcement |
| Supply chain attacks | Verify package provenance and use lock files |

## Metrics & Monitoring

- Vulnerability count by severity
- Mean time to remediation (MTTR)
- Outdated package ratio
- Successful update rate
- Dependency freshness score
- License compliance percentage

## Related Skills
- **async-concurrency-patterns** (dependency loading, version resolution)
- **environment-configuration** (dependency setup by environment)
- **error-handling-resilience** (graceful dependency failure handling)
- **logging-observability** (audit trail logging)

## References & Standards
- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)
- [CycloneDX SBOM Standard](https://cyclonedx.org/)
- [NIST Software Supply Chain Security](https://csrc.nist.gov/publications/detail/sp/800-53/rev-5)
- [Semantic Versioning](https://semver.org/)

## Skill Maturity

**Level 1 (Foundational):** Basic audit and update capabilities
**Level 2 (Intermediate):** Automated workflows, policy enforcement
**Level 3 (Advanced):** Supply chain security, SBOM, provenance verification
**Current:** Level 2 (Intermediate)

---
**Last Updated:** 2026-02-06
**Phase:** 3 (Medium Priority)
