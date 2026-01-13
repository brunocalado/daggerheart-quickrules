import { DaggerheartQuickRules } from "./quickrules.js";

const MODULE_ID = "daggerheart-quickrules";

Hooks.once("init", () => {
    console.log("Daggerheart Quick Rules | Initializing...");

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
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                const btn = document.getElementById("dh-quickrules-trigger");
                if (btn) {
                    const size = game.settings.get(MODULE_ID, "floatingButtonSize");
                    btn.className = `size-${size}`;
                }
            }
        }
    });

    // Expose the class globally for console access and macros
    window.DaggerheartQuickRules = DaggerheartQuickRules;
    // Shortcut for your specific test case:
    window.QuickRules = DaggerheartQuickRules;
});

Hooks.once("ready", () => {
    if (game.settings.get(MODULE_ID, "showFloatingButton")) {
        toggleFloatingButton(true);
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
    
    myButton.onclick = () => {
        if (window.QuickRules) {
            window.QuickRules.Open();
        } else {
            ui.notifications.error("Quick Rules module not fully initialized.");
        }
    };

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
    const existingBtn = document.getElementById("dh-quickrules-trigger");
    if (existingBtn) existingBtn.remove();

    if (show) {
        const btn = document.createElement("div");
        btn.id = "dh-quickrules-trigger";
        btn.innerHTML = '<i class="fas fa-question"></i>';
        btn.title = "Open Daggerheart Quick Rules";
        
        const size = game.settings.get(MODULE_ID, "floatingButtonSize");
        btn.classList.add(`size-${size}`);

        document.body.appendChild(btn);

        // Position it (persist position logic omitted for brevity, add if needed)
        btn.style.left = '20px';
        btn.style.top = '100px';

        // --- Drag & Click Logic Variables ---
        let isDragging = false;
        let hasDragged = false; // [UPDATED] Flag to track actual movement
        let startX, startY, initialLeft, initialTop;
        const dragThreshold = 3; 

        // [UPDATED] Click Listener: Checks hasDragged before opening
        btn.addEventListener('click', (e) => {
            if (hasDragged) {
                // If it was a drag, consume the click and reset the flag
                e.preventDefault();
                e.stopPropagation();
                hasDragged = false; 
                return;
            }
            new DaggerheartQuickRules().render(true);
        });

        // Mouse Down
        btn.addEventListener('mousedown', (e) => {
            // Only allow dragging with left mouse button (button 0)
            if (e.button !== 0) return;

            isDragging = true;
            hasDragged = false; // [UPDATED] Reset flag on new interaction
            
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = btn.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            btn.style.cursor = 'grabbing';
        });

        // Mouse Move (Window)
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Check threshold
            if (Math.sqrt(dx*dx + dy*dy) > dragThreshold) {
                hasDragged = true; // [UPDATED] Movement exceeded threshold, mark as drag
                e.preventDefault(); 
                btn.style.left = `${initialLeft + dx}px`;
                btn.style.top = `${initialTop + dy}px`;
            }
        });

        // Mouse Up (Window)
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                btn.style.cursor = 'grab';
                // Note: We don't reset hasDragged here; we need it for the subsequent 'click' event
            }
        });
    }
}