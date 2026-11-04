import type {
  ComponentType,
  ReactNode,
  SVGProps,
} from "react";
import type { ModuleId } from "../shared/modules";

export type IconProps = SVGProps<SVGSVGElement>;

interface IconFrameProps extends IconProps {
  children: ReactNode;
}

function IconFrame({ children, ...props }: IconFrameProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="5" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="m7 11 9.7-5" />
      <path d="m7 13 9.7 5" />
    </IconFrame>
  );
}

export function BracesIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M8 3H7a3 3 0 0 0-3 3v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a3 3 0 0 0 3 3h1" />
      <path d="M16 3h1a3 3 0 0 1 3 3v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a3 3 0 0 1-3 3h-1" />
    </IconFrame>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8" />
      <path d="m16.5 6.5 2 2" />
      <path d="m14.5 8.5 2 2" />
    </IconFrame>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m4 11 16-7-7 16-2.5-6.5L4 11Z" />
      <path d="M10.5 13.5 20 4" />
    </IconFrame>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m12 3 1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8-4.8-1.9 4.8-1.9L12 3Z" />
      <path d="m18.5 15.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </IconFrame>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </IconFrame>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconFrame>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M14 4h6v6" />
      <path d="m20 4-9 9" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </IconFrame>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </IconFrame>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </IconFrame>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconFrame>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconFrame>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m6 7 1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </IconFrame>
  );
}

export function SwapIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 8h13" />
      <path d="m14 5 3 3-3 3" />
      <path d="M20 16H7" />
      <path d="m10 13-3 3 3 3" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m5 12 4 4L19 6" />
    </IconFrame>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m12 3 9 16H3L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </IconFrame>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M8 3v5H3" />
      <path d="M16 3v5h5" />
      <path d="M8 21v-5H3" />
      <path d="M16 21v-5h5" />
    </IconFrame>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m5 7 5 5-5 5" />
      <path d="M12 17h7" />
    </IconFrame>
  );
}

const MODULE_ICONS: Record<ModuleId, ComponentType<IconProps>> = {
  network: NetworkIcon,
  json: BracesIcon,
  jwt: KeyIcon,
  api: SendIcon,
  ai: SparklesIcon,
  page: ScanIcon,
};

export function ModuleIcon({
  id,
  ...props
}: IconProps & { id: ModuleId }) {
  const Icon = MODULE_ICONS[id];
  return <Icon {...props} />;
}
