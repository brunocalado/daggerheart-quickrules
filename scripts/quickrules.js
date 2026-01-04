const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main Quick Rules Application for Daggerheart
 * Uses ApplicationV2 from Foundry V13
 */
export class DaggerheartQuickRules extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        super(options);
        // Track the currently selected page ID internally
        this.selectedPageId = null;
        // Track the search query to persist across renders
        this.searchQuery = "";
        // Track scroll position of the list
        this.scrollPos = 0;
        // View Mode: 'all' or 'favorites'
        this.viewMode = 'all';
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-quickrules",
        tag: "form",
        classes: ["daggerheart-quickrules-window"], 
        window: {
            title: "Daggerheart Quick Rules", // Generic title for everyone
            icon: "fas fa-book-open",
            resizable: true,
            controls: []
        },
        position: {
            width: 1000,
            height: 750
        },
        actions: {
            viewPage: DaggerheartQuickRules._onViewPage,
            sharePage: DaggerheartQuickRules._onSharePage,
            toggleFavorite: DaggerheartQuickRules._onToggleFavorite,
            toggleViewMode: DaggerheartQuickRules._onToggleViewMode,
            changeFontSize: DaggerheartQuickRules._onChangeFontSize,
            toggleSource: DaggerheartQuickRules._onToggleSource,
            forceOpen: DaggerheartQuickRules._onForceOpen
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/screen.hbs"
        }
    };

    /** * Public method to navigate to a specific page
     * Used by socket listeners or external calls
     * Now strictly sets render state without smart logic to avoid recursion
     */
    navigateToPage(pageId) {
        this.selectedPageId = pageId;
        this.render({ force: true });
    }

    /**
     * INTELLIGENT NAVIGATION (Used by GM "Show to Players")
     * Searches for the page across contexts and switches user settings if needed.
     */
    async forceNavigateToPage(pageId) {
        console.log(`Daggerheart QuickRules | Attempting to force navigate to page: ${pageId}`);

        // 1. Force View Mode to 'all' so Favorites don't hide the content
        if (this.viewMode !== 'all') {
            this.viewMode = 'all';
        }

        // 2. Check if page exists in current context
        let currentJournal = await this._getActiveJournal();
        let found = false;

        // Check current journal
        if (currentJournal && currentJournal.pages.has(pageId)) {
            found = true;
        }

        // Check custom folders (always available)
        if (!found) {
            const customFolder = game.folders.find(f => f.name === "📜 Custom Quick Rules" && f.type === "JournalEntry");
            if (customFolder) {
                for (const j of customFolder.contents) {
                    if (j.pages.has(pageId)) {
                        found = true; 
                        break;
                    }
                }
            }
        }

        // 3. If NOT found, it might be in the "Other" SRD journal (Rules vs All)
        // If the GM is using "All" and Player is using "Rules", IDs won't match.
        if (!found) {
            console.log("Daggerheart QuickRules | Page not found in current source. Checking alternate source...");
            const useAll = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;
            
            // Determine the "other" journal name
            const otherName = useAll ? "Daggerheart SRD - Rules" : "Daggerheart SRD - All";
            const otherJournal = game.journal.getName(otherName);

            if (otherJournal && otherJournal.pages.has(pageId)) {
                console.log(`Daggerheart QuickRules | Found page in "${otherName}". Switching user source preference.`);
                // Switch the flag so the UI renders the correct journal
                await game.user.setFlag("daggerheart-quickrules", "useAllContent", !useAll);
                found = true;
            }
        }

        if (found) {
            this.selectedPageId = pageId;
            this.render({ force: true, focus: true });
        } else {
            console.warn("Daggerheart QuickRules | Page ID sent by GM could not be found in any known journal.", pageId);
            ui.notifications.warn("The page shared by the GM could not be found (Version mismatch?).");
        }
    }

    /** * Helper to get the currently active journal Document 
     * Prioritizes World Journals first (created by Build), then Module Compendium
     */
    async _getActiveJournal() {
        const useAll = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;
        const targetName = useAll ? "Daggerheart SRD - All" : "Daggerheart SRD - Rules";
        const packName = "daggerheart-quickrules.quickrules"; 
        
        // 1. Try to find it in the World Journal entries (Created by QuickRules.Build)
        const worldJournal = game.journal.getName(targetName);
        if (worldJournal) {
            return worldJournal;
        }

        // 2. Fallback to Compendium
        const pack = game.packs.get(packName);
        if (!pack) {
            return null;
        }

        const index = await pack.getIndex();
        const entry = index.find(e => e.name === targetName);
        
        if (!entry) {
            return null;
        }

        return await pack.getDocument(entry._id);
    }

    /** @override */
    async _prepareContext(options) {
        // 1. Get user preference
        const useAllContent = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;
        const targetJournalName = useAllContent ? "Daggerheart SRD - All" : "Daggerheart SRD - Rules";

        // 2. Init Pages Array
        let pages = [];

        // 3. Fetch Core/Compendium Content
        const journalEntry = await this._getActiveJournal();
        if (journalEntry) {
            pages = Array.from(journalEntry.pages);
        }

        // 4. Fetch Custom Content from Folder
        const customFolderName = "📜 Custom Quick Rules";
        const customFolder = game.folders.find(f => f.name === customFolderName && f.type === "JournalEntry");
        
        if (customFolder) {
            const customJournals = customFolder.contents; 
            for (const journal of customJournals) {
                for (const page of journal.pages) {
                    if (page.testUserPermission(game.user, "OBSERVER")) {
                         pages.push(page);
                    }
                }
            }
        }
        
        // Load flags
        const favorites = game.user.getFlag("daggerheart-quickrules", "favorites") || [];
        const fontSize = game.user.getFlag("daggerheart-quickrules", "fontSize") || 14; 

        const context = {
            hasPages: false,
            alphabetizedPages: {},
            activeContent: null,
            activePageName: "",
            viewMode: this.viewMode,
            fontSize: fontSize,
            useAllContent: useAllContent,
            targetJournalName: targetJournalName,
            isGM: game.user.isGM
        };

        if (pages.length === 0) {
            return context;
        }

        // --- NON-GM FILTERING FOR SRD CONTENT ---
        if (!game.user.isGM) {
            const hiddenPacks = ["daggerheart.adversaries", "daggerheart.environments"];
            pages = pages.filter(p => {
                const sourcePack = p.getFlag("daggerheart-quickrules", "sourcePack");
                // Allow-List override: If GM forced this page, show it regardless of pack
                if (this.selectedPageId === p.id) return true;

                if (sourcePack && hiddenPacks.includes(sourcePack)) return false;
                return true;
            });
        }

        // Filter for favorites mode
        if (this.viewMode === 'favorites') {
            pages = pages.filter(p => favorites.includes(p.id));
        }

        if (pages.length > 0) context.hasPages = true;

        // Sort alphabetically
        pages.sort((a, b) => a.name.localeCompare(b.name));

        // 5. Group by First Letter
        const grouped = {};
        for (const page of pages) {
            const firstLetter = page.name.charAt(0).toUpperCase();
            if (!grouped[firstLetter]) grouped[firstLetter] = [];
            
            const isActive = this.selectedPageId === page.id;
            const isFav = favorites.includes(page.id);
            
            grouped[firstLetter].push({
                id: page.id,
                name: page.name,
                active: isActive,
                isFavorite: isFav
            });

            // 6. Enrich Content (only if active)
            if (isActive) {
                context.activePageName = page.name;
                const textContent = page.text?.content || "";
                
                context.activeContent = await foundry.applications.ux.TextEditor.enrichHTML(textContent, {
                    secrets: game.user.isGM, // Only show secrets to GM
                    async: true,
                    relativeTo: page
                });
            }
        }

        context.alphabetizedPages = grouped;
        return context;
    }

    /** @override */
    _onRender(context, options) {
        const html = this.element;
        const searchInput = html.querySelector('.dh-search-input');
        const listContainer = html.querySelector('.dh-page-list');

        // Restore Scroll Position
        if (listContainer && this.scrollPos > 0) {
            listContainer.scrollTop = this.scrollPos;
        }
        
        if (searchInput) {
            searchInput.value = this.searchQuery;

            if (this.searchQuery) {
                this._filterList(this.searchQuery);
            }

            // Setup Listeners
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = event.target.value; // Save state
                this._filterList(this.searchQuery);
            });
            
            // Only focus if we are interacting
            if (this.searchQuery) searchInput.focus(); 
        }
    }

    _filterList(query) {
        const term = query.toLowerCase();
        const html = this.element;
        const items = html.querySelectorAll('.dh-page-item');
        const headers = html.querySelectorAll('.dh-letter-group');

        items.forEach(item => {
            const name = item.dataset.pageName.toLowerCase();
            if (name.includes(term)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });

        headers.forEach(group => {
            const visibleChildren = group.querySelectorAll('.dh-page-item:not(.hidden)');
            if (visibleChildren.length === 0) {
                group.classList.add('hidden');
            } else {
                group.classList.remove('hidden');
            }
        });
    }

    /* --- Action Handlers --- */

    static async _onToggleSource(event, target) {
        event.preventDefault();
        const currentSetting = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;
        const newSetting = !currentSetting;

        await game.user.setFlag("daggerheart-quickrules", "useAllContent", newSetting);
        
        // Reset selection and scroll
        this.selectedPageId = null;
        this.scrollPos = 0;
        this.searchQuery = "";
        
        this.render({ force: true });
    }

    static async _onChangeFontSize(event, target) {
        event.preventDefault();
        const direction = target.dataset.direction;
        let currentSize = game.user.getFlag("daggerheart-quickrules", "fontSize") || 14; 
        
        if (direction === "reset") {
            currentSize = 14;
        } else if (direction === "up") {
            currentSize += 2;
        } else {
            currentSize -= 2;
        }

        if (currentSize < 10) currentSize = 10;
        if (currentSize > 32) currentSize = 32;

        const listContainer = this.element.querySelector('.dh-page-list');
        if (listContainer) this.scrollPos = listContainer.scrollTop;

        await game.user.setFlag("daggerheart-quickrules", "fontSize", currentSize);
        this.render({ force: true });
    }

    static async _onViewPage(event, target) {
        event.preventDefault();
        const listContainer = this.element.querySelector('.dh-page-list');
        if (listContainer) {
            this.scrollPos = listContainer.scrollTop;
        }
        const pageId = target.dataset.pageId;
        this.selectedPageId = pageId;
        this.render({ force: true });
    }

    static async _onToggleViewMode(event, target) {
        event.preventDefault();
        const mode = target.dataset.mode;
        if (this.viewMode !== mode) {
            this.viewMode = mode;
            this.scrollPos = 0; 
            this.render({ force: true });
        }
    }

    static async _onToggleFavorite(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const pageId = target.dataset.pageId;
        let favorites = game.user.getFlag("daggerheart-quickrules", "favorites") || [];

        if (favorites.includes(pageId)) {
            favorites = favorites.filter(id => id !== pageId);
        } else {
            favorites.push(pageId);
        }

        const listContainer = this.element.querySelector('.dh-page-list');
        if (listContainer) this.scrollPos = listContainer.scrollTop;

        await game.user.setFlag("daggerheart-quickrules", "favorites", favorites);
        this.render({ force: true });
    }

    static async _onForceOpen(event, target) {
        event.preventDefault();
        
        if (!this.selectedPageId) {
            ui.notifications.warn("Please select a page first to show to players.");
            return;
        }

        // --- UPDATED: Reactive Setting Pattern (Like Daggerheart Store) ---
        // Instead of Socket.emit, we update a world setting.
        // This triggers the onChange hook in module.js for all connected clients.
        await game.settings.set("daggerheart-quickrules", "forceOpenRequest", {
            pageId: this.selectedPageId,
            time: Date.now() // Timestamp ensures the change is always detected
        });

        ui.notifications.info("Daggerheart Quick Rules | Showing page to all players.");
    }

    static async _onSharePage(event, target) {
        event.preventDefault();
        
        if (!this.selectedPageId) return;

        // 1. Check Main Journal
        let page = null;
        const mainJournal = await this._getActiveJournal();
        if (mainJournal && mainJournal.pages.has(this.selectedPageId)) {
            page = mainJournal.pages.get(this.selectedPageId);
        }

        // 2. If not found, check Custom Folder
        if (!page) {
            const customFolderName = "📜 Custom Quick Rules";
            const customFolder = game.folders.find(f => f.name === customFolderName && f.type === "JournalEntry");
            if (customFolder) {
                for (const journal of customFolder.contents) {
                    if (journal.pages.has(this.selectedPageId)) {
                        const candidate = journal.pages.get(this.selectedPageId);
                        if (candidate.testUserPermission(game.user, "OBSERVER")) {
                            page = candidate;
                            break;
                        }
                    }
                }
            }
        }

        if (!page) return;

        let content = await foundry.applications.ux.TextEditor.enrichHTML(page.text.content, {async: true});
        const title = page.name;

        // Inject styles for Chat Card
        content = content.replace(/<h([1-6])(.*?)>/gi, (match, level, attributes) => {
            return `<h${level} ${attributes} style="color: #dcb15d !important; border-bottom: 1px solid #5e4b2a; margin-top: 10px;">`;
        });
        content = content.replace('class="dh-item-img"', 'style="float: right; max-width: 100px; border: 1px solid #C9A060; margin-left: 10px; border-radius: 4px;"');

        const styles = {
            card: `border: 2px solid #C9A060; border-radius: 8px; overflow: hidden; background: #1a1a1a; margin-bottom: 10px;`,
            header: `background: #191919 !important; padding: 8px; border-bottom: 2px solid #C9A060;`,
            title: `margin: 0; font-weight: bold; color: #C9A060 !important; font-family: 'Modesto Condensed', 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%; font-size: 1.4em;`,
            body: `padding: 20px; color: #e0e0e0; font-family: 'Signika', sans-serif; min-height: 100px; background: #222;`
        };

        const cardContent = `
        <div class="chat-card" style="${styles.card}">
            <header class="card-header flexrow" style="${styles.header}">
                <h3 class="noborder" style="${styles.title}">
                    ${title}
                </h3>
            </header>
            <div class="card-content" style="${styles.body}">
                ${content}
            </div>
        </div>
        `;

        ChatMessage.create({
            content: cardContent,
            speaker: ChatMessage.getSpeaker({alias: "Quick Rules"})
        });
        
        console.log(`Daggerheart QuickRules | Shared "${title}" to chat.`);
    }

    /**
     * Builds the Split Journal from the Compendium
     */
    static async buildSRD(mode = 'standard') {
        const sourceUuid = "Compendium.daggerheart.journals.JournalEntry.uNs7ne9VCbbu5dcG";
        const targetJournalName = (mode === 'All') ? "Daggerheart SRD - All" : "Daggerheart SRD - Rules";
        const targetFolderName = "QuickRulesDB";
        const protectedAcronyms = ["NPC", "NPCS", "GM", "GMS", "HP", "AP", "DC"]; 
        const minorWords = ["is", "your", "a", "the", "on", "in", "to", "of", "an", "and", "with"];
        const compendiumList = [
            "daggerheart.classes", "daggerheart.subclasses", "daggerheart.domains", 
            "daggerheart.ancestries", "daggerheart.communities", "daggerheart.armors", 
            "daggerheart.consumables", "daggerheart.loot", "daggerheart.adversaries", 
            "daggerheart.environments", "daggerheart.beastforms"
        ];

        console.log(`Daggerheart QuickRules | Locating Compendium Journal...`);
        const sourceJournal = await fromUuid(sourceUuid);

        if (!sourceJournal) {
            console.error(`Daggerheart QuickRules | Could not find source Compendium Journal: ${sourceUuid}`);
            return;
        }

        console.log(`Daggerheart QuickRules | Processing "${sourceJournal.name}"... Mode: ${mode}`);

        let folder = game.folders.find(f => f.name === targetFolderName && f.type === "JournalEntry");
        if (!folder) {
            folder = await Folder.create({
                name: targetFolderName,
                type: "JournalEntry"
            });
        }

        let targetJournal = game.journal.getName(targetJournalName);
        if (!targetJournal) {
            targetJournal = await JournalEntry.create({
                name: targetJournalName,
                folder: folder.id,
                ownership: { default: 2 } 
            });
        } else {
            if (targetJournal.folder?.id !== folder.id) {
                await targetJournal.update({ folder: folder.id });
            }
            if (targetJournal.ownership.default < 2) {
                await targetJournal.update({ "ownership.default": 2 }); 
            }
        }

        const newPagesData = [];
        // Helper functions (same as before)
        const getHeaderLevel = (node) => {
            if (!node.tagName) return 0;
            const match = node.tagName.match(/^H([1-6])$/);
            return match ? parseInt(match[1]) : 0;
        };

        const formatTitle = (str) => {
            if (!str) return "Untitled";
            let workingStr = str.trim();
            const linkMatch = workingStr.match(/\{([^}]+)\}/);
            if (linkMatch) workingStr = linkMatch[1];
            workingStr = workingStr.replace(/\s+/g, ' ').trim();
            
            return workingStr.split(' ').map((word, index) => {
                const cleanWord = word.replace(/[^\w\s]/gi, '');
                const lowerWord = cleanWord.toLowerCase();
                if (protectedAcronyms.includes(cleanWord.toUpperCase())) {
                    if (word.length > cleanWord.length) return cleanWord.toUpperCase() + word.slice(cleanWord.length);
                    return word.toUpperCase();
                }
                if (index > 0 && minorWords.includes(lowerWord)) return word.toLowerCase();
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');
        };

        const pages = sourceJournal.pages.contents.sort((a, b) => a.sort - b.sort);

        for (const page of pages) {
            if (page.type !== "text") continue;
            const content = page.text.content;
            if (!content) continue;

            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "text/html");
            const body = doc.body;
            const children = Array.from(body.children);

            newPagesData.push({
                name: formatTitle(page.name),
                text: { content: content, format: 1 },
                title: { show: true, level: 1 }
            });

            if (children.length === 0) continue;

            let firstNodeLevel = getHeaderLevel(children[0]);
            if (firstNodeLevel === 0) {
                let introBuffer = "";
                for (let i = 0; i < children.length; i++) {
                    if (getHeaderLevel(children[i]) > 0) break;
                    introBuffer += children[i].outerHTML;
                }
                if (introBuffer) {
                    newPagesData.push({
                        name: formatTitle(page.name) + " (Intro)",
                        text: { content: introBuffer, format: 1 },
                        title: { show: false, level: 1 }
                    });
                }
            }

            for (let i = 0; i < children.length; i++) {
                const currentNode = children[i];

                if (currentNode.tagName === "BLOCKQUOTE") {
                    if (currentNode.innerText.includes("Optional Rule")) {
                        const contentHtml = currentNode.outerHTML;
                        let title = "Optional Rule";
                        const boldEl = currentNode.querySelector('strong, b');
                        if (boldEl) {
                            title = formatTitle(boldEl.innerText);
                        } else {
                            const cleanText = currentNode.innerText.replace(/Optional Rule:?/i, "").trim();
                            if (cleanText.length > 0) {
                                title = "Optional Rule: " + formatTitle(cleanText.split(' ').slice(0, 4).join(' '));
                            }
                        }

                        newPagesData.push({
                            name: title,
                            text: { content: contentHtml, format: 1 },
                            title: { show: false, level: 1 }
                        });
                    }
                }

                if (currentNode.tagName === "UL" || currentNode.tagName === "OL") {
                    const listItems = Array.from(currentNode.children);
                    for (const li of listItems) {
                        if (li.tagName !== "LI") continue;
                        const text = li.innerText.trim();
                        const match = text.match(/^([^\.\:]+)([:\.])\s+(.+)$/);
                        
                        if (match) {
                            const term = match[1].trim();
                            const contentHtml = li.innerHTML; 
                            if (/^["'“]/.test(term)) continue;
                            const wordCount = term.split(/\s+/).length;
                            if (wordCount > 8) continue;
                            if (term.includes("@UUID") || term.includes("@Compendium")) continue;

                            newPagesData.push({
                                name: formatTitle(term),
                                text: { content: `<p>${contentHtml}</p>`, format: 1 },
                                title: { show: false, level: 1 }
                            });
                        }
                    }
                }

                const currentLevel = getHeaderLevel(currentNode);
                if (currentLevel > 0) {
                    let sectionBuffer = "";
                    const rawTitle = currentNode.innerText || "Section";
                    const sectionTitle = formatTitle(rawTitle);

                    for (let j = i; j < children.length; j++) {
                        const subNode = children[j];
                        const subLevel = getHeaderLevel(subNode);
                        if (j > i && subLevel > 0 && subLevel <= currentLevel) break; 
                        sectionBuffer += subNode.outerHTML;
                    }

                    newPagesData.push({
                        name: sectionTitle,
                        text: { content: sectionBuffer, format: 1 },
                        title: { show: false, level: 1 }
                    });
                }
            }
        }

        if (mode === 'All') {
            for (const packName of compendiumList) {
                const pack = game.packs.get(packName);
                if (!pack) continue;
                try {
                    const documents = await pack.getDocuments();
                    for (const item of documents) {
                        const desc = item.system?.description?.value || item.system?.description || "No description available.";
                        const itemName = formatTitle(item.name);
                        
                        const imgHtml = (item.img && item.img !== "icons/svg/mystery-man.svg") 
                            ? `<img src="${item.img}" class="dh-item-img" data-tooltip="${item.name}">` 
                            : "";
                        
                        const buttonHtml = `
                            <div style="margin-top: 20px; text-align: center; border-top: 1px solid #4b0000; padding-top: 10px; clear: both;">
                                <p>@UUID[${item.uuid}]{Open ${item.name} Sheet}</p>
                            </div>
                        `;
                        
                        const pageContent = `
                            ${imgHtml}
                            <h1>${item.name}</h1>
                            <div class="item-description">${desc}</div>
                            ${buttonHtml}
                        `;
                        
                        newPagesData.push({
                            name: itemName,
                            text: { content: pageContent, format: 1 },
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { sourcePack: packName } }
                        });
                    }
                } catch (err) {
                    console.error(`Daggerheart QuickRules | Error processing pack ${packName}:`, err);
                }
            }
        }

        if (newPagesData.length > 0) {
            if (targetJournal.pages.size > 0) {
                const pageIds = targetJournal.pages.map(p => p.id);
                await targetJournal.deleteEmbeddedDocuments("JournalEntryPage", pageIds);
            }
            const batchSize = 50;
            for (let i = 0; i < newPagesData.length; i += batchSize) {
                const batch = newPagesData.slice(i, i + batchSize);
                await targetJournal.createEmbeddedDocuments("JournalEntryPage", batch);
            }
            console.log(`Daggerheart QuickRules | Build Complete!`);
            targetJournal.sheet.render(true);
        } else {
            console.warn("Daggerheart QuickRules | No content generated.");
        }
    }
}