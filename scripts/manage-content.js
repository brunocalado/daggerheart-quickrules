/*!
 * Daggerheart: Quick Rules
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
import {
    MODULE_ID,
    CUSTOM_PACK_ID,
    CUSTOM_PACK_NAME,
    CUSTOM_PACK_LABEL,
    CUSTOM_JOURNAL_NAME
} from "./constants.js";
import { buildSRD } from "./quickrules-builder.js";

/**
 * GM-only Settings screen for managing Quick Rules content.
 *
 * The "My Custom Content" tab lets the GM pick compendium / world folders or whole
 * compendiums (or drag documents in), tracked as removable *sources*, then destructively
 * rebuild the custom-content world compendium. The "SRD Build" tab rebuilds the bundled
 * SRD reference.
 *
 * Leaf class — intentionally no `BASE_APPLICATION` (see CLAUDE.md §3).
 * @extends {foundry.applications.api.ApplicationV2}
 */
export class DaggerheartManageContent extends HandlebarsApplicationMixin(ApplicationV2) {

    /**
     * Document types eligible as content sources.
     * @type {string[]}
     */
    static SOURCE_TYPES = ["Item", "Actor", "JournalEntry"];

    constructor(options = {}) {
        super(options);
        /** @type {"custom"|"srd"} Active tab. */
        this.activeTab = "custom";
        /** @type {Set<string>} Expanded tree node keys (persist across re-renders). */
        this.expanded = new Set();
        /**
         * Added content sources, keyed by `pack:<collection>`, `folder:<uuid>` or `doc:<uuid>`.
         * Each source holds the document entries it contributed to the selection.
         * @type {Map<string, {key:string, type:string, label:string, entries:object[]}>}
         */
        this.sources = new Map();
        // Restore the persisted sources so the selection survives closing/reopening.
        for (const src of game.settings.get(MODULE_ID, "contentSelection") ?? []) {
            if (src?.key && Array.isArray(src.entries)) {
                this.sources.set(src.key, { key: src.key, type: src.type, label: src.label, visibility: src.visibility, entries: src.entries });
            }
        }
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-manage-content",
        tag: "form",
        classes: ["daggerheart-quickrules-window", "dh-manage-content-window"],
        window: {
            title: "Quick Rules — Manage Content",
            icon: "fas fa-folder-plus",
            resizable: true
        },
        position: {
            width: 780,
            height: 720
        },
        actions: {
            switchTab: DaggerheartManageContent._onSwitchTab,
            toggleNode: DaggerheartManageContent._onToggleNode,
            addFolder: DaggerheartManageContent._onAddFolder,
            addPack: DaggerheartManageContent._onAddPack,
            toggleVisibility: DaggerheartManageContent._onToggleVisibility,
            removeSelection: DaggerheartManageContent._onRemoveSelection,
            clearSelection: DaggerheartManageContent._onClearSelection,
            commit: DaggerheartManageContent._onCommit,
            buildAll: DaggerheartManageContent._onBuildAll,
            buildRules: DaggerheartManageContent._onBuildRules
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/templates/manage-content.hbs`
        }
    };

    /* ------------------------------------------------------------------ */
    /*  Context                                                            */
    /* ------------------------------------------------------------------ */

    /** @override */
    async _prepareContext(options) {
        const packs = this._eligiblePacks();
        // Load indexes so folder membership counts are accurate.
        await Promise.all(packs.map(p => p.getIndex()));

        const compendiums = packs.map(pack => {
            const key = `pack:${pack.collection}`;
            const indexEntries = Array.from(pack.index);
            const folders = this._flattenFolders(
                pack.folders,
                f => indexEntries.filter(e => e.folder === f.id).length,
                this.sources.has(key) // whole compendium added -> its folders are implicitly included
            );
            const added = this.sources.has(key);
            return {
                key,
                label: pack.metadata.label,
                source: this._packSource(pack),
                expanded: this.expanded.has(key),
                added,
                visibleToPlayers: added ? this.sources.get(key).visibility !== "gm" : true,
                folders,
                hasFolders: folders.length > 0,
                packCollection: pack.collection,
                total: pack.index.size
            };
        }).sort((a, b) => a.label.localeCompare(b.label));

        const worldGroups = [
            { type: "Item", label: "Item Folders" },
            { type: "Actor", label: "Actor Folders" },
            { type: "JournalEntry", label: "Journal Folders" }
        ].map(({ type, label }) => {
            const key = `world:${type}`;
            const folders = this._flattenFolders(
                game.folders.filter(f => f.type === type),
                f => f.contents.length
            );
            return { key, label, expanded: this.expanded.has(key), folders, hasFolders: folders.length > 0 };
        });

        const selection = Array.from(this._selectionEntries().values());
        return {
            isCustomTab: this.activeTab === "custom",
            isSrdTab: this.activeTab === "srd",
            compendiums,
            hasCompendiums: compendiums.length > 0,
            worldGroups,
            selection,
            hasSelection: selection.length > 0,
            selectionCount: selection.length
        };
    }

    /**
     * Compendium packs eligible as content sources: non-system packs of a supported
     * type, excluding the game system, this module's own packs, and the runtime
     * custom-content pack.
     * @returns {CompendiumCollection[]}
     */
    _eligiblePacks() {
        return game.packs.filter(p => {
            if (p.metadata.packageType === "system") return false;
            if (p.collection.startsWith("daggerheart.")) return false;
            if (p.collection.startsWith(`${MODULE_ID}.`)) return false;
            if (p.collection === CUSTOM_PACK_ID) return false;
            return DaggerheartManageContent.SOURCE_TYPES.includes(p.metadata.type);
        });
    }

    /**
     * Human-readable name of the package a compendium belongs to, so duplicate pack
     * labels (e.g. two "Ancestries") can be told apart by their origin.
     * @param {CompendiumCollection} pack
     * @returns {string}
     */
    _packSource(pack) {
        if (pack.metadata.packageType === "world") return "World";
        const pkg = game.modules.get(pack.metadata.packageName);
        return pkg?.title ?? pack.metadata.packageName;
    }

    /**
     * Flatten a (possibly nested) folder collection into a depth-indented list,
     * marking which folders are already an added source.
     * @param {Iterable<Folder>} folders - World or compendium folders.
     * @param {(folder: Folder) => number} countFn - Returns the entry count for a folder.
     * @param {boolean} [parentAdded=false] - True when the containing compendium is itself an
     *   added source, in which case every folder is implicitly included and locked.
     * @returns {Array<{uuid:string, name:string, count:number, indent:number, added:boolean, viaParent:boolean}>}
     */
    _flattenFolders(folders, countFn, parentAdded = false) {
        const arr = Array.from(folders);
        const byParent = {};
        const roots = [];
        for (const f of arr) {
            const pid = f.folder?.id ?? f.folder ?? null;
            if (pid) (byParent[pid] ??= []).push(f);
            else roots.push(f);
        }
        const result = [];
        const walk = (nodes, depth) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            for (const f of nodes) {
                result.push({
                    uuid: f.uuid,
                    name: f.name,
                    count: countFn(f),
                    indent: depth * 16,
                    added: parentAdded || this.sources.has(`folder:${f.uuid}`),
                    viaParent: parentAdded
                });
                if (byParent[f.id]) walk(byParent[f.id], depth + 1);
            }
        };
        walk(roots, 0);
        return result;
    }

    /**
     * Union of document entries across all sources (deduplicated by UUID).
     * @returns {Map<string, object>}
     */
    _selectionEntries() {
        const map = new Map();
        for (const src of this.sources.values()) {
            for (const entry of src.entries) if (!map.has(entry.uuid)) map.set(entry.uuid, entry);
        }
        return map;
    }

    /* ------------------------------------------------------------------ */
    /*  Drag & drop (drop zone only)                                       */
    /* ------------------------------------------------------------------ */

    /** @override — attach the drop-zone listeners (CLAUDE.md §3: non-action DOM listeners here). */
    _onRender(context, options) {
        const dropZone = this.element.querySelector(".dh-drop-zone");
        if (!dropZone) return;
        dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropZone.classList.add("dragover");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
        dropZone.addEventListener("drop", (event) => this._onDrop(event));
    }

    /**
     * Handle a drop onto the selection drop zone. Accepts a Folder or a single
     * Item / Actor / JournalEntry. Drops always add (never toggle).
     * @param {DragEvent} event
     * @returns {Promise<void>}
     */
    async _onDrop(event) {
        event.preventDefault();
        this.element.querySelector(".dh-drop-zone")?.classList.remove("dragover");
        const data = foundry.applications.ux.TextEditor.getDragEventData(event);
        if (!data?.type) return;

        if (data.type === "Folder") {
            const folder = await fromUuid(data.uuid);
            if (!folder) return;
            if (!DaggerheartManageContent.SOURCE_TYPES.includes(folder.type)) {
                ui.notifications.warn(`Folders of type "${folder.type}" are not supported.`);
                return;
            }
            const key = `folder:${folder.uuid}`;
            if (!this.sources.has(key)) {
                const docs = await this._getFolderDocuments(folder);
                this.sources.set(key, { key, type: "folder", label: folder.name, entries: this._entriesFor(docs, d => this._ownershipForDoc(d)) });
            }
        } else if (DaggerheartManageContent.SOURCE_TYPES.includes(data.type)) {
            const doc = await fromUuid(data.uuid);
            if (!doc) return;
            const key = `doc:${doc.uuid}`;
            if (!this.sources.has(key)) {
                this.sources.set(key, { key, type: "doc", label: doc.name, entries: [this._makeEntry(doc, this._ownershipForDoc(doc))] });
            }
        } else {
            ui.notifications.warn("Only folders, items, actors or journals can be added.");
            return;
        }
        await this._saveSelection();
        this.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Source helpers                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Resolve the direct documents contained in a world or compendium folder.
     * @param {Folder} folder
     * @returns {Promise<Document[]>}
     */
    async _getFolderDocuments(folder) {
        // Compendium folders carry a `pack` collection id; world folders do not.
        if (folder.pack) {
            const pack = game.packs.get(folder.pack);
            if (!pack) return [];
            const all = await pack.getDocuments();
            return all.filter(d => d.folder?.id === folder.id);
        }
        return folder.contents ?? [];
    }

    /**
     * Map documents to lightweight selection entries, keeping only supported types.
     * @param {Document[]} docs
     * @param {(doc: Document) => object} ownershipFactory - Returns the ownership object to
     *   stamp on the generated page for this document.
     * @returns {object[]}
     */
    _entriesFor(docs, ownershipFactory) {
        return docs
            .filter(d => DaggerheartManageContent.SOURCE_TYPES.includes(d.documentName))
            .map(d => this._makeEntry(d, ownershipFactory(d)));
    }

    /**
     * Build a lightweight, serializable selection entry for a document.
     * @param {Document} doc
     * @param {object} ownership - Ownership object to stamp on the generated page.
     * @returns {{uuid:string, name:string, docType:string, icon:string, ownership:object}}
     */
    _makeEntry(doc, ownership) {
        return {
            uuid: doc.uuid,
            name: doc.name,
            docType: doc.documentName,
            icon: DaggerheartManageContent._iconForType(doc.documentName),
            ownership
        };
    }

    /**
     * Default ownership for a document added via a folder or individual drop.
     * World documents copy their own ownership (per-entity visibility); compendium
     * documents are always visible — to restrict them, add the whole compendium and set
     * its visibility there. Compendium ownership is never read.
     * @param {Document} doc
     * @returns {object}
     */
    _ownershipForDoc(doc) {
        if (doc.pack) return { default: 2 };
        return foundry.utils.deepClone(doc.ownership ?? { default: 0 });
    }

    /**
     * FontAwesome icon class for a document type.
     * @param {string} docType
     * @returns {string}
     */
    static _iconForType(docType) {
        return { Item: "fa-suitcase", Actor: "fa-user", JournalEntry: "fa-book-open" }[docType] ?? "fa-file";
    }

    /**
     * Persist the current sources to the world setting so the selection survives reopening.
     * @returns {Promise<void>}
     */
    async _saveSelection() {
        await game.settings.set(
            MODULE_ID,
            "contentSelection",
            Array.from(this.sources.values()).map(s => ({ key: s.key, type: s.type, label: s.label, visibility: s.visibility, entries: s.entries }))
        );
    }

    /* ------------------------------------------------------------------ */
    /*  Actions                                                            */
    /* ------------------------------------------------------------------ */

    /** Switch between the "custom" and "srd" tabs. */
    static _onSwitchTab(event, target) {
        this.activeTab = target.dataset.tab;
        this.render();
    }

    /** Toggle a tree node's expanded state. */
    static _onToggleNode(event, target) {
        const key = target.dataset.nodeKey;
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        this.render();
    }

    /** Toggle a folder source (world or compendium) on/off. */
    static async _onAddFolder(event, target) {
        const uuid = target.dataset.uuid;
        const key = `folder:${uuid}`;
        if (this.sources.has(key)) {
            this.sources.delete(key);
        } else {
            const folder = await fromUuid(uuid);
            if (!folder) return;
            if (!DaggerheartManageContent.SOURCE_TYPES.includes(folder.type)) {
                ui.notifications.warn(`Folders of type "${folder.type}" are not supported.`);
                return;
            }
            const docs = await this._getFolderDocuments(folder);
            this.sources.set(key, { key, type: "folder", label: folder.name, entries: this._entriesFor(docs, d => this._ownershipForDoc(d)) });
        }
        await this._saveSelection();
        this.render();
    }

    /** Toggle a whole-compendium source on/off (added as visible-to-players by default). */
    static async _onAddPack(event, target) {
        const collection = target.dataset.pack;
        const key = `pack:${collection}`;
        if (this.sources.has(key)) {
            this.sources.delete(key);
        } else {
            const pack = game.packs.get(collection);
            if (!pack) return;
            const docs = await pack.getDocuments();
            // Whole compendiums are visible to players by default; the GM can flip this per pack.
            this.sources.set(key, {
                key, type: "pack", label: pack.metadata.label, visibility: "players",
                entries: this._entriesFor(docs, () => ({ default: 2 }))
            });
        }
        await this._saveSelection();
        this.render();
    }

    /** Flip a whole-compendium source between "visible to players" and "GM only". */
    static async _onToggleVisibility(event, target) {
        const key = `pack:${target.dataset.pack}`;
        const src = this.sources.get(key);
        if (!src) return;
        src.visibility = src.visibility === "gm" ? "players" : "gm";
        const level = src.visibility === "gm" ? 0 : 2;
        for (const entry of src.entries) entry.ownership = { default: level };
        await this._saveSelection();
        this.render();
    }

    /** Remove a single document from every source that contributed it. */
    static async _onRemoveSelection(event, target) {
        const uuid = target.dataset.uuid;
        for (const [key, src] of this.sources) {
            src.entries = src.entries.filter(e => e.uuid !== uuid);
            if (src.entries.length === 0) this.sources.delete(key);
        }
        await this._saveSelection();
        this.render();
    }

    /** Clear every source. */
    static async _onClearSelection(event, target) {
        this.sources.clear();
        await this._saveSelection();
        this.render();
    }

    /** Destructively rebuild the custom-content compendium from the selection. */
    static async _onCommit(event, target) {
        if (!game.user.isGM) return;
        const selection = this._selectionEntries();
        if (selection.size === 0) {
            ui.notifications.warn("Please select at least one source first.");
            return;
        }

        const existing = await this._countExistingEntries();
        const proceed = await DialogV2.confirm({
            window: { title: "Rebuild Custom Content" },
            content: `<p>This will replace <strong>${existing}</strong> existing custom `
                + `entr${existing === 1 ? "y" : "ies"} with content generated from `
                + `<strong>${selection.size}</strong> selected document(s).</p>`
                + `<p>This action cannot be undone. Continue?</p>`,
            modal: true,
            rejectClose: false
        });
        if (!proceed) return;

        const btn = target;
        const icon = btn.querySelector("i");
        const originalIcon = icon?.className;
        btn.disabled = true;
        if (icon) icon.className = "fas fa-spinner fa-spin";
        ui.notifications.info("Daggerheart Quick Rules | Rebuilding custom content...");

        try {
            const count = await this._processCommit(selection);
            ui.notifications.info(`Daggerheart Quick Rules | Custom content rebuilt (${count} pages).`);
            this.sources.clear();
            await this._saveSelection();
            this.render();
        } catch (err) {
            console.error(err);
            ui.notifications.error("Error rebuilding custom content. Check the console.");
        } finally {
            if (this.element && btn.isConnected) {
                btn.disabled = false;
                if (icon && originalIcon) icon.className = originalIcon;
            }
        }
    }

    /** Rebuild the SRD reference (rules + compendiums). */
    static async _onBuildAll(event, target) {
        await this._runSrdBuild("All", target);
    }

    /** Rebuild the SRD reference (rules only). */
    static async _onBuildRules(event, target) {
        await this._runSrdBuild("Rules", target);
    }

    /**
     * Confirm and run an SRD rebuild.
     * @param {"All"|"Rules"} mode
     * @param {HTMLElement} button
     * @returns {Promise<void>}
     */
    async _runSrdBuild(mode, button) {
        if (!game.user.isGM) return;
        const proceed = await DialogV2.confirm({
            window: { title: "Rebuild SRD" },
            content: `<p>Rebuild the Quick Rules SRD reference (<strong>${mode}</strong>)? `
                + `This regenerates the bundled reference compendium.</p>`,
            modal: true,
            rejectClose: false
        });
        if (!proceed) return;

        const icon = button.querySelector("i");
        const originalIcon = icon?.className;
        button.disabled = true;
        if (icon) icon.className = "fas fa-spinner fa-spin";
        try {
            await buildSRD(mode);
        } catch (err) {
            console.error(err);
            ui.notifications.error("Error rebuilding the SRD. Check the console.");
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                if (icon && originalIcon) icon.className = originalIcon;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Storage (Option C: world compendium)                              */
    /* ------------------------------------------------------------------ */

    /**
     * Count the pages already stored in the custom journal, if it exists.
     * @returns {Promise<number>}
     */
    async _countExistingEntries() {
        const pack = game.packs.get(CUSTOM_PACK_ID);
        if (!pack) return 0;
        const journals = await pack.getDocuments({ name: CUSTOM_JOURNAL_NAME });
        return journals[0]?.pages.size ?? 0;
    }

    /**
     * Get (or create) the world compendium and its single custom journal.
     * The pack is world-owned (created at runtime, not declared in module.json) so it
     * survives module updates; the journal is OBSERVER-readable so players can view it.
     * @returns {Promise<JournalEntry>}
     */
    async _getOrCreateCustomJournal() {
        let pack = game.packs.get(CUSTOM_PACK_ID);
        if (!pack) {
            pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
                type: "JournalEntry",
                label: CUSTOM_PACK_LABEL,
                name: CUSTOM_PACK_NAME
            });
            // Grant players read access at the pack level.
            await pack.configure({ ownership: { PLAYER: "OBSERVER", ASSISTANT: "OWNER" } });
        }

        const journals = await pack.getDocuments({ name: CUSTOM_JOURNAL_NAME });
        let journal = journals[0];
        if (!journal) {
            journal = await JournalEntry.create(
                { name: CUSTOM_JOURNAL_NAME, ownership: { default: 2 } },
                { pack: pack.collection }
            );
        }
        return journal;
    }

    /**
     * Generate page data from the selection and destructively rewrite the custom journal.
     * @param {Map<string, object>} selection - Deduplicated selection entries.
     * @returns {Promise<number>} Number of pages created.
     */
    async _processCommit(selection) {
        const journal = await this._getOrCreateCustomJournal();

        const entries = Array.from(selection.values()).sort((a, b) => a.name.localeCompare(b.name));
        const pages = [];
        for (const entry of entries) {
            const doc = await fromUuid(entry.uuid);
            if (!doc) continue;
            // The ownership was resolved when the source was added (see _ownershipForDoc /
            // the whole-compendium visibility toggle). Compendium ownership is never read here.
            const ownership = entry.ownership ?? { default: 0 };
            if (doc.documentName === "JournalEntry") {
                for (const page of doc.pages) pages.push(this._journalPageData(page, ownership));
            } else {
                const data = await this._createPageData(doc, ownership);
                if (data) pages.push(data);
            }
        }

        // Wipe existing pages, then recreate in batches.
        if (journal.pages.size > 0) {
            await journal.deleteEmbeddedDocuments("JournalEntryPage", journal.pages.map(p => p.id));
        }
        const batchSize = 20;
        for (let i = 0; i < pages.length; i += batchSize) {
            await journal.createEmbeddedDocuments("JournalEntryPage", pages.slice(i, i + batchSize));
        }

        this._refreshQuickRules();
        return pages.length;
    }

    /**
     * Invalidate the cache of any open Quick Rules window and re-render it.
     */
    _refreshQuickRules() {
        const app = Object.values(ui.windows).find(w => w.id === MODULE_ID);
        if (!app) return;
        app._cachedPages = null;
        app._pageMap = null;
        app._pageMetadata = null;
        app._enrichCache?.clear();
        app.render();
    }

    /* ------------------------------------------------------------------ */
    /*  Page generation                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Build a Quick Rules page from a source JournalEntryPage (raw HTML, no processing).
     * @param {JournalEntryPage} page
     * @param {object} ownership - Ownership resolved at add time.
     * @returns {object}
     */
    _journalPageData(page, ownership) {
        return {
            name: page.name,
            type: "text",
            text: { content: page.text?.content ?? "", format: 1 },
            title: { show: false },
            ownership: foundry.utils.deepClone(ownership),
            flags: { [MODULE_ID]: { category: "Journal" } }
        };
    }

    /**
     * Build a rich Quick Rules page from an Item or Actor document.
     * Ported from the former DaggerheartAddMyContent. Ownership is resolved at add time and
     * passed in — world docs carry their own ownership, compendium docs follow the
     * whole-compendium visibility choice.
     * @param {Item|Actor} doc
     * @param {object} ownership - Ownership resolved at add time.
     * @returns {Promise<object>}
     */
    async _createPageData(doc, ownership) {
        const title = doc.name;
        const imgSrc = doc.img;
        const hasImg = imgSrc && imgSrc !== "icons/svg/mystery-man.svg";

        // --- 1. HEADER (Title + Open Button) ---
        const headerHtml = `
            <div class="dh-custom-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dcb15d; margin-bottom: 20px; padding-bottom: 5px;">
                <h1 style="border-bottom: none; margin: 0; padding: 0; flex: 1; line-height: 1;">${doc.name}</h1>
                <span style="flex: 0 0 auto; margin-left: 10px; font-size: 0.85em; font-family: 'Signika', sans-serif;">
                    @UUID[${doc.uuid}]{Open ${doc.documentName}}
                </span>
            </div>
        `;

        // --- 2. BODY (Stats, Description, Motives, Features) ---
        let bodyHtml = "";

        if (doc.type === "adversary" || doc.type === "environment") {
            const sys = doc.system;
            const tier = sys.tier ?? "-";
            const type = sys.type ? String(sys.type).charAt(0).toUpperCase() + String(sys.type).slice(1) : "-";
            const diff = sys.difficulty ?? "-";

            bodyHtml += `
                <div class="dh-adversary-stats" style="border-bottom: 0; padding-bottom: 0; margin-bottom: 5px;">
                    <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp;
                    <strong>Type:</strong> <span class="dh-stat-value">${type}</span> &nbsp;|&nbsp;
                    <strong>Difficulty:</strong> <span class="dh-stat-value">${diff}</span>
                </div>
            `;

            if (doc.type === "adversary") {
                const hp = sys.resources?.hitPoints?.max ?? "-";
                const stress = sys.resources?.stress?.max ?? "-";
                bodyHtml += `
                    <div class="dh-adversary-stats">
                        <strong>HP:</strong> <span class="dh-stat-value">${hp}</span> &nbsp;|&nbsp;
                        <strong>Stress:</strong> <span class="dh-stat-value">${stress}</span>
                    </div>
                `;
            }

            const bio = sys.biography?.value || sys.description || "";
            if (bio) bodyHtml += `<div class="item-description">${bio}</div>`;

            if (sys.motivesAndTactics) {
                bodyHtml += `
                    <h3 style="color: #C9A060; margin-top: 20px;">Motives & Tactics</h3>
                    <div class="dh-motives">${sys.motivesAndTactics}</div>
                `;
            }
            if (sys.impulses) {
                bodyHtml += `
                    <h3 style="color: #C9A060; margin-top: 20px;">Impulses</h3>
                    <div class="dh-motives">${sys.impulses}</div>
                `;
            }

            if (doc.items && doc.items.size > 0) {
                const features = doc.items.filter(i => i.type === "feature");
                if (features.length > 0) {
                    bodyHtml += `<h3 style="color: #C9A060; margin-top: 20px;">Features</h3>`;
                    for (const feat of features) {
                        const rawForm = feat.system.featureForm || "passive";
                        const form = rawForm.charAt(0).toUpperCase() + rawForm.slice(1);
                        const cleanDesc = (feat.system.description?.value || feat.system.description || "").replace(/<\/?p[^>]*>/g, " ");
                        bodyHtml += `
                            <div class="dh-feature-row">
                                <span class="dh-feature-text">
                                    <strong>[${form}] ${feat.name}:</strong>
                                    ${cleanDesc}
                                </span>
                            </div>
                        `;
                    }
                }
            }
        } else {
            let desc = "";
            if (doc.documentName === "Item") {
                desc = doc.system.description?.value || doc.system.description || "";
            } else if (doc.documentName === "Actor") {
                desc = doc.system.biography?.value || doc.system.details?.biography || "";
            }

            if (doc.type === "character") {
                const level = doc.system.level ?? "";
                const className = doc.system.class || "-";
                bodyHtml += `
                    <div class="dh-adversary-stats">
                        <strong>Level:</strong> ${level} | <strong>Class:</strong> ${className}
                    </div>`;
            }

            if (desc) bodyHtml += `<div class="dh-custom-body">${desc}</div>`;
            else if (!hasImg) bodyHtml += `<div class="dh-custom-body">No description provided.</div>`;
        }

        // --- 3. IMAGE (Last element) ---
        let imageHtml = "";
        if (hasImg) {
            imageHtml = `
                <div class="dh-img-container" style="margin-top: 30px; text-align: center;">
                    <img src="${imgSrc}" class="dh-item-img" style="max-width: 100%; height: auto; border: none; box-shadow: none;">
                </div>
            `;
        }

        const content = headerHtml + bodyHtml + imageHtml;

        // --- Category flag ---
        let category = "Custom";
        if (doc.type) {
            category = doc.type === "domainCard"
                ? "Domain Card"
                : doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
        } else if (hasImg && !bodyHtml) {
            category = "Custom Image";
        }

        return {
            name: title,
            type: "text",
            text: { content, format: 1 },
            title: { show: false },
            ownership: foundry.utils.deepClone(ownership),
            flags: {
                [MODULE_ID]: {
                    category
                }
            }
        };
    }
}
