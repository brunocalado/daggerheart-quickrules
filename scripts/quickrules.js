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
            navigatePage: DaggerheartQuickRules._onNavigatePage, // NEW ACTION
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

        // Logic updated: We generally rely on the main loaded journal now.
        // We ensure we switch to "All Content" mode if the page is not a "Rule" page to ensure visibility.
        
        let currentJournal = await this._getActiveJournal();
        let found = false;
        let targetPage = null;

        if (currentJournal && currentJournal.pages.has(pageId)) {
            found = true;
            targetPage = currentJournal.pages.get(pageId);
        }

        // Fallback: Check Custom Folder (World)
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

        // If found, check if we need to enable "All Content" mode
        if (found && targetPage) {
            const isRule = targetPage.getFlag("daggerheart-quickrules", "type") === "rule";
            const useAll = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;

            // If it's NOT a rule page (it's a compendium item) and we are in "Rules Only" mode, switch to "All"
            if (!isRule && !useAll) {
                console.log("Daggerheart QuickRules | Target page is extended content. Switching to 'All Content' mode.");
                await game.user.setFlag("daggerheart-quickrules", "useAllContent", true);
            }

            this.selectedPageId = pageId;
            this.render({ force: true, focus: true });
        } else {
            console.warn("Daggerheart QuickRules | Page ID sent by GM could not be found.", pageId);
            ui.notifications.warn("The page shared by the GM could not be found (Version mismatch?).");
        }
    }

    /** * Helper to get the currently active journal Document 
     * UPDATED: Prioritizes "Daggerheart SRD - All" to support filtering strategy.
     */
    async _getActiveJournal() {
        const packName = "daggerheart-quickrules.quickrules"; 
        const pack = game.packs.get(packName);
        
        if (!pack) {
            console.error(`Daggerheart QuickRules | Compendium pack ${packName} not found.`);
            return null;
        }

        // 1. Try to find the "All" journal first (Super-set)
        let journals = await pack.getDocuments({name: "Daggerheart SRD - All"});
        if (journals && journals.length > 0) return journals[0];

        // 2. Fallback to "Rules" journal if "All" doesn't exist
        journals = await pack.getDocuments({name: "Daggerheart SRD - Rules"});
        if (journals && journals.length > 0) return journals[0];

        return null;
    }

    /** @override */
    async _prepareContext(options) {
        const useAllContent = game.user.getFlag("daggerheart-quickrules", "useAllContent") ?? true;
        // The display name depends on what we are showing, but the source file is likely "All"
        const targetJournalName = useAllContent ? "All Content" : "Rules Only";

        let pages = [];
        const journalEntry = await this._getActiveJournal();
        
        if (journalEntry) {
            pages = Array.from(journalEntry.pages);
        }

        // --- FILTERING LOGIC ---
        if (!useAllContent) {
            // User wants RULES ONLY. Filter based on the flag created during Build.
            pages = pages.filter(p => p.getFlag("daggerheart-quickrules", "type") === "rule");
        }
        // If useAllContent is true, we simply keep all pages (Rules + Compendium Items)

        // Custom Content (Always appended)
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
            isGM: game.user.isGM,
            prevPageId: null, // For Navigation
            nextPageId: null  // For Navigation
        };

        if (pages.length === 0) {
            return context;
        }

        if (!game.user.isGM) {
            const hiddenPacks = ["daggerheart.adversaries", "daggerheart.environments"];
            pages = pages.filter(p => {
                const sourcePack = p.getFlag("daggerheart-quickrules", "sourcePack");
                // If it's a rule (no sourcePack) or selected page, keep it.
                // If it's from a hidden pack, hide it.
                if (this.selectedPageId === p.id) return true;
                if (sourcePack && hiddenPacks.includes(sourcePack)) return false;
                return true;
            });
        }

        if (this.viewMode === 'favorites') {
            pages = pages.filter(p => favorites.includes(p.id));
        }

        if (pages.length > 0) context.hasPages = true;

        // Sort alphabetically to match the Sidebar List
        pages.sort((a, b) => a.name.localeCompare(b.name));

        // --- Determine Next/Prev Pages ---
        if (this.selectedPageId) {
            const currentIndex = pages.findIndex(p => p.id === this.selectedPageId);
            if (currentIndex !== -1) {
                if (currentIndex > 0) {
                    context.prevPageId = pages[currentIndex - 1].id;
                }
                if (currentIndex < pages.length - 1) {
                    context.nextPageId = pages[currentIndex + 1].id;
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
        
        // Reset selection if we are hiding content that might be selected? 
        // Better to check in render, but for now we keep it simple.
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

    // --- NEW: Navigation Handler ---
    static async _onNavigatePage(event, target) {
        event.preventDefault();
        const pageId = target.dataset.pageId;
        if (pageId) {
            // Keep scroll position of list when navigating via content arrows
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

    static async _onSharePage(event, target) {
        event.preventDefault();
        
        if (!this.selectedPageId) return;

        let page = null;
        // Logic updated for sharing: check active context first
        const currentJournal = await this._getActiveJournal();
        if (currentJournal && currentJournal.pages.has(this.selectedPageId)) {
            page = currentJournal.pages.get(this.selectedPageId);
        }

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

    /**
     * Builds the Split Journal FROM compendium TO compendium
     */
    static async buildSRD(mode = 'All') {
        // --- CONFIGURAÇÃO DE ORIGEM ---
        const sourceCompendiumName = "daggerheart.journals";
        const sourceJournalId = "uNs7ne9VCbbu5dcG";
        
        // --- CONFIGURAÇÃO DE DESTINO (Compêndio do Módulo) ---
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
        console.log(`Daggerheart QuickRules | Source: ${sourceCompendiumName} | Target: ${targetPackName}`);

        // 1. Localizar Fonte
        const sourcePack = game.packs.get(sourceCompendiumName);
        if (!sourcePack) {
            const msg = `Source Compendium '${sourceCompendiumName}' not found.`;
            console.error(msg);
            ui.notifications.error(msg);
            return;
        }

        const sourceJournal = await sourcePack.getDocument(sourceJournalId);
        if (!sourceJournal) {
            const msg = `Source Journal '${sourceJournalId}' not found in '${sourceCompendiumName}'.`;
            console.error(msg);
            ui.notifications.error(msg);
            return;
        }

        // 2. Localizar Pacote de Destino
        const targetPack = game.packs.get(targetPackName);
        if (!targetPack) {
            const msg = `Target Compendium '${targetPackName}' not found.`;
            console.error(msg);
            ui.notifications.error(msg);
            return;
        }

        // 3. Destrancar pacote se necessário
        if (targetPack.locked) {
            console.log("Target pack is locked. Attempting to unlock for build...");
            await targetPack.configure({locked: false});
        }

        // 4. Buscar ou Criar Journal no Destino (COMPENDIUM)
        // Busca usando getDocuments para garantir frescor
        let targetJournal = (await targetPack.getDocuments({name: targetJournalName}))[0];

        if (!targetJournal) {
            console.log(`Creating new Journal '${targetJournalName}' in pack '${targetPackName}'...`);
            targetJournal = await JournalEntry.create({
                name: targetJournalName,
                ownership: { default: 2 } // OBSERVER
            }, {pack: targetPackName}); // CRITICAL: pack option creates it in compendium
        } else {
            console.log(`Updating existing Journal '${targetJournalName}' in pack '${targetPackName}'...`);
        }

        // --- Processamento de Texto (Identico ao anterior) ---
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

        for (const page of pages) {
            if (page.type !== "text") continue;
            const content = page.text.content;
            if (!content) continue;

            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "text/html");
            const body = doc.body;
            const children = Array.from(body.children);

            // --- ACCUMULATORS ---
            let activeH2Accumulator = "";
            let activeH3Accumulator = "";
            
            // UPDATED: ADD FLAG "type: rule" to all base pages
            newPagesData.push({
                name: formatTitle(page.name),
                text: { content: content, format: 1 },
                title: { show: true, level: 1 },
                flags: { "daggerheart-quickrules": { type: "rule" } }
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
                        flags: { "daggerheart-quickrules": { type: "rule" } }
                    });
                }
            }

            for (let i = 0; i < children.length; i++) {
                const currentNode = children[i];
                const currentLevel = getHeaderLevel(currentNode);

                // --- 1. DETERMINE CONTEXT ---
                let contextToInject = "";
                
                if (currentLevel === 3) {
                    if (activeH2Accumulator) {
                        contextToInject = `<div class="dh-context-group">${activeH2Accumulator}</div>`;
                    }
                } else if (currentLevel === 4) {
                    if (activeH2Accumulator) contextToInject += `<div class="dh-context-group">${activeH2Accumulator}</div>`;
                    if (activeH3Accumulator) contextToInject += `<div class="dh-context-group">${activeH3Accumulator}</div>`;
                }

                // --- 2. UPDATE ACCUMULATORS ---
                if (currentLevel === 1) {
                    activeH2Accumulator = "";
                    activeH3Accumulator = "";
                } 
                else if (currentLevel === 2) {
                    activeH2Accumulator = currentNode.outerHTML; 
                    activeH3Accumulator = ""; 
                } 
                else if (currentLevel === 3) {
                    activeH3Accumulator = currentNode.outerHTML; 
                } 
                else if (currentLevel === 0) {
                    if (activeH3Accumulator) {
                        activeH3Accumulator += currentNode.outerHTML;
                    } else if (activeH2Accumulator) {
                        activeH2Accumulator += currentNode.outerHTML;
                    }
                }

                // --- 3. STANDARD PARSING ---
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
                            flags: { "daggerheart-quickrules": { type: "rule" } }
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
                                title: { show: false, level: 1 },
                                flags: { "daggerheart-quickrules": { type: "rule" } }
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
                            <summary>Show Context (Parent Section)</summary>
                            ${contextToInject}
                        </details>
                        `;
                        sectionBuffer = contextHtml + sectionBuffer;
                    }

                    newPagesData.push({
                        name: sectionTitle,
                        text: { content: sectionBuffer, format: 1 },
                        title: { show: false, level: 1 },
                        flags: { "daggerheart-quickrules": { type: "rule" } }
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
                            <h1>${item.name}</h1>
                            <div class="item-description">${desc}</div>
                            ${imgHtml}
                            ${buttonHtml}
                        `;
                        
                        newPagesData.push({
                            name: itemName,
                            text: { content: pageContent, format: 1 },
                            title: { show: false, level: 1 },
                            // Note: Compendium items do NOT get type="rule", so filter works
                            flags: { "daggerheart-quickrules": { sourcePack: packName } }
                        });
                    }
                } catch (err) {
                    console.error(`Daggerheart QuickRules | Error processing pack ${packName}:`, err);
                }
            }
        }

        if (newPagesData.length > 0) {
            console.log(`Daggerheart QuickRules | Clearing old pages...`);
            if (targetJournal.pages.size > 0) {
                const pageIds = targetJournal.pages.map(p => p.id);
                // Operation on Compendium Document
                await targetJournal.deleteEmbeddedDocuments("JournalEntryPage", pageIds);
            }
            
            console.log(`Daggerheart QuickRules | Creating ${newPagesData.length} new pages in Compendium...`);
            const batchSize = 50;
            for (let i = 0; i < newPagesData.length; i += batchSize) {
                const batch = newPagesData.slice(i, i + batchSize);
                // Operation on Compendium Document
                await targetJournal.createEmbeddedDocuments("JournalEntryPage", batch);
            }
            console.log(`Daggerheart QuickRules | Build Complete!`);
            
            // Compendium docs don't always autorefresh UI, but we can try
            targetJournal.sheet.render(true);
        } else {
            console.warn("Daggerheart QuickRules | No content generated.");
        }
    }
}