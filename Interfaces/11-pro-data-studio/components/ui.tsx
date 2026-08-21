"use client";

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Icons } from "./icons";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
  loading?: boolean;
};

export function Button({ variant = "secondary", size = "md", icon, loading, className, children, ...props }: ButtonProps) {
  return (
    <button className={cx("button", `button-${variant}`, `button-${size}`, className)} {...props}>
      {loading ? <span className="spinner" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, active, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return <button aria-label={label} title={label} className={cx("icon-button", active && "is-active", className)} {...props}>{children}</button>;
}

export function ToolButton({ label, shortcut, active, children }: { label: string; shortcut?: string; active?: boolean; children: ReactNode }) {
  return <button className={cx("tool-button", active && "is-active")} aria-pressed={active}><span>{children}</span><b>{label}</b>{shortcut && <kbd>{shortcut}</kbd>}</button>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className={cx("field", error && "field-error")}><span className="field-label">{label}</span>{children}<small>{error ?? hint}</small></label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input", "textarea", className)} {...props} />;
}

export function Select({ children, defaultValue }: { children: ReactNode; defaultValue?: string }) {
  return <select className="input select" defaultValue={defaultValue}>{children}</select>;
}

export function Checkbox({ label, defaultChecked, disabled }: { label: string; defaultChecked?: boolean; disabled?: boolean }) {
  return <label className={cx("choice", disabled && "is-disabled")}><input type="checkbox" aria-label={label || "Select item"} defaultChecked={defaultChecked} disabled={disabled}/><span className="check-box"><Icons.check size={12}/></span><span>{label}</span></label>;
}

export function Radio({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return <label className="choice"><input type="radio" name={name} defaultChecked={defaultChecked}/><span className="radio-box"/><span>{label}</span></label>;
}

export function Switch({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return <label className="switch-row"><button type="button" role="switch" aria-checked={on} className={cx("switch", on && "is-on")} onClick={() => setOn(!on)}><span/></button><span>{label}</span></label>;
}

export function Stepper({ value = 12 }: { value?: number }) {
  const [count, setCount] = useState(value);
  return <div className="stepper"><button aria-label="Decrease" onClick={() => setCount(Math.max(0, count - 1))}><Icons.minus size={12}/></button><output>{count}</output><button aria-label="Increase" onClick={() => setCount(count + 1)}><Icons.plus size={12}/></button></div>;
}

export function Slider({ value = 62 }: { value?: number }) {
  const [current, setCurrent] = useState(value);
  return <label className="slider"><span>Confidence threshold <output>{current}%</output></span><input type="range" min="0" max="100" value={current} onChange={(e) => setCurrent(Number(e.target.value))}/></label>;
}

export function Tabs({ items, initial = 0 }: { items: string[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  return <div className="tabs" role="tablist">{items.map((item, index) => <button key={item} role="tab" aria-selected={active === index} className={cx(active === index && "is-active")} onClick={() => setActive(index)}>{item}</button>)}</div>;
}

export function Segmented({ items, initial = 0 }: { items: string[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  return <div className="segmented">{items.map((item, index) => <button key={item} className={cx(active === index && "is-active")} onClick={() => setActive(index)}>{item}</button>)}</div>;
}

export function Badge({ tone = "neutral", dot, children }: { tone?: "neutral" | "teal" | "success" | "warning" | "danger"; dot?: boolean; children: ReactNode }) {
  return <span className={cx("badge", `badge-${tone}`)}>{dot && <i/>}{children}</span>;
}

export function Progress({ value, tone = "teal" }: { value: number; tone?: "teal" | "success" | "warning" }) {
  return <div className={cx("progress", `progress-${tone}`)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }}/></div>;
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return <span className="tooltip" data-tooltip={text}>{children}</span>;
}

export function PopoverDemo() {
  const [open, setOpen] = useState(false);
  return <div className="popover-demo"><Button icon={<Icons.filter size={14}/>} onClick={() => setOpen(!open)}>Filter</Button>{open && <div className="popover"><strong>Visible series</strong><Checkbox label="Net revenue" defaultChecked/><Checkbox label="Baseline" defaultChecked/><Checkbox label="Forecast"/><div className="popover-footer"><Button size="sm" variant="primary">Apply</Button></div></div>}</div>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title: string; children: ReactNode }) {
  const Icon = tone === "danger" ? Icons.error : tone === "warning" ? Icons.warning : tone === "success" ? Icons.check : Icons.info;
  return <div className={cx("alert", `alert-${tone}`)} role="status"><Icon size={16}/><div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function ToastDemo() {
  const [visible, setVisible] = useState(false);
  return <div className="toast-demo"><Button icon={<Icons.download size={14}/>} onClick={() => setVisible(true)}>Show toast</Button>{visible && <div className="toast" role="status"><span className="toast-icon"><Icons.check size={14}/></span><div><strong>Export ready</strong><small>cohort-report.csv · 42 KB</small></div><IconButton label="Dismiss" onClick={() => setVisible(false)}><Icons.close size={13}/></IconButton></div>}</div>;
}

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return <><Button variant="danger" icon={<Icons.error size={14}/>} onClick={() => setOpen(true)}>Remove dataset</Button>{open && <div className="modal-layer" role="presentation" onMouseDown={() => setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-icon"><Icons.error size={18}/></div><h3 id="modal-title">Remove “North America”?</h3><p>The source will be detached from this analysis. Published reports remain unchanged.</p><div className="modal-actions"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => setOpen(false)}>Remove dataset</Button></div></div></div>}</>;
}

export function Skeleton({ width = "100%", height = 10 }: { width?: string; height?: number }) {
  return <span className="skeleton" style={{ width, height }}/>
}

export function EmptyState() {
  return <div className="empty-state"><span><Icons.chart size={21}/></span><strong>No comparison series</strong><p>Add a dataset or change the current filter to compare results.</p><Button size="sm" icon={<Icons.plus size={13}/>}>Add series</Button></div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function Section({ index, title, description, children }: { index?: string; title: string; description?: string; children: ReactNode }) {
  return <section className="kit-section"><header className="section-header">{index && <span>{index}</span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>{children}</section>;
}

export function Panel({ title, meta, actions, children, className }: { title?: string; meta?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cx("panel", className)}>{(title || actions) && <header className="panel-header"><div>{title && <h3>{title}</h3>}{meta && <span>{meta}</span>}</div>{actions}</header>}<div className="panel-body">{children}</div></section>;
}

export function Metric({ label, value, delta, negative }: { label: string; value: string; delta: string; negative?: boolean }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small className={negative ? "negative" : "positive"}>{delta}</small></div>;
}

export function Pagination() {
  return <nav className="pagination" aria-label="Pagination"><IconButton label="Previous"><Icons.chevronRight className="flip" size={13}/></IconButton><button className="is-active">1</button><button>2</button><button>3</button><span>…</span><button>12</button><IconButton label="Next"><Icons.chevronRight size={13}/></IconButton></nav>;
}

const rows = [
  ["North America", "Paid", "$2,184,900", "34.8%", "+7.2%", "Healthy"],
  ["Europe", "Organic", "$1,476,220", "29.1%", "+3.9%", "Healthy"],
  ["Asia Pacific", "Partner", "$938,420", "18.7%", "−1.4%", "Monitor"],
  ["Latin America", "Paid", "$524,110", "10.2%", "+9.8%", "Healthy"],
  ["Middle East", "Direct", "$318,600", "7.2%", "−4.1%", "At risk"],
];

export function DataGrid({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState(0);
  return <div className={cx("data-grid-wrap", compact && "is-compact")}><table className="data-grid"><thead><tr><th className="select-cell"><Checkbox label=""/></th><th>Segment <span>↑</span></th><th>Channel</th><th className="number">Revenue</th><th className="number">Margin</th><th className="number">Δ period</th><th>Status</th><th/></tr></thead><tbody>{rows.map((row, i) => <tr key={row[0]} className={selected === i ? "is-selected" : ""} onClick={() => setSelected(i)}><td className="select-cell"><Checkbox label="" defaultChecked={i === 0}/></td><td><span className="row-title">{row[0]}</span></td><td>{row[1]}</td><td className="number strong">{row[2]}</td><td className="number">{row[3]}</td><td className={cx("number", row[4].startsWith("−") ? "negative" : "positive")}>{row[4]}</td><td><Badge tone={row[5] === "Healthy" ? "success" : row[5] === "Monitor" ? "warning" : "danger"} dot>{row[5]}</Badge></td><td><IconButton label="Row actions"><Icons.more size={14}/></IconButton></td></tr>)}</tbody></table></div>;
}

export function ListRow({ icon, title, subtitle, active, trailing }: { icon?: ReactNode; title: string; subtitle?: string; active?: boolean; trailing?: ReactNode }) {
  return <button className={cx("list-row", active && "is-active")}><span className="list-row-icon">{icon}</span><span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>{trailing && <i>{trailing}</i>}</button>;
}

export function UserChip() {
  return <button className="user-chip"><span>AK</span><b>Alex Kim</b><Icons.chevronDown size={12}/></button>;
}
