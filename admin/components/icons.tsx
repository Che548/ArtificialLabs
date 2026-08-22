import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const Icons = {
  grid: (p: IconProps) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Svg>,
  table: (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M8 4v16M16 4v16"/></Svg>,
  chart: (p: IconProps) => <Svg {...p}><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-7"/></Svg>,
  layers: (p: IconProps) => <Svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></Svg>,
  folder: (p: IconProps) => <Svg {...p}><path d="M3 6.5h7l2 2h9v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z"/></Svg>,
  file: (p: IconProps) => <Svg {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></Svg>,
  chevronRight: (p: IconProps) => <Svg {...p}><path d="m9 18 6-6-6-6"/></Svg>,
  chevronDown: (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6"/></Svg>,
  search: (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Svg>,
  command: (p: IconProps) => <Svg {...p}><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5"/></Svg>,
  plus: (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14"/></Svg>,
  minus: (p: IconProps) => <Svg {...p}><path d="M5 12h14"/></Svg>,
  close: (p: IconProps) => <Svg {...p}><path d="m6 6 12 12M18 6 6 18"/></Svg>,
  more: (p: IconProps) => <Svg {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></Svg>,
  download: (p: IconProps) => <Svg {...p}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></Svg>,
  upload: (p: IconProps) => <Svg {...p}><path d="M12 16V4m0 0 4 4m-4-4L8 8M5 20h14"/></Svg>,
  refresh: (p: IconProps) => <Svg {...p}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 9A7 7 0 0 0 6 6l-2 6m2 3a7 7 0 0 0 12 3l2-6"/></Svg>,
  filter: (p: IconProps) => <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4"/></Svg>,
  sliders: (p: IconProps) => <Svg {...p}><path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></Svg>,
  pointer: (p: IconProps) => <Svg {...p}><path d="m5 3 14 9-6 1-3 6-5-16Z"/></Svg>,
  crosshair: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></Svg>,
  zoom: (p: IconProps) => <Svg {...p}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7v7M7 10.5h7"/></Svg>,
  eye: (p: IconProps) => <Svg {...p}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></Svg>,
  check: (p: IconProps) => <Svg {...p}><path d="m5 12 4 4L19 6"/></Svg>,
  info: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></Svg>,
  warning: (p: IconProps) => <Svg {...p}><path d="M10.3 4.2 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></Svg>,
  error: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></Svg>,
  bell: (p: IconProps) => <Svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Svg>,
  settings: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></Svg>,
  inspector: (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16M18 8h.01M18 12h.01M18 16h.01"/></Svg>,
  sidebar: (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M8 4v16"/></Svg>,
  bolt: (p: IconProps) => <Svg {...p}><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></Svg>,
  calendar: (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></Svg>,
  lock: (p: IconProps) => <Svg {...p}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Svg>,
};
