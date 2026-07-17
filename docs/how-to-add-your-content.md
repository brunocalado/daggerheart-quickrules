# How to Add Your Content

All custom content is now managed from a single GM-only screen — no console commands, no special folders.

## Opening Manage Content
1. Open **Game Settings → Configure Settings → Daggerheart: Quick Rules**.
2. Click **Manage Content**.

The screen has two tabs: **My Custom Content** and **SRD Build**.

---

## My Custom Content

Bring your own Items, Actors and Journals into Quick Rules.

### Picking sources
On the left you have a tree with two groups:

* **Compendiums** — any compendium from your modules or your world (the game system's own packs and this module's packs are hidden).
* **World Folders** — your world's Item, Actor and Journal folders.

There are three ways to add content:

* Click the **➕** next to a **compendium** to add the whole thing. Its name shows the **module it comes from**, so you can tell duplicate labels apart.
* Expand a compendium (or a World Folder group) and click a **folder** to add just that folder.
* **Drag** a folder, Item, Actor or Journal straight into the **drop zone** on the right.

Added compendiums and folders are highlighted with a ✓. Your selection is **saved automatically** and is still there the next time you open the screen. Remove a single entry with the ✗ in the list, remove a whole compendium/folder by clicking its ✓ again, or use **Clear all**.

### Committing
Click **Add to Quick Rules**. After you confirm, your custom content is **rebuilt from scratch** from the current selection (the previous custom content is replaced). Journals import **one page per source page** (raw HTML); Items and Actors get a formatted page with their stats and description.

> [!IMPORTANT]
> * **Destructive:** *Add to Quick Rules* replaces **all** existing custom content with your current selection.
> * **Storage:** your content is stored in a world compendium (**Quick Rules - Custom Content**) that is created automatically. It **survives module updates**. Do not rename or hand-edit it — it is overwritten every time you commit.

---

## Permissions (who can see what)

* **World content** (Items, Actors, world-folder Journals) keeps **each entity's own permissions** — a player sees a custom entry only if they could see the original document.
* **Compendium content** is **visible to players by default**. To restrict it, add the **whole compendium** and click its **👁 eye toggle** to switch it to **GM-only**.
* **Compendium folders** and **individual dragged items** are **always visible**. If you need to limit compendium content, control it at the **whole-compendium** level, not per folder or per item.

---

## SRD Build

The **SRD Build** tab rebuilds the bundled Daggerheart SRD reference that Quick Rules reads from. You normally only need this after a system/content update.

* **Rebuild SRD - All** — every core rules page **plus** all compendium entries (classes, ancestries, adversaries, environments, items, etc.). The complete reference.
* **Rebuild SRD - Rules** — the core rules pages only, skipping compendium entries. Faster and lighter.
