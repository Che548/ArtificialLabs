"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";
import { Badge, Field, IconButton, Input, ListRow, Segmented, Select, Slider, Switch, ToolButton, UserChip } from "./ui";

export function StudioShell({ children, title = "Revenue model", inspector = true }: { children: ReactNode; title?: string; inspector?: boolean }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(inspector);
  return <div className="studio-shell">
    <header className="command-bar">
      <div className="command-leading"><IconButton label="Toggle navigator" onClick={() => setNavOpen(!navOpen)} active={navOpen}><Icons.sidebar/></IconButton><Link href="/" className="product-mark" aria-label="Vector home"><span><i/><i/><i/></span></Link><div className="document-title"><strong>{title}</strong><small>Saved just now</small></div></div>
      <div className="command-tools"><ToolButton label="Pointer" shortcut="V" active><Icons.pointer/></ToolButton><ToolButton label="Inspect" shortcut="I"><Icons.crosshair/></ToolButton><ToolButton label="Zoom" shortcut="Z"><Icons.zoom/></ToolButton><span className="tool-divider"/><ToolButton label="Table"><Icons.table/></ToolButton><ToolButton label="Chart"><Icons.chart/></ToolButton><ToolButton label="Filter"><Icons.filter/></ToolButton></div>
      <div className="command-actions"><div className="sync-state"><span/> Synced</div><IconButton label="Notifications"><Icons.bell/></IconButton><IconButton label="Toggle inspector" onClick={() => setInspectOpen(!inspectOpen)} active={inspectOpen}><Icons.inspector/></IconButton><UserChip/></div>
    </header>
    <div className={`studio-frame ${inspectOpen ? "has-inspector" : ""}`}>
      <aside className={`navigator ${navOpen ? "is-open" : ""}`}>
        <div className="navigator-search"><Icons.search size={13}/><input aria-label="Search datasets" placeholder="Search"/><kbd>⌘F</kbd></div>
        <div className="navigator-section"><header><span>Workspace</span><IconButton label="Add item"><Icons.plus size={12}/></IconButton></header><ListRow icon={<Icons.grid size={14}/>} title="Overview"/><ListRow icon={<Icons.chart size={14}/>} title="Revenue model" active={pathname === "/"} trailing={<span className="live-dot"/>}/><ListRow icon={<Icons.table size={14}/>} title="Transactions"/><ListRow icon={<Icons.layers size={14}/>} title="Cohorts"/></div>
        <div className="navigator-section"><header><span>Data sources</span><IconButton label="Add source"><Icons.plus size={12}/></IconButton></header><ListRow icon={<Icons.folder size={14}/>} title="Warehouse" subtitle="Updated 2m ago"/><ListRow icon={<Icons.file size={14}/>} title="Stripe ledger" subtitle="124,893 rows"/><ListRow icon={<Icons.file size={14}/>} title="CRM accounts" subtitle="8,420 rows"/></div>
        <div className="navigator-bottom"><Link href="/kit" className={pathname === "/kit" ? "is-active" : ""}><Icons.grid size={14}/> UI kit</Link><button><Icons.settings size={14}/> Workspace settings</button></div>
      </aside>
      <main className="studio-canvas">{children}</main>
      {inspectOpen && <aside className="inspector-panel"><div className="inspector-title"><div><strong>Inspector</strong><small>Revenue chart · Group 3</small></div><IconButton label="Close inspector" onClick={() => setInspectOpen(false)}><Icons.close size={13}/></IconButton></div><Segmented items={["Data", "Style", "Axis"]}/><div className="inspector-section"><h4>Series</h4><label className="series-field"><span className="series-color"/><div><strong>Net revenue</strong><small>sum(revenue_net)</small></div><Icons.chevronDown size={12}/></label><label className="series-field"><span className="series-color gray"/><div><strong>Baseline</strong><small>moving_avg(28)</small></div><Icons.chevronDown size={12}/></label></div><div className="inspector-section"><h4>Appearance</h4><Field label="Stroke width"><div className="inline-control"><Input defaultValue="2"/><Select defaultValue="px"><option>px</option><option>pt</option></Select></div></Field><Slider value={76}/><Switch label="Smooth line" defaultOn/><Switch label="Show markers"/></div><div className="inspector-section"><h4>Data quality</h4><div className="quality-row"><span>Coverage</span><strong>99.4%</strong></div><div className="quality-row"><span>Null values</span><Badge tone="success">0.06%</Badge></div><div className="quality-row"><span>Last sync</span><strong>2 min</strong></div></div></aside>}
      {navOpen && <button className="mobile-scrim" aria-label="Close navigator" onClick={() => setNavOpen(false)}/>} 
    </div>
  </div>;
}
