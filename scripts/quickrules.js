const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main Quick Rules Application for Daggerheart
 * Uses ApplicationV2 from Foundry V13
 */
export class DaggerheartQuickRules extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        super(options);
        this.selectedPageId = null;
        this.searchQuery = "";
        this.scrollPos = 0;
        this.viewMode = 'all';
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-quickrules",
        tag: "form",
        classes: ["daggerheart-quickrules-window"], 
        window: {
            title: "Daggerheart: Quick Rules", 
            icon: "fas fa-book-open",
            resizable: true,
            controls: []
        },
        position: {
            width: 1050,
            height: 750
        },
        actions: {
            viewPage: DaggerheartQuickRules._onViewPage,
            navigatePage: DaggerheartQuickRules._onNavigatePage,
            sharePage: DaggerheartQuickRules._onSharePage,
            toggleFavorite: DaggerheartQuickRules._onToggleFavorite,
            toggleViewMode: DaggerheartQuickRules._onToggleViewMode,
            changeFontSize: DaggerheartQuickRules._onChangeFontSize,
            toggleFilter: DaggerheartQuickRules._onToggleFilter,
            toggleTheme: DaggerheartQuickRules._onToggleTheme,
            forceOpen: DaggerheartQuickRules._onForceOpen,
            clearSearch: DaggerheartQuickRules._onClearSearch // NEW ACTION
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/screen.hbs"
        }
    };

    /** * Public method to navigate to a specific page */
    navigateToPage(pageId) {
        this.selectedPageId = pageId;
        this.render({ force: true });
    }

    /**
     * INTELLIGENT NAVIGATION (Used by GM "Show to Players")
     */
    async forceNavigateToPage(pageId) {
        console.log(`Daggerheart QuickRules | Attempting to force navigate to page: ${pageId}`);

        if (this.viewMode !== 'all') {
            this.viewMode = 'all';
        }
        
        // Ensure filters allow seeing the content
        const filters = game.user.getFlag("daggerheart-quickrules", "filters") || { rules: true, compendiums: true, custom: true };
        let filtersChanged = false;

        let currentJournal = await this._getActiveJournal();
        let found = false;
        let targetPage = null;

        if (currentJournal && currentJournal.pages.has(pageId)) {
            found = true;
            targetPage = currentJournal.pages.get(pageId);
        }

        if (!found) {
            const customFolder = game.folders.find(f => f.name === "📜 Custom Quick Rules" && f.type === "JournalEntry");
            if (customFolder) {
                for (const j of customFolder.contents) {
                    if (j.pages.has(pageId)) {
                        found = true; 
                        targetPage = j.pages.get(pageId);
                        break;
                    }
                }
            }
        }

        // Auto-enable filters if page is hidden
        if (found && targetPage) {
            const isRule = targetPage.getFlag("daggerheart-quickrules", "type") === "rule";
            const sourcePack = targetPage.getFlag("daggerheart-quickrules", "sourcePack");
            const isCustom = !currentJournal.pages.has(pageId); // Simple check if it came from world

            if (isRule && !filters.rules) { filters.rules = true; filtersChanged = true; }
            if (sourcePack && !filters.compendiums) { filters.compendiums = true; filtersChanged = true; }
            if (isCustom && !filters.custom) { filters.custom = true; filtersChanged = true; }

            if (filtersChanged) {
                await game.user.setFlag("daggerheart-quickrules", "filters", filters);
            }

            this.selectedPageId = pageId;
            this.render({ force: true, focus: true });
        } else {
            console.warn("Daggerheart QuickRules | Page ID sent by GM could not be found.", pageId);
            ui.notifications.warn("The page shared by the GM could not be found (Version mismatch?).");
        }
    }

    /** * Helper to get the currently active journal Document */
    async _getActiveJournal() {
        const packName = "daggerheart-quickrules.quickrules"; 
        const pack = game.packs.get(packName);
        
        if (!pack) {
            console.error(`Daggerheart QuickRules | Compendium pack ${packName} not found.`);
            return null;
        }

        let journals = await pack.getDocuments({name: "Daggerheart SRD - All"});
        if (journals && journals.length > 0) return journals[0];

        journals = await pack.getDocuments({name: "Daggerheart SRD - Rules"});
        if (journals && journals.length > 0) return journals[0];

        return null;
    }

    /** @override */
    async _prepareContext(options) {
        // --- THEME ---
        const theme = game.user.getFlag("daggerheart-quickrules", "theme") || "light";

        // --- FILTER CONFIGURATION ---
        const defaultFilters = { rules: true, compendiums: true, custom: true };
        const filters = game.user.getFlag("daggerheart-quickrules", "filters") ?? defaultFilters;

        let pages = [];
        const journalEntry = await this._getActiveJournal();
        
        if (journalEntry) {
            const rawPages = Array.from(journalEntry.pages);
            
            // Filter Main Journal Content
            pages = rawPages.filter(p => {
                const isRule = p.getFlag("daggerheart-quickrules", "type") === "rule";
                const sourcePack = p.getFlag("daggerheart-quickrules", "sourcePack");

                if (isRule) return filters.rules;
                if (sourcePack) return filters.compendiums;
                return filters.rules;
            });
        }

        // Custom Content
        if (filters.custom) {
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
        }
        
        const favorites = game.user.getFlag("daggerheart-quickrules", "favorites") || [];
        const fontSize = game.user.getFlag("daggerheart-quickrules", "fontSize") || 14; 

        const context = {
            theme: theme, 
            hasPages: false,
            alphabetizedPages: {},
            activeContent: null,
            activePageName: "",
            viewMode: this.viewMode,
            fontSize: fontSize,
            filters: filters,
            isGM: game.user.isGM,
            prevPageId: null,
            nextPageId: null,
            hasRuleOrder: false,
            prevRuleId: null,
            nextRuleId: null,
            searchQuery: this.searchQuery // Pass search query to restore value
        };

        if (pages.length === 0) {
            return context;
        }

        // GM Secret Filter
        if (!game.user.isGM) {
            const hiddenPacks = ["daggerheart.adversaries", "daggerheart.environments"];
            pages = pages.filter(p => {
                const sourcePack = p.getFlag("daggerheart-quickrules", "sourcePack");
                if (this.selectedPageId === p.id) return true;
                if (sourcePack && hiddenPacks.includes(sourcePack)) return false;
                return true;
            });
        }

        // Favorites View Mode
        if (this.viewMode === 'favorites') {
            pages = pages.filter(p => favorites.includes(p.id));
        }

        if (pages.length > 0) context.hasPages = true;

        pages.sort((a, b) => a.name.localeCompare(b.name));

        // --- Determine Next/Prev Pages ---
        if (this.selectedPageId) {
            const currentIndex = pages.findIndex(p => p.id === this.selectedPageId);
            if (currentIndex !== -1) {
                if (currentIndex > 0) context.prevPageId = pages[currentIndex - 1].id;
                if (currentIndex < pages.length - 1) context.nextPageId = pages[currentIndex + 1].id;
            }

            const currentPageObj = pages.find(p => p.id === this.selectedPageId);
            if (currentPageObj) {
                const currentOrder = currentPageObj.getFlag("daggerheart-quickrules", "order");
                
                if (Number.isInteger(currentOrder)) {
                    context.hasRuleOrder = true;
                    
                    const pPrev = pages.find(p => p.getFlag("daggerheart-quickrules", "order") === currentOrder - 1);
                    if (pPrev) context.prevRuleId = pPrev.id;

                    const pNext = pages.find(p => p.getFlag("daggerheart-quickrules", "order") === currentOrder + 1);
                    if (pNext) context.nextRuleId = pNext.id;
                }
            }
        }

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

            if (isActive) {
                context.activePageName = page.name;
                const textContent = page.text?.content || "";
                
                context.activeContent = await foundry.applications.ux.TextEditor.enrichHTML(textContent, {
                    secrets: game.user.isGM, 
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

        if (listContainer && this.scrollPos > 0) {
            listContainer.scrollTop = this.scrollPos;
        }
        
        if (searchInput) {
            searchInput.value = this.searchQuery;
            if (this.searchQuery) {
                this._filterList(this.searchQuery);
            }
            searchInput.addEventListener('input', (event) => {
                this.searchQuery = event.target.value; 
                this._filterList(this.searchQuery);
            });
            // Only focus if there is a query, to prevent annoying jumps on normal render
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

    static async _onToggleTheme(event, target) {
        event.preventDefault();
        const currentTheme = game.user.getFlag("daggerheart-quickrules", "theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        await game.user.setFlag("daggerheart-quickrules", "theme", newTheme);
        this.render();
    }

    static async _onToggleFilter(event, target) {
        event.preventDefault();
        const filterName = target.dataset.filter;
        const currentFilters = game.user.getFlag("daggerheart-quickrules", "filters") || { rules: true, compendiums: true, custom: true };
        currentFilters[filterName] = !currentFilters[filterName];
        await game.user.setFlag("daggerheart-quickrules", "filters", currentFilters);
        this.scrollPos = 0;
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

    static async _onNavigatePage(event, target) {
        event.preventDefault();
        const pageId = target.dataset.pageId;
        if (pageId) {
            const listContainer = this.element.querySelector('.dh-page-list');
            if (listContainer) {
                this.scrollPos = listContainer.scrollTop;
            }
            this.selectedPageId = pageId;
            this.render({ force: true });
        }
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
        await game.settings.set("daggerheart-quickrules", "forceOpenRequest", {
            pageId: this.selectedPageId,
            time: Date.now() 
        });
        ui.notifications.info("Daggerheart Quick Rules | Showing page to all players.");
    }

    static async _onClearSearch(event, target) {
        event.preventDefault();
        this.searchQuery = "";
        
        // Find input directly in DOM if possible to update immediately without full re-render
        const searchInput = this.element.querySelector('.dh-search-input');
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
        
        // Re-run filter logic
        this._filterList("");
    }

    static async _onSharePage(event, target) {
        event.preventDefault();
        if (!this.selectedPageId) return;

        let page = null;
        const currentJournal = await this._getActiveJournal();
        
        if (currentJournal && currentJournal.pages.has(this.selectedPageId)) {
            page = currentJournal.pages.get(this.selectedPageId);
        }

        if (!page) {
            const customFolder = game.folders.find(f => f.name === "📜 Custom Quick Rules" && f.type === "JournalEntry");
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
    }

    static async buildSRD(mode = 'All') {
        const sourceCompendiumName = "daggerheart.journals";
        const sourceJournalId = "uNs7ne9VCbbu5dcG";
        const targetPackName = "daggerheart-quickrules.quickrules";
        const targetJournalName = (mode === 'All') ? "Daggerheart SRD - All" : "Daggerheart SRD - Rules";
        
        const protectedAcronyms = ["NPC", "NPCS", "GM", "GMS", "HP", "AP", "DC"]; 
        const minorWords = ["is", "your", "a", "the", "on", "in", "to", "of", "an", "and", "with"];
        const compendiumList = [
            "daggerheart.classes", "daggerheart.subclasses", "daggerheart.domains", 
            "daggerheart.ancestries", "daggerheart.communities", "daggerheart.armors", 
            "daggerheart.consumables", "daggerheart.loot", "daggerheart.adversaries", 
            "daggerheart.environments", "daggerheart.beastforms"
        ];

        console.log(`Daggerheart QuickRules | Build Started (${mode}).`);
        ui.notifications.info(`Daggerheart QuickRules | Build Started (${mode}). Please wait...`);

        const sourcePack = game.packs.get(sourceCompendiumName);
        if (!sourcePack) {
            ui.notifications.error(`Source Compendium '${sourceCompendiumName}' not found.`);
            return;
        }

        const sourceJournal = await sourcePack.getDocument(sourceJournalId);
        if (!sourceJournal) {
            ui.notifications.error(`Source Journal not found.`);
            return;
        }

        const targetPack = game.packs.get(targetPackName);
        if (!targetPack) {
            ui.notifications.error(`Target Compendium '${targetPackName}' not found.`);
            return;
        }

        if (targetPack.locked) {
            await targetPack.configure({locked: false});
        }

        let targetJournal = (await targetPack.getDocuments({name: targetJournalName}))[0];

        if (!targetJournal) {
            targetJournal = await JournalEntry.create({
                name: targetJournalName,
                ownership: { default: 2 } 
            }, {pack: targetPackName});
        }

        const newPagesData = [];
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

        let ruleIndex = 1;

        for (const page of pages) {
            if (page.type !== "text") continue;
            const content = page.text.content;
            if (!content) continue;

            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "text/html");
            const body = doc.body;
            const children = Array.from(body.children);

            let h2Buffer = "";      
            let h3Buffer = "";      
            let lastH2Content = ""; 

            newPagesData.push({
                name: formatTitle(page.name),
                text: { content: content, format: 1 },
                title: { show: true, level: 1 },
                flags: { "daggerheart-quickrules": { type: "rule", order: ruleIndex++ } }
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
                        title: { show: false, level: 1 },
                        flags: { "daggerheart-quickrules": { type: "rule", order: ruleIndex++ } }
                    });
                }
            }

            for (let i = 0; i < children.length; i++) {
                const currentNode = children[i];
                const currentLevel = getHeaderLevel(currentNode);

                let contextToInject = "";
                
                if (currentLevel === 2) {
                    if (lastH2Content) {
                        contextToInject = `<div class="dh-context-group">${lastH2Content}</div>`;
                    }
                    if (h2Buffer) lastH2Content = h2Buffer;
                    h2Buffer = ""; 
                    h3Buffer = ""; 
                } 
                else if (currentLevel === 3) {
                    if (h2Buffer) {
                        contextToInject = `<div class="dh-context-group">${h2Buffer}</div>`;
                    }
                    h3Buffer = ""; 
                } 
                else if (currentLevel === 4) {
                    if (h3Buffer) {
                        contextToInject = `<div class="dh-context-group">${h3Buffer}</div>`;
                    }
                }

                h2Buffer += currentNode.outerHTML;
                if (currentLevel !== 2) { 
                     h3Buffer += currentNode.outerHTML;
                }

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
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { type: "rule", order: ruleIndex++ } }
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
                            
                            // Regex to handle standard and smart quotes
                            if (/^["'“]/.test(term)) continue;

                            const wordCount = term.split(/\s+/).length;
                            if (wordCount > 8) continue;
                            if (term.includes("@UUID") || term.includes("@Compendium")) continue;

                            newPagesData.push({
                                name: formatTitle(term),
                                text: { content: `<p>${contentHtml}</p>`, format: 1 },
                                title: { show: false, level: 1 },
                                flags: { "daggerheart-quickrules": { type: "rule", order: ruleIndex++ } }
                            });
                        }
                    }
                }

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

                    if (contextToInject) {
                        const contextHtml = `
                        <details class="dh-context-details">
                            <summary>Show Context</summary>
                            ${contextToInject}
                        </details>
                        `;
                        sectionBuffer = contextHtml + sectionBuffer;
                    }

                    newPagesData.push({
                        name: sectionTitle,
                        text: { content: sectionBuffer, format: 1 },
                        title: { show: false, level: 1 },
                        flags: { "daggerheart-quickrules": { type: "rule", order: ruleIndex++ } }
                    });
                }
            }
        }

        if (mode === 'All') {
            // --- EXISTING ITEM PROCESSING ---
            for (const packName of compendiumList) {
                const pack = game.packs.get(packName);
                if (!pack) continue;
                try {
                    const documents = await pack.getDocuments();
                    for (const item of documents) {
                        const rawDesc = item.system?.description?.value || item.system?.description || "";
                        const desc = rawDesc || (item.type === "beastform" ? "" : "No description available.");
                        let itemName = formatTitle(item.name);
                        
                        // --- BOOK OF... DOMAINS LOGIC ---
                        if (packName === "daggerheart.domains" && item.name.includes("Book of")) {
                            try {
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(rawDesc, "text/html");
                                // Iterate over paragraphs to find "Name: Text" patterns
                                const paragraphs = doc.querySelectorAll('p');
                                
                                for (const p of paragraphs) {
                                    // Get plain text to check pattern
                                    const text = p.textContent.trim();
                                    const match = text.match(/^([^:]+):\s+(.*)$/);
                                    
                                    if (match) {
                                        const subName = match[1].trim();
                                        // Avoid creating pages for extremely long "names" (likely paragraphs with colons later)
                                        if (subName.length > 50) continue; 

                                        const pageTitle = formatTitle(subName);
                                        
                                        // Construct content with link to original
                                        let pageHtml = p.outerHTML;
                                        
                                        pageHtml += `
                                            <div style="margin-top: 20px; text-align: center; border-top: 1px solid #4b0000; padding-top: 10px;">
                                                <p>Source: @UUID[${item.uuid}]{${item.name}}</p>
                                            </div>
                                        `;

                                        newPagesData.push({
                                            name: pageTitle,
                                            text: { content: pageHtml, format: 1 },
                                            title: { show: false, level: 1 },
                                            flags: { "daggerheart-quickrules": { sourcePack: packName } }
                                        });
                                    }
                                }
                            } catch (err) {
                                console.warn(`Error parsing Book of content for ${item.name}`, err);
                            }
                        }

                        // --- BEASTFORMS: PREFIX FEATURES ---
                        if (packName === "daggerheart.beastforms" && item.type === "feature") {
                            itemName = "Beastform Feature: " + itemName;
                        }

                        // Adversary Specific Data
                        let statsHtml = "";
                        let motivesHtml = "";
                        let featuresHtml = "";
                        let beastformHtml = "";

                        // --- BEASTFORMS: MAIN ITEMS ---
                        try {
                            if (packName === "daggerheart.beastforms" && item.type === "beastform") {
                                 // Add Beastform Prefix to Page Name
                                 itemName = "Beastform: " + itemName;

                                 const sys = item.system;
                                 if (!sys) continue;

                                 const tier = sys.tier || "-";
                                 // Capitalize Trait
                                 const rawTrait = sys.mainTrait || "-";
                                 const trait = rawTrait.charAt(0).toUpperCase() + rawTrait.slice(1);
                                 
                                 // 1. Tier and Main Trait
                                 beastformHtml = `
                                    <div class="dh-adversary-stats">
                                        <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp; 
                                        <strong>Trait:</strong> <span class="dh-stat-value">${trait}</span>
                                    </div>
                                 `;

                                 // 2. Examples
                                 if (sys.examples) {
                                     beastformHtml += `<p style="margin-top: 10px; font-style: italic;"><strong>Examples:</strong> ${sys.examples}</p>`;
                                 }

                                 // 3. Advantages
                                 if (sys.advantageOn) {
                                     // Safe extraction of advantages
                                     let advList = "";
                                     try {
                                         if (typeof sys.advantageOn === 'object') {
                                             advList = Object.values(sys.advantageOn).map(o => o.value).join(", ");
                                         }
                                     } catch (err) {
                                         console.warn(`Error processing advantageOn for ${item.name}`, err);
                                     }

                                     if (advList) {
                                          beastformHtml += `<p><strong>Advantage On:</strong> ${advList}</p>`;
                                     }
                                 }
                            }
                        } catch (beastErr) {
                            console.error(`Daggerheart QuickRules | Error processing Beastform ${item.name}:`, beastErr);
                            // Continue to next item without breaking the build
                        }

                        // ADVERSARIES
                        if (packName === "daggerheart.adversaries") {
                            const sys = item.system;
                            const tier = sys.tier ?? "-";
                            const type = sys.type ? String(sys.type).charAt(0).toUpperCase() + String(sys.type).slice(1) : "-";
                            const diff = sys.difficulty ?? "-";
                            const hp = sys.resources?.hitPoints?.max ?? "-";
                            const stress = sys.resources?.stress?.max ?? "-";
                            
                            statsHtml = `
                                <div class="dh-adversary-stats" style="border-bottom: 0; padding-bottom: 0; margin-bottom: 5px;">
                                    <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp; 
                                    <strong>Type:</strong> <span class="dh-stat-value">${type}</span> &nbsp;|&nbsp; 
                                    <strong>Difficulty:</strong> <span class="dh-stat-value">${diff}</span>
                                </div>
                                <div class="dh-adversary-stats">
                                    <strong>HP:</strong> <span class="dh-stat-value">${hp}</span> &nbsp;|&nbsp;
                                    <strong>Stress:</strong> <span class="dh-stat-value">${stress}</span>
                                </div>
                            `;

                            if (sys.motivesAndTactics) {
                                motivesHtml = `
                                    <h3 style="color: #C9A060; margin-top: 20px;">Motives & Tactics</h3>
                                    <div class="dh-motives">${sys.motivesAndTactics}</div>
                                `;
                            }

                            if (item.items && item.items.size > 0) {
                                const features = item.items.filter(i => i.type === "feature");
                                if (features.length > 0) {
                                    featuresHtml = `<h3 style="color: #C9A060; margin-top: 20px;">Features</h3>`;
                                    
                                    for (const feat of features) {
                                        const rawForm = feat.system.featureForm || "passive";
                                        const form = rawForm.charAt(0).toUpperCase() + rawForm.slice(1);
                                        let cleanDesc = (feat.system.description || "").replace(/<\/?p[^>]*>/g, " ");
                                        
                                        featuresHtml += `
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
                        }

                        // ENVIRONMENTS
                        if (packName === "daggerheart.environments") {
                            const sys = item.system;
                            const tier = sys.tier ?? "-";
                            const type = sys.type ? String(sys.type).charAt(0).toUpperCase() + String(sys.type).slice(1) : "-";
                            const diff = sys.difficulty ?? "-";

                            // Header Stats (Similar to Adversary)
                            statsHtml = `
                                <div class="dh-adversary-stats">
                                    <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp; 
                                    <strong>Type:</strong> <span class="dh-stat-value">${type}</span> &nbsp;|&nbsp; 
                                    <strong>Difficulty:</strong> <span class="dh-stat-value">${diff}</span>
                                </div>
                            `;

                            // Impulses (After Description)
                            if (sys.impulses) {
                                motivesHtml = `
                                    <h3 style="color: #C9A060; margin-top: 20px;">Impulses</h3>
                                    <div class="dh-motives">${sys.impulses}</div>
                                `;
                            }

                            // Features (Generic logic, same as Adversary)
                            if (item.items && item.items.size > 0) {
                                const features = item.items.filter(i => i.type === "feature");
                                if (features.length > 0) {
                                    featuresHtml = `<h3 style="color: #C9A060; margin-top: 20px;">Features</h3>`;
                                    
                                    for (const feat of features) {
                                        const rawForm = feat.system.featureForm || "passive";
                                        const form = rawForm.charAt(0).toUpperCase() + rawForm.slice(1);
                                        let cleanDesc = (feat.system.description || "").replace(/<\/?p[^>]*>/g, " ");
                                        
                                        featuresHtml += `
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
                        }

                        const imgHtml = (item.img && item.img !== "icons/svg/mystery-man.svg") 
                            ? `<div class="dh-img-container"><img src="${item.img}" class="dh-item-img" data-tooltip="${item.name}"></div>` 
                            : "";
                        
                        const buttonHtml = `
                            <div style="margin-top: 20px; text-align: center; border-top: 1px solid #4b0000; padding-top: 10px; clear: both;">
                                <p>@UUID[${item.uuid}]{Open ${item.name} Sheet}</p>
                            </div>
                        `;
                        
                        const pageContent = `
                            <h1>${item.name}</h1>
                            ${statsHtml}
                            ${beastformHtml}
                            <div class="item-description">${desc}</div>
                            ${motivesHtml}
                            ${featuresHtml}
                            ${buttonHtml}
                            ${imgHtml}
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

            // --- LOOT TABLES PROCESSING ---
            try {
                const lootTablePackName = "daggerheart-quickrules.loot-and-consumable";
                const lootPack = game.packs.get(lootTablePackName);
                
                if (lootPack) {
                    console.log(`Daggerheart QuickRules | Processing Loot Tables from ${lootTablePackName}...`);
                    const tables = await lootPack.getDocuments();

                    for (const table of tables) {
                        let originalName = table.name;
                        
                        // 1. Remove Prefix "XX - " (e.g. "02 - ")
                        let cleanName = originalName.replace(/^\d+\s*-\s*/, "");

                        // 2. Invert "Part A - Part B" to "Part B - Part A"
                        // Specifically targets patterns like "Common (2d12) - Consumable" -> "Consumable - Common (2d12)"
                        if (cleanName.includes(" - ")) {
                            const parts = cleanName.split(" - ");
                            if (parts.length === 2) {
                                cleanName = `${parts[1]} - ${parts[0]}`;
                            }
                        }
                        
                        // Build HTML Table
                        let tableHtml = `
                            <h1>${cleanName}</h1>
                            <table class="dh-simple-table">
                                <thead>
                                    <tr>
                                        <th style="width: 50px;">Icon</th>
                                        <th style="width: 80px;">Range</th>
                                        <th>Item</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                        // Iterate Table Results
                        const results = table.results.contents.sort((a, b) => a.range[0] - b.range[0]);

                        for (const result of results) {
                            const range = (result.range[0] === result.range[1]) 
                                ? result.range[0] 
                                : `${result.range[0]}-${result.range[1]}`;
                            
                            const icon = result.img || "icons/svg/mystery-man.svg";
                            
                            let label = result.name;
                            
                            // Modern Foundry v13+ approach: Use documentUuid directly
                            if (result.type === "document" || result.type === 1) {
                                // Use the documentUuid property which contains the full UUID path
                                if (result.documentUuid) {
                                    label = `@UUID[${result.documentUuid}]{${result.name}}`;
                                }
                            }
                            
                            tableHtml += `
                                <tr>
                                    <td style="text-align: center;"><img src="${icon}" width="32" height="32" style="border:0;"></td>
                                    <td style="text-align: center; font-weight: bold;">${range}</td>
                                    <td>${label}</td>
                                </tr>
                            `;
                        }

                        tableHtml += `</tbody></table>`;
                        
                        // Add Button to open original table
                        tableHtml += `
                            <div style="margin-top: 20px; text-align: center; border-top: 1px solid #4b0000; padding-top: 10px;">
                                <p>@UUID[${table.uuid}]{Open Original RollTable}</p>
                            </div>
                        `;

                        newPagesData.push({
                            name: cleanName,
                            text: { content: tableHtml, format: 1 },
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { sourcePack: lootTablePackName } }
                        });
                    }
                } else {
                    console.warn(`Daggerheart QuickRules | Loot Table Pack '${lootTablePackName}' not found.`);
                }

            } catch (err) {
                 console.error("Daggerheart QuickRules | Error building Loot Tables:", err);
            }


            // --- GENERATE SUMMARY PAGE: ADVERSARIES BY TYPE ---
            try {
                const advPack = game.packs.get("daggerheart.adversaries");
                if (advPack) {
                    const docs = await advPack.getDocuments();
                    const grouped = {};
                    
                    docs.forEach(d => {
                        let t = d.system.type || "Other";
                        t = t.charAt(0).toUpperCase() + t.slice(1);
                        if (!grouped[t]) grouped[t] = [];
                        grouped[t].push(d);
                    });
                    
                    const sortedKeys = Object.keys(grouped).sort();
                    
                    let summaryHtml = `<h1>Adversaries by Type</h1>`;
                    
                    sortedKeys.forEach(type => {
                        summaryHtml += `<h2>${type}</h2><ul>`;
                        // Sort by Tier (Asc), then Name
                        grouped[type].sort((a, b) => {
                            const tierA = Number(a.system.tier) || 0;
                            const tierB = Number(b.system.tier) || 0;
                            if (tierA !== tierB) return tierA - tierB;
                            return a.name.localeCompare(b.name);
                        });
                        
                        grouped[type].forEach(adv => {
                            const tier = adv.system.tier ?? "?";
                            // Use ID from compendium
                            summaryHtml += `<li>@Compendium[daggerheart.adversaries.${adv.id}]{${adv.name}} - Tier ${tier}</li>`;
                        });
                        summaryHtml += `</ul>`;
                    });
                    
                    newPagesData.push({
                        name: "Adversaries by Type",
                        text: { content: summaryHtml, format: 1 },
                        title: { show: false, level: 1 },
                        flags: { "daggerheart-quickrules": { sourcePack: "daggerheart.adversaries" } }
                    });
                }
            } catch (e) {
                console.error("Daggerheart QuickRules | Error building Adversary List:", e);
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