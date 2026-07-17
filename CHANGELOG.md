# 0.2.3

- [Added] **Manage Content** — a single GM-only screen (Module Settings → *Manage Content*) that replaces the old console-driven `QuickRules.AddMyContent()` / `QuickRules.Build()` workflow
  - **My Custom Content tab:** pick compendium folders, whole compendiums, or world folders (Items, Actors, Journals) from a tree, or drag folders/documents into a drop zone; a persistent selection list (survives closing/reopening) with per-entry removal; one destructive *Add to Quick Rules* commit rebuilds your custom content
  - Journals import one page per source page (raw HTML); Items/Actors get the same rich pages as before
  - Compendiums show their **origin module** so duplicate pack labels can be told apart, and added compendiums/folders are marked; adding a whole compendium marks all its folders
  - **SRD Build tab:** *Rebuild SRD - All* and *Rebuild SRD - Rules* with explanations of each
- [Added] **Visibility control:** world content keeps each entity's own permissions; compendium content is visible to players unless you flip a whole compendium to GM-only with the eye toggle (compendium folders and individual items are always visible — restrict at the compendium level)
- [Changed] **Storage moved to a world compendium** (created at runtime, `world.quickrules-custom`) instead of the `📜 Custom Quick Rules` world folder — the custom content now survives module updates and is not declared in `module.json`
- [Removed] The `📜 Custom Quick Rules` world-folder mechanism, the `DaggerheartAddMyContent` window, and the `QuickRules.AddMyContent()` console shortcut (`QuickRules.Open()` / `QuickRules.Build()` still work)

# 0.2.2

- [Performance] Journal cache is now pre-warmed on the `ready` hook — the expensive `pack.getDocuments()` call runs in the background at world load, making the first open near-instant
- [Performance] Added a static session-level journal cache (`_staticJournalCache`) that survives window close/open cycles — no more network round-trips on repeated opens
- [Fixed] Floating button click now calls `DaggerheartQuickRules.Open()` instead of always creating a new instance, consistent with all other entry points

# 0.2.1

- [Removed] AI Rules Assistant (Gemini integration) — the button, `Gemini API Key`/`Gemini Model` settings, and the bundled SRD data file have all been removed

# 0.2.0

- v14 only
- [Fixed] Memory leak: drag event listeners on floating button no longer accumulate on toggle (AbortController)
- [Fixed] render() calls now use ApplicationV2 v14 API (`render({ force: true })` instead of v1 `render(true)`)
- [Fixed] Floating button now respects viewport boundaries with 10px safety margin—cannot be dragged off-screen
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