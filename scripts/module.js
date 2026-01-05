import { DaggerheartQuickRules } from "./quickrules.js";

const MODULE_ID = "daggerheart-quickrules";
const BUTTON_ID = "dh-quickrules-trigger";

// Hook into Foundry initialization
Hooks.once("init", () => {
    console.log("Daggerheart Quick Rules | Initializing...");

    // 1. Register Setting to toggle floating button
    game.settings.register(MODULE_ID, "showFloatingButton", {
        name: "Show Floating Button",
        hint: "Display the floating question mark button on the canvas to open the Quick Rules.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: (value) => {
            toggleFloatingButton(value);
        }
    });

    // 2. Register Setting for Floating Button Size
    game.settings.register(MODULE_ID, "floatingButtonSize", {
        name: "Floating Button Size",
        hint: "Adjust the size of the floating question mark button.",
        scope: "client",
        config: true,
        type: String,
        choices: {            
            "small": "Smaller",
            "normal": "Normal",
            "large": "Larger"
        },
        default: "normal",
        onChange: () => {
            // Refresh button if it exists and is enabled
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                const btn = document.getElementById(BUTTON_ID);
                if (btn) btn.remove(); 
                createFloatingButton();
            }
        }
    });

    // 3. COMMUNICATION CHANNEL (Reactive Setting Pattern)
    // This replaces the socket approach. When this setting changes, it runs _handleForceOpenRequest on all clients.
    game.settings.register(MODULE_ID, "forceOpenRequest", {
        scope: "world",
        config: false,
        type: Object,
        default: { pageId: null, time: 0 },
        onChange: _handleForceOpenRequest
    });

    // 4. Expose Global Commands
    window.QuickRules = {
        Open: () => {
            const module = game.modules.get(MODULE_ID);
            
            // Singleton pattern: render if exists, or create new
            if (!module.api) {
                module.api = new DaggerheartQuickRules();
            }
            
            // V13/ApplicationV2 syntax
            module.api.render({ force: true });
        },
        
        // UPDATED: Default mode is now 'All' instead of 'standard'
        Build: async (mode = 'All') => {
             if (!game.user.isGM) {
                 ui.notifications.warn("Only the GM can build the SRD content.");
                 return;
             }
             await DaggerheartQuickRules.buildSRD(mode);
        },

        Reset: () => {
            const btn = document.getElementById(BUTTON_ID);
            if (btn) {
                btn.style.top = '150px';
                btn.style.left = '20px';
            }
            localStorage.removeItem('dh-quickrules-pos');
            ui.notifications.info("Daggerheart Quick Rules | Floating button position reset to default.");
        }
    };
    
    // Console log removido conforme solicitado
});

/**
 * Handles the incoming request to open the Quick Rules (triggered by setting change)
 * This runs on EVERY client when the setting updates.
 */
function _handleForceOpenRequest(value) {
    // Basic validation
    if (!value || !value.pageId) return;

    // Ignore if I am the GM (I likely triggered it myself, or I don't need to be forced)
    if (game.user.isGM) return;

    console.log("Daggerheart Quick Rules | Received Force Open Request:", value);

    const module = game.modules.get(MODULE_ID);
            
    // 1. Ensure API instance exists
    if (!module.api) {
        module.api = new DaggerheartQuickRules();
    }
    
    // 2. Call Intelligent Navigation
    // This method sets selectedPageId AND switches contexts if needed
    module.api.forceNavigateToPage(value.pageId);

    // Optional: If minimized, maximize it
    if (module.api.minimized) module.api.maximize();

    ui.notifications.info("GM updated Quick Rules view.");
}

// Create Floating Button on Ready (if setting is enabled)
Hooks.once('ready', async () => {
    if (game.settings.get(MODULE_ID, "showFloatingButton")) {
        createFloatingButton();
    }

    // Check and create Custom Quick Rules folder if GM
    if (game.user.isGM) {
        const customFolderName = "📜 Custom Quick Rules";
        const existingFolder = game.folders.find(f => f.name === customFolderName && f.type === "JournalEntry");
        
        if (!existingFolder) {
            console.log(`Daggerheart Quick Rules | Creating custom content folder: ${customFolderName}`);
            await Folder.create({
                name: customFolderName,
                type: "JournalEntry",
                color: "#5c0547" // Matches the module theme
            });
        }
    }
});

// Hook to add button to Daggerheart Menu (sidebar)
Hooks.on("renderDaggerheartMenu", (app, element, data) => {
    const html = element instanceof jQuery ? element[0] : element;

    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-book-open"></i> Open Quick Rules`; 
    myButton.classList.add("dh-custom-btn"); 
    myButton.style.marginTop = "10px";
    myButton.style.width = "100%";
    
    myButton.onclick = () => window.QuickRules.Open();

    const fieldset = html.querySelector("fieldset");
    if (fieldset) {
        const newFieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.innerText = "Quick Rules"; 
        newFieldset.appendChild(legend);
        newFieldset.appendChild(myButton);
        fieldset.after(newFieldset);
    } else {
        html.appendChild(myButton);
    }
});

function toggleFloatingButton(show) {
    if (show) {
        createFloatingButton();
    } else {
        const btn = document.getElementById(BUTTON_ID);
        if (btn) btn.remove();
    }
}

function createFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.innerHTML = '<i class="fas fa-question"></i>';
    btn.title = "Open Daggerheart Quick Rules";
    
    const size = game.settings.get(MODULE_ID, "floatingButtonSize") || "normal";
    btn.classList.add(`size-${size}`);

    document.body.appendChild(btn);

    const savedPos = localStorage.getItem('dh-quickrules-pos');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            btn.style.top = pos.top;
            btn.style.left = pos.left;
        } catch (e) {
            console.error("Error loading Quick Rules button position", e);
            btn.style.top = '150px';
            btn.style.left = '20px';
        }
    } else {
        btn.style.top = '150px';
        btn.style.left = '20px';
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    const dragThreshold = 3; 

    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = btn.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        
        btn.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > dragThreshold) {
            e.preventDefault(); 
            btn.style.left = `${initialLeft + dx}px`;
            btn.style.top = `${initialTop + dy}px`;
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        btn.style.cursor = 'grab';
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > dragThreshold) {
            const pos = { top: btn.style.top, left: btn.style.left };
            localStorage.setItem('dh-quickrules-pos', JSON.stringify(pos));
        } else {
            window.QuickRules.Open();
        }
    });
}