import { DaggerheartQuickRules } from "./quickrules.js";

const MODULE_ID = "daggerheart-quickrules";

Hooks.once("init", () => {
    console.log("Daggerheart Quick Rules | Initializing...");

    // --- Configuração Visual do Botão Flutuante ---
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
            "small": "Small",   // Changed from Smaller
            "normal": "Normal",
            "large": "Large"    // Changed from Larger
        },
        default: "normal",
        onChange: () => {
            // Re-run toggle to update classes
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                toggleFloatingButton(true);
            }
        }
    });

    // --- NOVA SETTING: Efeito de Pulsar ---
    game.settings.register(MODULE_ID, "pulseFloatingButton", {
        name: "Pulse Floating Button",
        hint: "If enabled, the floating button will have a pulsing glow effect.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false, // Default: OFF
        onChange: () => {
             // Re-run toggle to update classes
            if (game.settings.get(MODULE_ID, "showFloatingButton")) {
                toggleFloatingButton(true);
            }
        }
    });

    // --- CORREÇÃO DO ERRO ---
    // Registro da Setting "forceOpenRequest" para sincronizar a abertura da janela
    game.settings.register(MODULE_ID, "forceOpenRequest", {
        name: "Force Open Request",
        scope: "world",     // Sincroniza entre todos os clientes (GM e Players)
        config: false,      // Não aparece no menu de configurações
        default: {},
        type: Object,
        onChange: (value) => {
            // Esta função roda em TODOS os clientes conectados quando o valor muda
            if (!value || !value.pageId) return;

            // Verifica se a solicitação é recente (evita abrir ao dar F5 se a setting ficou salva)
            const timeDiff = Date.now() - (value.time || 0);
            if (timeDiff > 10000) return; // Ignora se a solicitação tem mais de 10 segundos

            // Encontra a janela se já estiver aberta
            const existingApp = Object.values(ui.windows).find(w => w.id === "daggerheart-quickrules");

            if (existingApp) {
                // Se já estiver aberta, foca nela e navega para a página
                existingApp.render(true, { focus: true });
                existingApp.forceNavigateToPage(value.pageId);
            } else {
                // Se estiver fechada, cria uma nova instância, renderiza e navega
                new DaggerheartQuickRules().render(true).then(app => {
                    // Pequeno delay para garantir que o DOM renderizou antes de navegar/scrollar
                    setTimeout(() => app.forceNavigateToPage(value.pageId), 100);
                });
            }
        }
    });

    // Expose the class globally for console access and macros
    window.DaggerheartQuickRules = DaggerheartQuickRules;
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
        const pulse = game.settings.get(MODULE_ID, "pulseFloatingButton");
        
        btn.classList.add(`size-${size}`);
        
        // Add class .pulse if setting is active
        if (pulse) {
            btn.classList.add("pulse");
        }

        document.body.appendChild(btn);

        // Position logic (simples)
        btn.style.left = '20px';
        btn.style.top = '100px';

        // --- Drag & Click Logic ---
        let isDragging = false;
        let hasDragged = false;
        let startX, startY, initialLeft, initialTop;
        const dragThreshold = 3; 

        btn.addEventListener('click', (e) => {
            if (hasDragged) {
                e.preventDefault();
                e.stopPropagation();
                hasDragged = false; 
                return;
            }
            new DaggerheartQuickRules().render(true);
        });

        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            isDragging = true;
            hasDragged = false; 
            
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
            
            if (Math.sqrt(dx*dx + dy*dy) > dragThreshold) {
                hasDragged = true; 
                e.preventDefault(); 
                btn.style.left = `${initialLeft + dx}px`;
                btn.style.top = `${initialTop + dy}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                btn.style.cursor = 'grab';
            }
        });
    }
}