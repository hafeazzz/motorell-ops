# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~33,036 words - fits in a single context window. You may not need a graph.

## Summary
- 154 nodes · 240 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 61,416 input · 0 output

## Community Hubs (Navigation)
- UI Components & Effects
- Feature Tabs & Modals
- Build Config & Dev Deps
- App State & Push Notif
- App Architecture & Bootstrap
- Runtime Dependencies
- PWA Manifest
- Storage Layer & Entry
- Brand Identity & Icon
- Reports & Excel Export
- Error Boundary & PDF Page
- Attendance Tab
- Handbook PDF Viewer
- Welcome & Greeting
- Click Sound Effects
- Grammarly Neutralization
- PWA Home-screen Setup

## God Nodes (most connected - your core abstractions)
1. `today()` - 13 edges
2. `uid()` - 9 edges
3. `MotorellOps()` - 9 edges
4. `HomeTab()` - 9 edges
5. `TimTab()` - 9 edges
6. `inMonth()` - 8 edges
7. `month()` - 7 edges
8. `LaporanTab()` - 7 edges
9. `rp()` - 6 edges
10. `compress()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `UnitDetailModal()` --references--> `react`  [EXTRACTED]
  src/App.jsx → package.json
- `main.jsx Module Script` --references--> `src/main.jsx React Entry Point`  [INFERRED]
  index.html → README.md
- `index.html Main Page` --references--> `Tailwind CSS via CDN`  [EXTRACTED]
  README.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Bootstrap Flow (HTML to React to Storage)** — index_root, index_main_jsx, readme_app_jsx, readme_storage_js [INFERRED 0.75]

## Communities (19 total, 4 thin omitted)

### Community 0 - "UI Components & Effects"
Cohesion: 0.07
Nodes (6): CATS, CONFETTI_COLORS, HANDBOOK_TOC, MCAT_COLOR, MEDIA_CATS, PAL

### Community 1 - "Feature Tabs & Modals"
Cohesion: 0.17
Nodes (25): AddUnitModal(), ChatPage(), compress(), dayLabel(), expByUnit(), ExpenseModal(), HomeTab(), inMonth() (+17 more)

### Community 2 - "Build Config & Dev Deps"
Cohesion: 0.14
Nodes (13): devDependencies, vite, @vitejs/plugin-react, name, private, scripts, build, dev (+5 more)

### Community 3 - "App State & Push Notif"
Cohesion: 0.21
Nodes (13): enablePush(), fixSaleBonus(), loadState(), MotorellOps(), normalize(), notifOK(), notify(), ProfileModal() (+5 more)

### Community 4 - "App Architecture & Bootstrap"
Cohesion: 0.20
Nodes (12): main.jsx Module Script, React Root Mount Element (#root), Tailwind CSS via CDN, src/App.jsx Application Code, index.html Main Page, localStorage Persistence, src/main.jsx React Entry Point, Motorell Ops Project (+4 more)

### Community 5 - "Runtime Dependencies"
Cohesion: 0.18
Nodes (11): lucide-react, dependencies, lucide-react, react, react-dom, recharts, @supabase/supabase-js, react (+3 more)

### Community 6 - "PWA Manifest"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 7 - "Storage Layer & Entry"
Cohesion: 0.25
Nodes (3): App(), storage, supabase

### Community 8 - "Brand Identity & Icon"
Cohesion: 0.47
Nodes (6): Motorell Brand Identity, Motorell App Icon, Black-and-White Monochrome Style, Stylized 'M' Monogram, Motorcycle / Automotive Branding, Speed / Motion Motif

### Community 9 - "Reports & Excel Export"
Cohesion: 0.33
Nodes (6): ensureXLSX(), LaporanTab(), monthLabel(), pad2(), prunePhotos(), shiftMonth()

### Community 11 - "Attendance Tab"
Cohesion: 0.67
Nodes (3): AbsenTab(), CountVal(), now()

### Community 12 - "Handbook PDF Viewer"
Cohesion: 0.67
Nodes (3): clampInt(), ensurePdfJs(), HandbookPage()

### Community 13 - "Welcome & Greeting"
Cohesion: 0.67
Nodes (3): greeting(), WelcomeOverlay(), wibParts()

## Knowledge Gaps
- **32 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UnitDetailModal()` connect `Feature Tabs & Modals` to `UI Components & Effects`, `Runtime Dependencies`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `react` connect `Runtime Dependencies` to `Feature Tabs & Modals`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Build Config & Dev Deps`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Components & Effects` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Build Config & Dev Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._