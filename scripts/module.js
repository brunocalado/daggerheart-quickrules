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

    // 2. Expose Global Commands
    window.QuickRules = {
        Open: () => {
            const module = game.modules.get(MODULE_ID);
            
            // Singleton pattern: render if exists, or create new
            if (!module.api) {
                module.api = new DaggerheartQuickRules();
            }
            
            // Always render (bring to top if already open)
            module.api.render(true);
        },
        
        Build: async (mode = 'standard') => {
             if (!game.user.isGM) {
                 ui.notifications.warn("Only the GM can build the SRD content.");
                 return;
             }
             await DaggerheartQuickRules.buildSRD(mode);
        },

        // Reset function requested
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
    
    console.log("Daggerheart Quick Rules | Commands QuickRules.Open(), QuickRules.Build(mode), and QuickRules.Reset() registered.");
});

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
    // Ensure we are working with a DOM element (handle jQuery if present)
    const html = element instanceof jQuery ? element[0] : element;

    // Create the button
    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.innerHTML = `<i class="fas fa-book-open"></i> Open Guide`; 
    myButton.classList.add("dh-custom-btn"); 
    myButton.style.marginTop = "10px";
    myButton.style.width = "100%";
    
    // Bind action
    myButton.onclick = () => window.QuickRules.Open();

    // Inject using the logic provided
    const fieldset = html.querySelector("fieldset");
    if (fieldset) {
        const newFieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.innerText = "Reference"; // Custom Legend Updated
        newFieldset.appendChild(legend);
        newFieldset.appendChild(myButton);
        fieldset.after(newFieldset);
    } else {
        html.appendChild(myButton);
    }
});

/**
 * Helper to add/remove the button dynamically
 */
function toggleFloatingButton(show) {
    if (show) {
        createFloatingButton();
    } else {
        const btn = document.getElementById(BUTTON_ID);
        if (btn) btn.remove();
    }
}

/**
 * Creates the draggable floating button
 */
function createFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.innerHTML = '<i class="fas fa-question"></i>';
    btn.title = "Open Daggerheart Quick Rules";
    document.body.appendChild(btn);

    // Retrieve saved position
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

    // --- UPDATED Drag Logic with Threshold ---
    // This fixes the issue where sensitive clicks were registering as drags
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    const dragThreshold = 3; // pixels needed to move before it counts as a drag

    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // Get current positions parsed as integers
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

        // Only move if we crossed the threshold
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
        
        // Calculate total distance moved during the click
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // If moved significantly, save position. 
        if (dist > dragThreshold) {
            const pos = { top: btn.style.top, left: btn.style.left };
            localStorage.setItem('dh-quickrules-pos', JSON.stringify(pos));
        } else {
            // If movement was tiny (< 3px), treat it as a CLICK
            window.QuickRules.Open();
        }
    });
}