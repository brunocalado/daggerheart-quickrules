# 0.2.0

- v14 only
- [Fixed] Memory leak: drag event listeners on floating button no longer accumulate on toggle (AbortController)
- [Fixed] render() calls now use ApplicationV2 v14 API (`render({ force: true })` instead of v1 `render(true)`)
- [Changed] MODULE_ID centralized in `scripts/constants.js` — single source of truth for module ID across all files
- [Changed] CSS selectors for body-injected elements (floating button, journal sidebar button) now prefixed with `body` selector and documented

# 0.1.8
- Gemini Integration
**WARNING! - READ THIS:** <https://github.com/brunocalado/daggerheart-quickrules/wiki/How-to-Configure-the-AI-Rules-Assistant-(Free-Tier)>

# 0.1.7
- removed warning
- Refactor

# 0.1.6
- Cache

# 0.1.5
- It will remember the last floating button position.

# 0.1.4
- shift + d warning removed

# 0.1.3
- shift + d works again

# 0.1.2
- You can disable the pulsing effect

# 0.1.1
- fixed: You can show players now
- improved style

# 0.1.0
- You can drag the floating button without open it

# 0.0.9
- CSS will not affect anything else but the module.

# 0.0.5
- deep search