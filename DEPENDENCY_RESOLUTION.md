# Standard Error Dependency Resolution

## Issue
This document describes the resolution of the `standard-error` dependency issue, which had a problematic "Lesser GNU Affero General Public License" (a non-standard, non-OSI-approved license).

## Root Cause
The `standard-error` package was present as a deep transitive dependency in older versions of the dependency tree:
- `rdflib@2.2.0` (and earlier) → `jsonld@3.3.0` → `request@2.88.0` → (various transitive dependencies)

The `request` package (now deprecated) had multiple transitive dependencies that eventually included `standard-error`.

## Resolution
**Resolved by PR #35:** Upgrade of `rdflib` from version 2.3.0 to 2.3.2

### What Changed
The newer version of rdflib uses a modernized dependency chain:
- `rdflib@2.3.2` → `jsonld@9.0.0` → `@digitalbazaar/http-client@4.2.0`

The deprecated `request` package has been completely eliminated from the dependency tree, along with all its problematic transitive dependencies including `standard-error`.

### Verification
```bash
# Verify standard-error is not present
npm ls standard-error
# Output: (empty)

# Full dependency tree scan
npm ls --all 2>&1 | grep -i "standard-error"
# Output: (no matches)
```

## Error Handling Approach

This project uses **idiomatic Node.js/JavaScript error handling** without external dependencies:

### Native Error Class
```javascript
// Standard JavaScript error handling
throw new Error('Failed to fetch rootservices document');
throw new Error(`No ServiceProviderCatalog for ${domain} services`);
```

### Error Properties
JavaScript's native `Error` class supports:
- `message` - Error message
- `name` - Error type (default: "Error")
- `stack` - Stack trace
- Custom properties can be added as needed

### Why No External Error Library Needed
The functionality that `StandardError.js` provided can be achieved with native JavaScript:

```javascript
// StandardError.js approach (OLD - not used)
throw new StandardError("Not Found", {code: 404})

// Native JavaScript approach (CURRENT)
const error = new Error("Not Found");
error.code = 404;
throw error;

// Or create a custom error class
class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.code = 404;
    }
}
```

## Recommendation
Continue using native JavaScript `Error` class for error handling. This approach is:
- ✅ Supported in Node.js 22 and 24
- ✅ No external dependencies required
- ✅ Standard JavaScript practice
- ✅ No licensing concerns
- ✅ Better maintainability

## License Compliance
Current dependency tree is free from:
- ❌ Non-standard licenses (like "Lesser GNU Affero General Public License")
- ❌ Deprecated packages (like `request`)
- ✅ All dependencies use OSI-approved licenses compatible with Apache-2.0

## References
- Issue: [GitHub Issue discussing standard-error dependency](https://github.com/moll/js-standard-error/issues/4)
- PR #35: Upgrade rdflib from 2.3.0 to 2.3.2 with test coverage
