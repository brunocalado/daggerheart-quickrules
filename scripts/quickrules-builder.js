/**
 * Daggerheart Quick Rules - SRD Builder
 * Parses source journals and compendiums to construct the Quick Rules data.
 */

const PROTECTED_ACRONYMS = ["NPC", "NPCS", "GM", "GMS", "HP", "AP", "DC"];
const MINOR_WORDS = ["is", "your", "a", "the", "on", "in", "to", "of", "an", "and", "with"];
const COMPENDIUM_LIST = [
    "daggerheart.classes", "daggerheart.subclasses", "daggerheart.domains",
    "daggerheart.ancestries", "daggerheart.communities", "daggerheart.armors",
    "daggerheart.weapons", "daggerheart.consumables", "daggerheart.loot",
    "daggerheart.adversaries", "daggerheart.environments", "daggerheart.beastforms"
];

function formatTitle(str) {
    if (!str) return "Untitled";
    let workingStr = str.trim();
    const linkMatch = workingStr.match(/\{([^}]+)\}/);
    if (linkMatch) workingStr = linkMatch[1];
    workingStr = workingStr.replace(/\s+/g, ' ').trim();

    return workingStr.split(' ').map((word, index) => {
        const cleanWord = word.replace(/[^\w\s]/gi, '');
        const lowerWord = cleanWord.toLowerCase();
        if (PROTECTED_ACRONYMS.includes(cleanWord.toUpperCase())) {
            if (word.length > cleanWord.length) return cleanWord.toUpperCase() + word.slice(cleanWord.length);
            return word.toUpperCase();
        }
        if (index > 0 && MINOR_WORDS.includes(lowerWord)) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

function getHeaderLevel(node) {
    if (!node.tagName) return 0;
    const match = node.tagName.match(/^H([1-6])$/);
    return match ? parseInt(match[1]) : 0;
}

/**
 * Builds the Quick Rules SRD compendium from source data.
 * @param {string} mode - 'All' for full build (rules + compendiums) or 'Rules' for rules only.
 */
export async function buildSRD(mode = 'All') {
    const sourceCompendiumName = "daggerheart.journals";
    const sourceJournalId = "uNs7ne9VCbbu5dcG";
    const targetPackName = "daggerheart-quickrules.quickrules";
    const targetJournalName = (mode === 'All') ? "Daggerheart SRD - All" : "Daggerheart SRD - Rules";

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
                const fullListHtml = currentNode.outerHTML;

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

                        // Regex to handle standard and smart quotes
                        if (/^["'"\u201C]/.test(term)) continue;

                        const wordCount = term.split(/\s+/).length;
                        if (wordCount > 8) continue;
                        if (term.includes("@UUID") || term.includes("@Compendium")) continue;

                        newPagesData.push({
                            name: formatTitle(term),
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
        for (const packName of COMPENDIUM_LIST) {
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

                    // Adversary Specific Data
                    let statsHtml = "";
                    let motivesHtml = "";
                    let featuresHtml = "";
                    let beastformHtml = "";

                    // --- BEASTFORMS: MAIN ITEMS ---
                    try {
                        if (packName === "daggerheart.beastforms" && item.type === "beastform") {
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
                    }

                    // DOMAINS SPECIFIC DATA
                    if (packName === "daggerheart.domains") {
                        const sys = item.system;
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

                        statsHtml = `
                            <div class="dh-adversary-stats">
                                <strong>Tier:</strong> <span class="dh-stat-value">${tier}</span> &nbsp;|&nbsp;
                                <strong>Type:</strong> <span class="dh-stat-value">${type}</span> &nbsp;|&nbsp;
                                <strong>Difficulty:</strong> <span class="dh-stat-value">${diff}</span>
                            </div>
                        `;

                        if (sys.impulses) {
                            motivesHtml = `
                                <h3 style="color: #C9A060; margin-top: 20px;">Impulses</h3>
                                <div class="dh-motives">${sys.impulses}</div>
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

                    const imgHtml = (item.img && item.img !== "icons/svg/mystery-man.svg")
                        ? `<div class="dh-img-container"><img src="${item.img}" class="dh-item-img" data-tooltip="${item.name}"></div>`
                        : "";

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

                    if (originalName === "Consumables") {
                        cleanName = "Consumable Table";
                    } else if (originalName === "Loot") {
                        cleanName = "Loot Table";
                    } else {
                        continue;
                    }

                    const headerHtml = `
                        <div class="dh-custom-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dcb15d; margin-bottom: 20px; padding-bottom: 5px;">
                            <h1 style="border-bottom: none; margin: 0; padding: 0; flex: 1; line-height: 1;">${cleanName}</h1>
                            <span style="flex: 0 0 auto; margin-left: 10px; font-size: 0.85em; font-family: 'Signika', sans-serif;">
                                @UUID[${table.uuid}]{Open}
                            </span>
                        </div>
                    `;

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

                    const results = table.results.contents.sort((a, b) => a.range[0] - b.range[0]);

                    for (const result of results) {
                        const range = (result.range[0] === result.range[1])
                            ? result.range[0]
                            : `${result.range[0]}-${result.range[1]}`;

                        const icon = result.img || "icons/svg/mystery-man.svg";

                        let label = result.name;

                        if (result.type === "document" || result.type === 1) {
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
                        flags: { "daggerheart-quickrules": { type: "rule" } }
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
                    grouped[type].sort((a, b) => {
                        const tierA = Number(a.system.tier) || 0;
                        const tierB = Number(b.system.tier) || 0;
                        if (tierA !== tierB) return tierA - tierB;
                        return a.name.localeCompare(b.name);
                    });

                    grouped[type].forEach(adv => {
                        const tier = adv.system.tier ?? "?";
                        summaryHtml += `<li>@Compendium[daggerheart.adversaries.${adv.id}]{${adv.name}} - Tier ${tier}</li>`;
                    });
                    summaryHtml += `</ul>`;
                });

                newPagesData.push({
                    name: "Adversaries by Type",
                    text: { content: summaryHtml, format: 1 },
                    title: { show: false, level: 1 },
                    flags: { "daggerheart-quickrules": { type: "rule" } }
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
                        flags: { "daggerheart-quickrules": { type: "rule" } }
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