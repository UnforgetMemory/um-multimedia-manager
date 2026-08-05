# i18n System Conclusion

**Date**: 2026-07-12

## Decision: Keep Two Systems Separate

Based on the [i18n Audit](i18n-audit.md), the two i18n systems **cannot be merged**:

| System | Scope | Constraint |
|--------|-------|------------|
| `vue-i18n` (shared/locales/) | Popup/Options SPA | Shadow DOM incompatible |
| Custom `t()` (content/i18n/) | Content scripts | Shadow DOM isolation required |

**Root cause**: Content scripts that run inside Shadow DOM cannot use `vue-i18n` — it's an external platform with CSS-scoping limitations. The custom `t()` function uses a flat key format (`'Close'`, `'Save'`), while `vue-i18n` uses dot-delimited keys (`nav.overview`, `common.save`).

## Action Items
- Keep both systems as-is
- Key naming alignment is low priority — each system serves different consumers
- Locale sync mechanism (`chrome.storage.onChanged`) already works correctly