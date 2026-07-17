/**
 * Single source of truth for the module ID.
 * Import this constant in every script file — never write the ID as a string literal.
 * @type {string}
 */
export const MODULE_ID = "daggerheart-quickrules";

/**
 * Programmatic name of the world compendium that stores the GM's custom content.
 * Passed to `CompendiumCollection.createCompendium({ name: CUSTOM_PACK_NAME, ... })`.
 * @type {string}
 */
export const CUSTOM_PACK_NAME = "quickrules-custom";

/**
 * Full collection id of the custom-content world compendium (`world.<name>`).
 * Shared between the writer (manage-content.js) and the reader (quickrules.js).
 * @type {string}
 */
export const CUSTOM_PACK_ID = `world.${CUSTOM_PACK_NAME}`;

/**
 * Human-readable label for the custom-content world compendium.
 * @type {string}
 */
export const CUSTOM_PACK_LABEL = "Quick Rules - Custom Content";

/**
 * Name of the single JournalEntry held inside the custom-content compendium.
 * @type {string}
 */
export const CUSTOM_JOURNAL_NAME = "My Custom Content";
