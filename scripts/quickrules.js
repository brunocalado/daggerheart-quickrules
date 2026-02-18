const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { DaggerheartAddMyContent } from "./addmycontent.js"; // Import Updated

/**
 * Main Quick Rules Application for Daggerheart
 * Uses ApplicationV2 from Foundry V13
 */
export class DaggerheartQuickRules extends HandlebarsApplicationMixin(ApplicationV2) {
    // ... constructor ... 
    constructor(options = {}) {
        super(options);
        this.selectedPageId = null;
        this.searchQuery = "";
        this.scrollPos = 0;
        this.viewMode = 'all';
        this.deepSearch = false;
        this._cachedPages = null;
        this._pageMap = null;
        this._pageMetadata = null;
        this._journalEntry = null;
        this._enrichCache = new Map();
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
            clearSearch: DaggerheartQuickRules._onClearSearch,
            toggleDeepSearch: DaggerheartQuickRules._onToggleDeepSearch
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/screen.hbs"
        }
    };

    /* --- STATIC SHORTCUTS --- */
    static Open() {
        const existing = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (existing) {
            existing.render(true, { focus: true });
        } else {
            new DaggerheartQuickRules().render(true);
        }
    }

    static async Build(mode = 'All') {
        return this.buildSRD(mode);
    }

    static async Reset() {
        await game.user.unsetFlag("daggerheart-quickrules", "favorites");
        await game.user.unsetFlag("daggerheart-quickrules", "filters");
        await game.user.unsetFlag("daggerheart-quickrules", "fontSize");
        await game.user.unsetFlag("daggerheart-quickrules", "theme");
        await game.user.unsetFlag("daggerheart-quickrules", "deepSearch");
        
        const existing = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (existing) existing.close();
        
        ui.notifications.info("Daggerheart Quick Rules | User settings reset.");
    }

    /**
     * OPENS THE ADD MY CONTENT WINDOW
     * (Renamed from AddMyStuff)
     */
    static AddMyContent() {
        new DaggerheartAddMyContent().render(true);
    }

    async navigateToPage(pageId) {
        if (this.selectedPageId === pageId) return;
        this.selectedPageId = pageId;
        await this.renderPageContent(pageId);
    }

    async renderPageContent(pageId) {
        if (!this._cachedPages) await this._buildPageCache();
        const page = this._pageMap?.get(pageId) || this._cachedPages.find(p => p.id === pageId);
        if (!page) return;

        const allButtons = this.element.querySelectorAll('.dh-page-btn');
        allButtons.forEach(btn => btn.classList.remove('active'));
        const activeButton = this.element.querySelector(`.dh-page-btn[data-page-id="${pageId}"]`);
        if (activeButton) activeButton.classList.add('active');

        const isGM = game.user.isGM;
        const userFlags = game.user.flags?.["daggerheart-quickrules"] || {};
        const fontSize = userFlags.fontSize || 14;
        const theme = userFlags.theme || "light";

        const isImage = (page.type === "image");
        let contentBody = "";

        if (isImage) {
            const src = page.src;
            contentBody = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
                <img src="${src}" style="max-width: 100%; max-height: 100%; object-fit: contain; border: none; box-shadow: none;">
            </div>`;
        } else {
            // Use enrichment cache
            let enrichedContent = this._enrichCache.get(pageId);
            if (!enrichedContent) {
                enrichedContent = await foundry.applications.ux.TextEditor.enrichHTML(page.text.content, {
                    secrets: isGM,
                    async: true,
                    relativeTo: page
                });
                this._enrichCache.set(pageId, enrichedContent);
            }
            if (this.deepSearch && this.searchQuery) {
                enrichedContent = this._highlightText(enrichedContent, this.searchQuery);
            }
            contentBody = enrichedContent;
        }

        // Use pre-computed metadata for navigation
        let prevRuleId = null;
        let nextRuleId = null;
        let hasRuleOrder = false;
        const meta = this._pageMetadata?.get(pageId);
        const currentOrder = meta?.order ?? page.getFlag("daggerheart-quickrules", "order");
        if (Number.isInteger(currentOrder)) {
            hasRuleOrder = true;
            if (this._pageMetadata) {
                for (const [id, m] of this._pageMetadata) {
                    if (m.order === currentOrder - 1) prevRuleId = id;
                    if (m.order === currentOrder + 1) nextRuleId = id;
                    if (prevRuleId && nextRuleId) break;
                }
            }
        }
        
        const prevButtonState = prevRuleId ? '' : 'disabled style="opacity: 0.5; cursor: default;"';
        const nextButtonState = nextRuleId ? '' : 'disabled style="opacity: 0.5; cursor: default;"';
        const containerStyle = isImage ? 'style="padding: 0; overflow: hidden; display: flex; background: #000;"' : '';

        const controlsHtml = `
            <div class="dh-content-controls">
                ${hasRuleOrder ? `
                    <button type="button" class="dh-control-btn ${!prevRuleId ? 'disabled' : ''}" ${prevButtonState} 
                            data-action="navigatePage" data-page-id="${prevRuleId || ''}" title="Previous Rule">
                        <i class="fas fa-step-backward"></i> Prev
                    </button>
                    <button type="button" class="dh-control-btn ${!nextRuleId ? 'disabled' : ''}" ${nextButtonState}
                            data-action="navigatePage" data-page-id="${nextRuleId || ''}" title="Next Rule">
                        Next <i class="fas fa-step-forward"></i>
                    </button>
                    <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                ` : ''}
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="down" title="Decrease Text Size">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="dh-font-label">Font Size</span>
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="up" title="Increase Text Size">
                    <i class="fas fa-plus"></i>
                </button>
                <button type="button" class="dh-control-btn" data-action="changeFontSize" data-direction="reset" title="Reset Font Size">
                    <i class="fas fa-redo"></i>
                </button>
                <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                <button type="button" class="dh-control-btn square-btn" 
                        data-action="toggleTheme" 
                        data-tooltip="${theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}">
                    ${theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'}
                </button>
                <div style="width: 1px; height: 20px; background: #999; margin: 0 4px;"></div>
                ${isGM ? `
                <button type="button" class="dh-control-btn" data-action="forceOpen" title="Show to Players (Force Open)">
                    <i class="fas fa-users"></i> Show Players
                </button>
                ` : ''}
                <button type="button" class="dh-control-btn" data-action="sharePage" title="Send to Chat">
                    <i class="fas fa-comment-alt"></i> Send to Chat
                </button>
            </div>
            <div class="journal-entry-page" ${containerStyle}>
                ${contentBody}
            </div>
        `;

        const contentArea = this.element.querySelector('.dh-content-area');
        if (contentArea) {
            contentArea.innerHTML = controlsHtml;
            if (!isImage) {
                contentArea.style.fontSize = `${fontSize}px`;
            } else {
                contentArea.style.fontSize = ''; 
            }
        }
    }

    _highlightText(htmlContent, term) {
        if (!term || !term.trim()) return htmlContent;
        const cleanTerm = term.trim();
        const escapedTerm = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) {
            if (regex.test(walker.currentNode.nodeValue)) {
                textNodes.push(walker.currentNode);
            }
        }
        for (const node of textNodes) {
            if (node.parentNode.tagName === 'SCRIPT' || node.parentNode.tagName === 'STYLE') continue;
            if (node.parentNode.closest('.dh-context-details')) continue;
            const fragment = document.createDocumentFragment();
            const parts = node.nodeValue.split(regex);
            parts.forEach(part => {
                if (regex.test(part)) {
                    const mark = document.createElement('mark');
                    mark.className = 'dh-highlight';
                    mark.textContent = part; 
                    fragment.appendChild(mark);
                } else {
                    fragment.appendChild(document.createTextNode(part));
                }
            });
            node.parentNode.replaceChild(fragment, node);
        }
        return tempDiv.innerHTML;
    }

    async forceNavigateToPage(pageId) {
        console.log(`Daggerheart QuickRules | Attempting to force navigate to page: ${pageId}`);
        if (this.viewMode !== 'all') this.viewMode = 'all';
        if (!this._cachedPages) await this._buildPageCache();
        this.selectedPageId = pageId;
        await this.renderPageContent(pageId);
        // FIX: Replaced bringToTop with bringToFront for AppV2 compatibility
        this.bringToFront(); 
    }

    async _getActiveJournal() {
        if (this._journalEntry) return this._journalEntry;
        const packName = "daggerheart-quickrules.quickrules";
        const pack = game.packs.get(packName);
        if (!pack) return null;
        let journals = await pack.getDocuments({name: "Daggerheart SRD - All"});
        if (journals && journals.length > 0) {
            this._journalEntry = journals[0];
            return this._journalEntry;
        }
        journals = await pack.getDocuments({name: "Daggerheart SRD - Rules"});
        if (journals && journals.length > 0) {
            this._journalEntry = journals[0];
            return this._journalEntry;
        }
        return null;
    }

    async _buildPageCache() {
        const defaultFilters = { rules: true, compendiums: true, custom: true };
        const filters = game.user.getFlag("daggerheart-quickrules", "filters") ?? defaultFilters;
        const isGM = game.user.isGM;
        const hiddenPacks = isGM ? [] : ["daggerheart.adversaries", "daggerheart.environments"];
        const compendiumPacks = [
            "daggerheart.classes", "daggerheart.subclasses", "daggerheart.domains", "daggerheart.ancestries",
            "daggerheart.communities", "daggerheart.beastforms", "daggerheart.weapons", "daggerheart.armors",
            "daggerheart.consumables", "daggerheart.loot", "daggerheart.adversaries", "daggerheart.environments"
        ];
        let pages = [];
        this._pageMap = new Map();
        this._pageMetadata = new Map();

        const journalEntry = await this._getActiveJournal();
        if (journalEntry) {
            for (const p of journalEntry.pages) {
                // Read all flags once per page
                const qrFlags = p.flags?.["daggerheart-quickrules"] || {};
                const type = qrFlags.type;
                const sourcePack = qrFlags.sourcePack;
                const isRule = type === "rule";
                if (isRule && !filters.rules) continue;
                if (sourcePack && !isRule && !filters.compendiums) continue;
                if (!isRule && !sourcePack && !filters.rules) continue;
                if (!isGM && sourcePack && hiddenPacks.includes(sourcePack)) continue;
                pages.push(p);
                this._pageMap.set(p.id, p);
                this._pageMetadata.set(p.id, {
                    type,
                    sourcePack,
                    category: qrFlags.category,
                    order: qrFlags.order,
                    isCompendium: !!(sourcePack && compendiumPacks.includes(sourcePack)),
                    isCustom: !type && !sourcePack,
                    firstLetter: p.name.charAt(0).toUpperCase()
                });
            }
        }
        if (filters.custom) {
            const customFolderName = "📜 Custom Quick Rules";
            const customFolder = game.folders.find(f => f.name === customFolderName && f.type === "JournalEntry");
            if (customFolder) {
                for (const journal of customFolder.contents) {
                    for (const page of journal.pages) {
                        if (page.testUserPermission(game.user, "OBSERVER")) {
                            pages.push(page);
                            this._pageMap.set(page.id, page);
                            const qrFlags = page.flags?.["daggerheart-quickrules"] || {};
                            this._pageMetadata.set(page.id, {
                                type: qrFlags.type,
                                sourcePack: qrFlags.sourcePack,
                                category: qrFlags.category,
                                order: qrFlags.order,
                                isCompendium: false,
                                isCustom: true,
                                firstLetter: page.name.charAt(0).toUpperCase()
                            });
                        }
                    }
                }
            }
        }
        pages.sort((a, b) => a.name.localeCompare(b.name));
        this._cachedPages = pages;
        this._enrichCache.clear();
    }

    async _prepareContext(options) {
        // Batch all user flags in one access
        const userFlags = game.user.flags?.["daggerheart-quickrules"] || {};
        const theme = userFlags.theme || "light";
        const filters = userFlags.filters || { rules: true, compendiums: true, custom: true };
        const favorites = userFlags.favorites || [];
        const fontSize = userFlags.fontSize || 14;
        this.deepSearch = userFlags.deepSearch ?? false;

        if (!this._cachedPages) await this._buildPageCache();
        let displayPages = this._cachedPages;
        if (this.viewMode === 'favorites') {
            const favSet = new Set(favorites);
            displayPages = displayPages.filter(p => favSet.has(p.id));
        }
        const isGM = game.user.isGM;
        const context = {
            theme,
            hasPages: false,
            alphabetizedPages: {},
            activeContent: null,
            activePageName: "",
            viewMode: this.viewMode,
            fontSize,
            filters,
            isGM,
            prevPageId: null,
            nextPageId: null,
            hasRuleOrder: false,
            prevRuleId: null,
            nextRuleId: null,
            searchQuery: this.searchQuery,
            deepSearch: this.deepSearch,
            isImage: false
        };
        if (displayPages.length === 0) return context;
        context.hasPages = true;

        // Use Map and pre-computed metadata for active page
        if (this.selectedPageId) {
            const currentPageObj = this._pageMap?.get(this.selectedPageId);
            if (currentPageObj) {
                const meta = this._pageMetadata.get(this.selectedPageId);
                const currentOrder = meta?.order;
                if (Number.isInteger(currentOrder)) {
                    context.hasRuleOrder = true;
                    // Use metadata for neighbor lookup instead of scanning all pages
                    for (const [id, m] of this._pageMetadata) {
                        if (m.order === currentOrder - 1) context.prevRuleId = id;
                        if (m.order === currentOrder + 1) context.nextRuleId = id;
                        if (context.prevRuleId && context.nextRuleId) break;
                    }
                }
                context.activePageName = currentPageObj.name;
                context.isImage = (currentPageObj.type === "image");
                if (context.isImage) {
                    context.activeContent = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
                        <img src="${currentPageObj.src}" style="max-width: 100%; max-height: 100%; object-fit: contain; border: none; box-shadow: none;">
                    </div>`;
                } else {
                    // Deferred enrichment with cache
                    let contentHTML = this._enrichCache.get(this.selectedPageId);
                    if (!contentHTML) {
                        contentHTML = await foundry.applications.ux.TextEditor.enrichHTML(currentPageObj.text.content, {
                            secrets: isGM, async: true, relativeTo: currentPageObj
                        });
                        this._enrichCache.set(this.selectedPageId, contentHTML);
                    }
                    if (this.deepSearch && this.searchQuery) {
                        contentHTML = this._highlightText(contentHTML, this.searchQuery);
                    }
                    context.activeContent = contentHTML;
                }
            }
        }

        // Build alphabetized groups using pre-computed metadata
        const favSet = new Set(favorites);
        const grouped = {};
        for (const page of displayPages) {
            const meta = this._pageMetadata.get(page.id);
            const letter = meta?.firstLetter || page.name.charAt(0).toUpperCase();
            if (!grouped[letter]) grouped[letter] = [];
            grouped[letter].push({
                id: page.id,
                name: page.name,
                active: this.selectedPageId === page.id,
                isFavorite: favSet.has(page.id),
                isCompendium: meta?.isCompendium || false,
                isCustom: meta?.isCustom || false,
                category: meta?.category || null
            });
        }
        context.alphabetizedPages = grouped;
        return context;
    }

    _onRender(context, options) {
        const html = this.element;
        const searchInput = html.querySelector('.dh-search-input');
        const listContainer = html.querySelector('.dh-page-list');
        if (listContainer && this.scrollPos > 0) listContainer.scrollTop = this.scrollPos;
        if (searchInput) {
            searchInput.value = this.searchQuery;
            if (this.searchQuery) this._filterList(this.searchQuery);
            const debouncedFilter = foundry.utils.debounce((event) => {
                this.searchQuery = event.target.value; 
                this._filterList(this.searchQuery);
            }, 300);
            searchInput.addEventListener('input', debouncedFilter);
            if (this.searchQuery) searchInput.focus(); 
        }
    }

    _filterList(query) {
        const term = query.toLowerCase().trim();
        const html = this.element;
        const items = html.querySelectorAll('.dh-page-item');
        const headers = html.querySelectorAll('.dh-letter-group');
        if (!term) {
            items.forEach(item => item.classList.remove('hidden'));
            headers.forEach(group => group.classList.remove('hidden'));
            return;
        }
        const matches = new Set();
        if (this._cachedPages) {
            const tagRegex = /<[^>]*>/g; 
            const contextRegex = /<details class="dh-context-details">[\s\S]*?<\/details>/gi; 
            for (const page of this._cachedPages) {
                if (page.name.toLowerCase().includes(term)) {
                    matches.add(page.id); continue; 
                }
                if (this.deepSearch && page.text && page.text.content) {
                    let searchableContent = page.text.content.replace(contextRegex, " ");
                    const plainText = searchableContent.replace(tagRegex, ' ').toLowerCase();
                    if (plainText.includes(term)) matches.add(page.id);
                }
            }
        }
        items.forEach(item => {
            const btn = item.querySelector('[data-page-id]');
            const pageId = btn?.dataset.pageId;
            if (pageId && matches.has(pageId)) item.classList.remove('hidden');
            else item.classList.add('hidden');
        });
        headers.forEach(group => {
            const visibleChildren = group.querySelectorAll('.dh-page-item:not(.hidden)');
            if (visibleChildren.length === 0) group.classList.add('hidden');
            else group.classList.remove('hidden');
        });
    }

    static async _onToggleDeepSearch(event, target) {
        event.preventDefault();
        this.deepSearch = !this.deepSearch;
        await game.user.setFlag("daggerheart-quickrules", "deepSearch", this.deepSearch);
        if (this.deepSearch) target.classList.add('active');
        else target.classList.remove('active');
        if (this.searchQuery) {
            this._filterList(this.searchQuery);
            if (this.selectedPageId) this.renderPageContent(this.selectedPageId);
        }
    }

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
        this._cachedPages = null;
        this._pageMap = null;
        this._pageMetadata = null;
        this._enrichCache.clear();
        this.scrollPos = 0;
        this.render({ force: true });
    }

    static async _onChangeFontSize(event, target) {
        event.preventDefault();
        const direction = target.dataset.direction;
        let currentSize = game.user.getFlag("daggerheart-quickrules", "fontSize") || 14; 
        if (direction === "reset") currentSize = 14;
        else if (direction === "up") currentSize += 2;
        else currentSize -= 2;
        if (currentSize < 10) currentSize = 10;
        if (currentSize > 32) currentSize = 32;
        await game.user.setFlag("daggerheart-quickrules", "fontSize", currentSize);
        const contentArea = this.element.querySelector('.dh-content-area');
        if (contentArea) contentArea.style.fontSize = `${currentSize}px`;
        else this.render({ force: true });
    }

    static async _onViewPage(event, target) {
        event.preventDefault();
        const listContainer = this.element.querySelector('.dh-page-list');
        if (listContainer) this.scrollPos = listContainer.scrollTop;
        const pageId = target.dataset.pageId;
        await this.renderPageContent(pageId);
        this.selectedPageId = pageId; 
    }

    static async _onNavigatePage(event, target) {
        event.preventDefault();
        const pageId = target.dataset.pageId;
        if (pageId) {
            await this.renderPageContent(pageId);
            this.selectedPageId = pageId;
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
        if (favorites.includes(pageId)) favorites = favorites.filter(id => id !== pageId);
        else favorites.push(pageId);
        await game.user.setFlag("daggerheart-quickrules", "favorites", favorites);
        if (this.viewMode === 'favorites') {
             const listContainer = this.element.querySelector('.dh-page-list');
             if (listContainer) this.scrollPos = listContainer.scrollTop;
             this.render({ force: true });
        } else {
            const btn = target;
            const icon = btn.querySelector('i');
            if (favorites.includes(pageId)) {
                btn.classList.add('is-fav');
                icon.classList.remove('far');
                icon.classList.add('fas');
                btn.dataset.tooltip = "Remove from Favorites";
            } else {
                btn.classList.remove('is-fav');
                icon.classList.remove('fas');
                icon.classList.add('far');
                btn.dataset.tooltip = "Add to Favorites";
            }
        }
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
        const searchInput = this.element.querySelector('.dh-search-input');
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
        this._filterList("");
    }

    static async _onSharePage(event, target) {
        event.preventDefault();
        if (!this.selectedPageId) return;
        let page = null;
        if (this._pageMap) page = this._pageMap.get(this.selectedPageId);
        else if (this._cachedPages) page = this._cachedPages.find(p => p.id === this.selectedPageId);
        if (!page) {
            const currentJournal = await this._getActiveJournal();
            if (currentJournal && currentJournal.pages.has(this.selectedPageId)) page = currentJournal.pages.get(this.selectedPageId);
        }
        if (!page) return;
        let content = await foundry.applications.ux.TextEditor.enrichHTML(page.text.content, {async: true});
        const title = page.name;
        content = content.replace(/<h([1-6])(.*?)>/gi, (match, level, attributes) => {
            return `<h${level} ${attributes} style="color: #dcb15d !important; border-bottom: 1px solid #5e4b2a; margin-top: 10px;">`;
        });
        content = content.replace('class="dh-item-img"', 'style="display: block; margin: 10px auto; max-width: 150px; border: 1px solid #C9A060; border-radius: 4px; margin-bottom: 8px;"');
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
            "daggerheart.weapons", "daggerheart.consumables", "daggerheart.loot", 
            "daggerheart.adversaries", "daggerheart.environments", "daggerheart.beastforms"
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
                    // NEW: Capture the full list HTML to use for context
                    const fullListHtml = currentNode.outerHTML;

                    // NEW: Context from h2Buffer
                    let listContext = "";
                    if (h2Buffer && h2Buffer.trim().length > 0) {
                        listContext = `
                        <details class="dh-context-details">
                            <summary>Show Context</summary>
                            <div class="dh-context-group">${h2Buffer}</div>
                        </details>
                        `;
                    }

                    for (const li of listItems) {
                        if (li.tagName !== "LI") continue;
                        const text = li.innerText.trim();
                        const match = text.match(/^([^\.\:]+)([:\.])\s+(.+)$/);
                        
                        if (match) {
                            const term = match[1].trim();
                            // const contentHtml = li.innerHTML; // OLD: Used just the LI content
                            
                            // Regex to handle standard and smart quotes
                            if (/^["'“]/.test(term)) continue;

                            const wordCount = term.split(/\s+/).length;
                            if (wordCount > 8) continue;
                            if (term.includes("@UUID") || term.includes("@Compendium")) continue;

                            newPagesData.push({
                                name: formatTitle(term),
                                // CHANGED: Now uses the full list HTML instead of just the item
                                // Prepend context
                                text: { content: listContext + fullListHtml, format: 1 },
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
                        
                        // --- CATEGORY FLAG LOGIC ---
                        let categoryFlag = null;
                        const t = item.type;
                        
                        switch (packName) {
                            case "daggerheart.classes":
                                if (t === "class") categoryFlag = "Class";
                                if (t === "feature") categoryFlag = "Class Feature";
                                if (t === "loot") categoryFlag = "Class Item";
                                break;
                            case "daggerheart.subclasses":
                                if (t === "subclass") categoryFlag = "Subclass";
                                if (t === "feature") categoryFlag = "Subclass Feature";
                                break;
                            case "daggerheart.domains":
                                if (t === "domainCard") categoryFlag = "Domain Card";
                                break;
                            case "daggerheart.ancestries":
                                if (t === "ancestry") categoryFlag = "Ancestry";
                                if (t === "feature") categoryFlag = "Ancestry Feature";
                                break;
                            case "daggerheart.communities":
                                if (t === "community") categoryFlag = "Community";
                                if (t === "feature") categoryFlag = "Community Feature";
                                break;
                            case "daggerheart.weapons":
                                if (t === "weapon") categoryFlag = "Weapon";
                                break;
                            case "daggerheart.armors":
                                if (t === "armor") categoryFlag = "Armor";
                                break;
                            case "daggerheart.consumables":
                                if (t === "consumable") categoryFlag = "Consumable";
                                break;
                            case "daggerheart.loot":
                                if (t === "loot") categoryFlag = "Loot";
                                break;
                            case "daggerheart.beastforms":
                                if (t === "beastform") categoryFlag = "Beastform";
                                if (t === "feature") categoryFlag = "Beastform Feature";
                                break;
                            case "daggerheart.adversaries":
                                if (t === "adversary") categoryFlag = "Adversary";
                                break;
                            case "daggerheart.environments":
                                if (t === "environment") categoryFlag = "Environment";
                                break;
                        }

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
                                            flags: { "daggerheart-quickrules": { sourcePack: packName, category: "Spell" } }
                                        });
                                    }
                                }
                            } catch (err) {
                                console.warn(`Error parsing Book of content for ${item.name}`, err);
                            }
                        }

                        // --- REMOVED: BEASTFORMS: PREFIX FEATURES ---
                        // if (packName === "daggerheart.beastforms" && item.type === "feature") {
                        //     itemName = "Beastform Feature: " + itemName;
                        // }

                        // Adversary Specific Data
                        let statsHtml = "";
                        let motivesHtml = "";
                        let featuresHtml = "";
                        let beastformHtml = "";

                        // --- BEASTFORMS: MAIN ITEMS ---
                        try {
                            if (packName === "daggerheart.beastforms" && item.type === "beastform") {
                                 // --- REMOVED: Add Beastform Prefix to Page Name ---
                                 // itemName = "Beastform: " + itemName;

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

                        // DOMAINS SPECIFIC DATA
                        if (packName === "daggerheart.domains") {
                            const sys = item.system;
                            // Helper para capitalizar
                            const cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "-";
                            
                            const type = cap(sys.type);
                            const domain = cap(sys.domain);
                            const level = sys.level ?? "-";
                            const recallCost = sys.recallCost ?? "-";
                            
                            statsHtml = `
                                <div class="dh-adversary-stats" style="border-bottom: 0; padding-bottom: 0; margin-bottom: 5px;">
                                    <span class="dh-stat-value">${type}</span> &nbsp;-&nbsp; 
                                    <span class="dh-stat-value">${domain}</span> &nbsp;-&nbsp; 
                                    <strong>Level:</strong> <span class="dh-stat-value">${level}</span>
                                </div>
                                <div class="dh-adversary-stats">
                                    <strong>Recall Cost:</strong> <span class="dh-stat-value">${recallCost}</span>
                                </div>
                            `;
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
                        
                        // NEW HEADER LOGIC
                        const headerHtml = `
                            <div class="dh-custom-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dcb15d; margin-bottom: 20px; padding-bottom: 5px;">
                                <h1 style="border-bottom: none; margin: 0; padding: 0; flex: 1; line-height: 1;">${item.name}</h1>
                                <span style="flex: 0 0 auto; margin-left: 10px; font-size: 0.85em; font-family: 'Signika', sans-serif;">
                                    @UUID[${item.uuid}]{Open}
                                </span>
                            </div>
                        `;
                        
                        const pageContent = `
                            ${headerHtml}
                            ${statsHtml}
                            ${beastformHtml}
                            <div class="item-description">${desc}</div>
                            ${motivesHtml}
                            ${featuresHtml}
                            ${imgHtml}
                        `;
                        
                        newPagesData.push({
                            name: itemName,
                            text: { content: pageContent, format: 1 },
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { sourcePack: packName, category: categoryFlag } }
                        });
                    }
                } catch (err) {
                    console.error(`Daggerheart QuickRules | Error processing pack ${packName}:`, err);
                }
            }

            // --- LOOT TABLES PROCESSING ---
            try {
                const lootTablePackName = "daggerheart.rolltables";
                const lootPack = game.packs.get(lootTablePackName);
                
                if (lootPack) {
                    console.log(`Daggerheart QuickRules | Processing Loot Tables from ${lootTablePackName}...`);
                    const tables = await lootPack.getDocuments();

                    for (const table of tables) {
                        let originalName = table.name;
                        let cleanName = "";

                        // --- NEW FILTERING LOGIC ---
                        // Only process tables named specifically "Consumables" or "Loot"
                        if (originalName === "Consumables") {
                            cleanName = "Consumable Table";
                        } else if (originalName === "Loot") {
                            cleanName = "Loot Table";
                        } else {
                            // Skip all other tables (Common/Uncommon/Rare etc.)
                            continue;
                        }
                        
                        // NEW HEADER FOR LOOT TABLES
                        const headerHtml = `
                            <div class="dh-custom-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dcb15d; margin-bottom: 20px; padding-bottom: 5px;">
                                <h1 style="border-bottom: none; margin: 0; padding: 0; flex: 1; line-height: 1;">${cleanName}</h1>
                                <span style="flex: 0 0 auto; margin-left: 10px; font-size: 0.85em; font-family: 'Signika', sans-serif;">
                                    @UUID[${table.uuid}]{Open}
                                </span>
                            </div>
                        `;

                        // Build HTML Table
                        let tableHtml = `
                            ${headerHtml}
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
                        
                        newPagesData.push({
                            name: cleanName,
                            text: { content: tableHtml, format: 1 },
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { type: "rule" } } // Changed to Rule Type
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
                        flags: { "daggerheart-quickrules": { type: "rule" } } // Changed to Rule Type
                    });
                }
            } catch (e) {
                console.error("Daggerheart QuickRules | Error building Adversary List:", e);
            }

            // --- DOMAIN SUMMARY PAGES ---
            try {
                const domainPack = game.packs.get("daggerheart.domains");
                if (domainPack) {
                    console.log("Daggerheart QuickRules | Building Domain Summaries...");
                    const allCards = await domainPack.getDocuments();
                    const domains = ["Arcana", "Blade", "Bone", "Codex", "Grace", "Midnight", "Sage", "Splendor", "Valor"];

                    for (const domainName of domains) {
                        const cards = allCards.filter(i => {
                            const d = i.system.domain || "";
                            return d.toLowerCase() === domainName.toLowerCase() && i.type === "domainCard";
                        });

                        if (cards.length === 0) continue;

                        let summaryHtml = `<h1>${domainName} - All Cards</h1>`;

                        for (let lvl = 1; lvl <= 10; lvl++) {
                            const levelCards = cards.filter(c => Number(c.system.level) === lvl);
                            
                            if (levelCards.length > 0) {
                                summaryHtml += `<h2>Level ${lvl}</h2>`;
                                summaryHtml += `<ul class="dh-sub-list">`;
                                
                                levelCards.sort((a, b) => a.name.localeCompare(b.name));

                                for (const card of levelCards) {
                                    let cleanDesc = (card.system.description?.value || card.system.description || "").replace(/<[^>]+>/g, ' ').trim();
                                    
                                    summaryHtml += `
                                        <li style="margin-bottom: 8px;">
                                            <strong>${card.name}:</strong> ${cleanDesc} 
                                            <span style="white-space: nowrap;">@UUID[${card.uuid}]{Open}</span>
                                        </li>`;
                                }
                                summaryHtml += `</ul>`;
                            }
                        }

                        newPagesData.push({
                            name: `${domainName} - All Cards`,
                            text: { content: summaryHtml, format: 1 },
                            title: { show: false, level: 1 },
                            flags: { "daggerheart-quickrules": { type: "rule" } } // Changed to Rule Type
                        });
                    }
                }
            } catch (err) {
                console.error("Daggerheart QuickRules | Error building Domain Summaries:", err);
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