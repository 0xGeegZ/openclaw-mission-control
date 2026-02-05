---
name: security-audit
description: Security Audit
disable-model-invocation: true
---

# Security Audit

## Overview

Perform a comprehensive security review of the codebase: identify vulnerabilities, then provide specific remediation steps with code examples for each issue. Cover dependencies, code patterns, data handling, and infrastructure.

## Steps

1. **Dependency audit**
   - Check for known vulnerabilities (e.g. `npm audit`)
   - Update outdated packages
   - Review third-party dependencies

2. **Authentication & authorization**
   - Verify proper authentication mechanisms
   - Check authorization controls and permission systems (e.g. Convex auth guards, membership checks)
   - Review session management and token handling
   - Ensure secure password policies and storage (if applicable)

3. **Input validation & sanitization**
   - Identify SQL injection and other injection vulnerabilities
   - Check for XSS and CSRF attack vectors
   - Validate all user inputs and API parameters
   - Review file upload and processing security

4. **Data protection**
   - Ensure sensitive data encryption at rest and in transit
   - Check for data exposure in logs and error messages
   - Review API responses for information leakage
   - Verify proper secrets management; no hardcoded secrets

5. **Infrastructure security**
   - Review environment variables and configuration security
   - Check HTTPS configuration and certificate validation
   - Analyze CORS policies and security headers
   - Audit network and access controls

## Security checklist

- [ ] Dependencies updated and free of known vulnerabilities
- [ ] No hardcoded secrets; proper secrets management
- [ ] Input validation and sanitization implemented
- [ ] Authentication mechanisms verified
- [ ] Authorization and permission systems checked
- [ ] Session management and token handling reviewed
- [ ] Sensitive data encrypted at rest and in transit
- [ ] No sensitive data in logs or error messages
- [ ] CORS and security headers reviewed
- [ ] Environment and configuration security reviewed
