import { ComparisonBars, MiniSparkline, RetentionHeatmap, RevenueChart, ScatterPlot } from "@/components/charts";
import { Icons } from "@/components/icons";
import { StudioShell } from "@/components/studio-shell";
import { Badge, Button, DataGrid, IconButton, Metric, Panel, Segmented } from "@/components/ui";

export default function DashboardPage() {
  return <StudioShell>
    <div className="workspace-head"><div className="crumbs"><span>Analyses</span><Icons.chevronRight size={11}/><strong>Revenue model</strong></div><div className="workspace-actions"><Segmented items={["Analysis", "Report"]}/><Button size="sm" icon={<Icons.upload size={13}/>}>Share</Button><Button size="sm" variant="primary" icon={<Icons.bolt size={13}/>}>Run model</Button></div></div>
    <div className="workspace-scroll">
      <header className="analysis-heading"><div><span className="eyebrow">FY 2026 · Live model</span><h1>Revenue intelligence</h1><p>Observed revenue, retention, and efficiency across 124,893 transactions.</p></div><div className="date-control"><Icons.calendar size={14}/><span>Mar 1 – Aug 21, 2026</span><Icons.chevronDown size={12}/></div></header>
      <div className="metric-strip"><Metric label="Net revenue" value="$5.44M" delta="↑ 6.8% period"/><div className="metric-spark"><MiniSparkline/></div><Metric label="Gross margin" value="42.8%" delta="↑ 2.4 pts"/><div className="metric-spark"><MiniSparkline/></div><Metric label="Active accounts" value="8,420" delta="↑ 348 accounts"/><div className="metric-spark"><MiniSparkline/></div><Metric label="CAC payback" value="8.2 mo" delta="↓ 0.6 months"/><div className="metric-spark"><MiniSparkline trend="down"/></div></div>
      <div className="analysis-grid"><Panel className="primary-chart"><RevenueChart/></Panel><Panel><ComparisonBars/></Panel><Panel><RetentionHeatmap/></Panel><Panel><ScatterPlot/></Panel></div>
      <Panel title="Segment performance" meta="5 of 18 segments" actions={<div className="panel-actions"><Button size="sm" variant="ghost" icon={<Icons.filter size={13}/>}>Filter</Button><IconButton label="Export table"><Icons.download size={14}/></IconButton><IconButton label="More options"><Icons.more size={14}/></IconButton></div>} className="table-panel"><DataGrid/><footer className="table-status"><span><span className="live-dot"/> Data current as of 14:32 UTC</span><span>124,893 rows · 18 segments</span></footer></Panel>
      <div className="model-note"><Icons.info size={14}/><span>Model confidence is <strong>94.2%</strong>. Two low-volume segments are excluded from forecast.</span><Button size="sm" variant="ghost">Review exclusions</Button></div>
    </div>
  </StudioShell>;
}
