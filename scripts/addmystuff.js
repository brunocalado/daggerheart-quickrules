const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DaggerheartAddMyStuff extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        super(options);
        this.activeTab = 'Item'; // 'Item' or 'Actor'
        this.selectedFolders = new Set();
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "daggerheart-add-mystuff",
        tag: "form",
        classes: ["daggerheart-quickrules-window", "dh-add-mystuff"],
        window: {
            title: "Add My Stuff",
            icon: "fas fa-folder-plus",
            resizable: true,
            width: 500,
            height: 600
        },
        position: {
            width: 500,
            height: 600
        },
        actions: {
            switchTab: DaggerheartAddMyStuff._onSwitchTab,
            toggleFolder: DaggerheartAddMyStuff._onToggleFolder,
            buildCustom: DaggerheartAddMyStuff._onBuildCustom
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "modules/daggerheart-quickrules/templates/add-my-stuff.hbs"
        }
    };

    /** @override */
    async _prepareContext(options) {
        // 1. Get all folders of active type
        const allFolders = game.folders.filter(f => f.type === this.activeTab);
        
        // 2. Build Tree Structure for proper hierarchy display
        const folderTree = this._buildFolderTree(allFolders);

        // 3. Flatten tree for the template list
        const foldersData = this._flattenFolderTree(folderTree);

        return {
            activeTab: this.activeTab,
            isItems: this.activeTab === 'Item',
            isActors: this.activeTab === 'Actor',
            folders: foldersData,
            hasSelection: this.selectedFolders.size > 0
        };
    }

    /**
     * Recursive helper to organize folders into a parent-child tree
     */
    _buildFolderTree(allFolders) {
        const tree = { roots: [], children: {} };
        
        allFolders.forEach(f => {
            if (f.folder) {
                // Is a child
                if (!tree.children[f.folder.id]) tree.children[f.folder.id] = [];
                tree.children[f.folder.id].push(f);
            } else {
                // Is a root
                tree.roots.push(f);
            }
        });
        return tree;
    }

    /**
     * Recursive helper to flatten the tree into a display list with depth info
     */
    _flattenFolderTree(tree, parentId = null, depth = 0) {
        let result = [];
        const nodes = parentId ? (tree.children[parentId] || []) : tree.roots;

        // Sort alphabetically at this level
        nodes.sort((a, b) => a.name.localeCompare(b.name));

        for (const folder of nodes) {
            result.push({
                id: folder.id,
                name: folder.name,
                paddingLeft: depth * 20, // 20px indent per level
                checked: this.selectedFolders.has(folder.id),
                count: folder.contents.length,
                hasChildren: !!tree.children[folder.id]
            });

            // Recurse
            if (tree.children[folder.id]) {
                result = result.concat(this._flattenFolderTree(tree, folder.id, depth + 1));
            }
        }
        return result;
    }

    /* --- Actions --- */

    static _onSwitchTab(event, target) {
        this.activeTab = target.dataset.tab;
        // Selection is PERSISTED (we do not clear selectedFolders)
        this.render();
    }

    static _onToggleFolder(event, target) {
        const folderId = target.value;
        if (target.checked) {
            this.selectedFolders.add(folderId);
        } else {
            this.selectedFolders.delete(folderId);
        }
        
        // SCROLL FIX: Do NOT call render(). Update the button state manually via DOM.
        const btn = this.element.querySelector('.dh-build-btn');
        if (btn) {
            btn.disabled = this.selectedFolders.size === 0;
        }
    }

    static async _onBuildCustom(event, target) {
        event.preventDefault();
        
        if (this.selectedFolders.size === 0) {
            ui.notifications.warn("Please select at least one folder.");
            return;
        }

        const btn = target;
        const icon = btn.querySelector('i');
        const originalIconClass = icon.className;
        
        // UI Feedback
        btn.disabled = true;
        icon.className = "fas fa-spinner fa-spin";
        ui.notifications.info("Daggerheart Quick Rules | Building Custom Content...");

        try {
            await this._processBuild();
            ui.notifications.info("Daggerheart Quick Rules | Custom Build Complete!");
            this.close();
        } catch (err) {
            console.error(err);
            ui.notifications.error("Error building custom content. Check console.");
        } finally {
            if (this.element) {
                btn.disabled = false;
                icon.className = originalIconClass;
            }
        }
    }

    /* --- Build Logic --- */

    async _processBuild() {
        const targetFolderName = "📜 Custom Quick Rules";
        const targetJournalName = "📜 My Custom Content";
        
        // 1. Find or Create the FOLDER in the Journal Tab
        let folder = game.folders.find(f => f.name === targetFolderName && f.type === "JournalEntry");
        if (!folder) {
            folder = await Folder.create({
                name: targetFolderName, 
                type: "JournalEntry", 
                color: "#5c0547", // Updated color
                sorting: "a"
            });
        }

        // 2. Find or Create the JOURNAL inside that folder
        let targetJournal = game.journal.find(j => j.name === targetJournalName && j.folder?.id === folder.id);
        
        if (!targetJournal) {
            targetJournal = await JournalEntry.create({
                name: targetJournalName,
                folder: folder.id,
                // Default permission is NONE (0)
                ownership: { default: 0 } 
            });
        }

        // 3. Collect all documents from selected folders
        let documents = [];
        for (const folderId of this.selectedFolders) {
            const docFolder = game.folders.get(folderId);
            if (docFolder) {
                documents.push(...docFolder.contents);
            }
        }

        if (documents.length === 0) {
            ui.notifications.warn("No items or actors found in the selected folders.");
            return;
        }

        // 4. Prepare Page Data
        const newPagesData = [];
        
        // Sort documents by name
        documents.sort((a, b) => a.name.localeCompare(b.name));

        for (const doc of documents) {
            const pageData = await this._createPageData(doc);
            if (pageData) newPagesData.push(pageData);
        }

        // 5. Update Journal
        if (targetJournal.pages.size > 0) {
            const pageIds = targetJournal.pages.map(p => p.id);
            await targetJournal.deleteEmbeddedDocuments("JournalEntryPage", pageIds);
        }

        // Create new pages in batches
        const batchSize = 20;
        for (let i = 0; i < newPagesData.length; i += batchSize) {
            const batch = newPagesData.slice(i, i + batchSize);
            await targetJournal.createEmbeddedDocuments("JournalEntryPage", batch);
        }
        
        // Refresh Quick Rules
        const quickRulesApp = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");
        if (quickRulesApp) {
            quickRulesApp._cachedPages = null; 
            quickRulesApp.render();
        }
    }

    async _createPageData(doc) {
        let title = doc.name;
        let content = "";
        let imgSrc = doc.img;
        
        // Check if image exists and is valid
        const hasImg = imgSrc && imgSrc !== "icons/svg/mystery-man.svg";

        // Get permissions from original document
        const permissions = doc.ownership || { default: 0 };

        // --- 1. HEADER (Title + Type) ---
        let subTitle = "";
        if (doc.type) {
            // Capitalize first letter of type
            subTitle = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
        }
        
        const headerHtml = `
            <div class="dh-custom-header">
                <h1>${doc.name}</h1>
                ${subTitle ? `<div class="dh-custom-meta">${subTitle}</div>` : ""}
            </div>
        `;

        // --- 2. LINK (Right after Header) ---
        const linkHtml = `
            <div style="margin: 10px 0 20px 0; text-align: center; border-bottom: 1px solid #4b0000; padding-bottom: 10px;">
                <p>@UUID[${doc.uuid}]{Open ${doc.documentName}}</p>
            </div>
        `;

        // --- 3. BODY (Stats & Description) ---
        let bodyHtml = "";
        
        // A. ITEMS
        if (doc.documentName === "Item") {
            const desc = doc.system.description?.value || doc.system.description || "";
            if (desc) {
                bodyHtml = `<div class="dh-custom-body">${desc}</div>`;
            } else if (!hasImg) {
                bodyHtml = `<div class="dh-custom-body">No description provided.</div>`;
            }
        } 
        
        // B. ACTORS
        else if (doc.documentName === "Actor") {
            const bio = doc.system.biography?.value || doc.system.details?.biography || "";
            
            // Logic: Hide stats for Adversaries/Environments as requested
            let showStats = true;
            if (doc.type === "adversary" || doc.type === "environment") {
                showStats = false;
            }

            if (showStats) {
                const tier = doc.system.tier ?? "";
                const level = doc.system.level ?? "";
                
                let statsText = "";
                if (doc.type === "character") {
                    statsText = `<strong>Level:</strong> ${level} | <strong>Class:</strong> ${doc.system.class || "-"}`;
                } else {
                    statsText = `<strong>Tier:</strong> ${tier} | <strong>Type:</strong> ${doc.type}`;
                }

                bodyHtml += `
                    <div class="dh-adversary-stats">
                        ${statsText}
                    </div>`;
            }

            bodyHtml += `<div class="item-description">${bio}</div>`;
        }

        // --- 4. IMAGE (Last element) ---
        let imageHtml = "";
        if (hasImg) {
            imageHtml = `
                <div class="dh-img-container" style="margin-top: 30px; text-align: center;">
                    <img src="${imgSrc}" class="dh-item-img" style="max-width: 100%; height: auto; border: none; box-shadow: none;">
                </div>
            `;
        }

        // --- CONSTRUCT CONTENT ---
        content = headerHtml + linkHtml + bodyHtml + imageHtml;

        // --- FLAG DETERMINATION ---
        let category = "Custom";
        
        // Determine category primarily by type
        if (doc.type) {
            if (doc.type === "domainCard") {
                category = "Domain Card";
            } else {
                // Capitalize first letter for all other types (Armor, Weapon, Class, Adversary, etc.)
                category = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
            }
        } 
        // Fallback to "Custom Image" only if there is no type AND no text description but there is an image
        // (Note: Since Item/Actor always have a type, this fallback is rare, but good for safety)
        else if (hasImg && !bodyHtml) {
            category = "Custom Image";
        }

        // Generate Page
        return {
            name: title,
            type: "text", 
            text: { content: content, format: 1 },
            title: { show: false }, 
            ownership: permissions,
            flags: { 
                "daggerheart-quickrules": { 
                    category: category
                } 
            }
        };
    }
}