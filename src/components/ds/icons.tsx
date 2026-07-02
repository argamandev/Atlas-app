// One icon language for the whole app (brief §3.6.8): thin, evenly-weighted monochrome
// line icons in currentColor. Sizing/colour come from the consumer (IconButton, nav, etc.).
import * as React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  strokeWidth?: number
}

function Base({
  size = 20,
  strokeWidth = 1.6,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

// ── navigation ──
export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 11.5l9-7.5 9 7.5" />
    <path d="M5 9.8V20h14V9.8" />
  </Base>
)
export const CalendarIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Base>
)
export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </Base>
)
export const ChatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 5h14a1 1 0 011 1v8a1 1 0 01-1 1H9l-4 3v-3H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
  </Base>
)
export const TopicsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 4L7.5 20M16.5 4l-2 16M5 9h14M4.5 15h14" />
  </Base>
)
export const SavedIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 4h10v16l-5-3.6L7 20z" />
  </Base>
)
export const WorkspacesIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Base>
)
export const WatchlistsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 6h14M5 12h14M5 18h9" />
    <circle cx="18.5" cy="18" r="2.2" />
  </Base>
)
export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 7h14M5 12h14M5 17h14" />
    <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" />
  </Base>
)
export const ProfileIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
  </Base>
)
export const HelpIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.5a2.5 2.5 0 113.2 2.4c-.7.3-1.2.9-1.2 1.6v.4" />
    <circle cx="11.5" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
  </Base>
)
export const ReleaseNotesIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
  </Base>
)
export const CollapseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 7l-5 5 5 5M19 7l-5 5 5 5" />
  </Base>
)
export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </Base>
)

// ── chat composer ──
export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)
export const AtIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M15.6 12v1.6a2.4 2.4 0 004.8 0V12a8.4 8.4 0 10-3.2 6.6" />
  </Base>
)
export const SlashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 5L9 19" />
  </Base>
)
export const ArrowUpIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
)

// ── live transcript / headers ──
export const SparkleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5l1.7 5 5 1.7-5 1.7L12 17l-1.7-5-5-1.7 5-1.7z" />
    <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </Base>
)
export const ExpandIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </Base>
)
export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
)
export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9l6 6 6-6" />
  </Base>
)
export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
)
export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Base>
)
export const SyncIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4" />
  </Base>
)
export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a9 9 0 11-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Base>
)
export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
  </Base>
)
export const CopyTextIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
    <path d="M11.8 13H17.2M14.5 13V17.5" />
  </Base>
)
export const QuoteIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 7c-2.2 0-3.5 1.6-3.5 3.6 0 1.9 1.3 3.1 3 3.1.3 1.6-.6 2.6-2 3.3M18 7c-2.2 0-3.5 1.6-3.5 3.6 0 1.9 1.3 3.1 3 3.1.3 1.6-.6 2.6-2 3.3" />
  </Base>
)
export const DotsVerticalIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
  </Base>
)
export const FilterIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16l-6.2 7.6V19l-3.6-1.8v-3.6z" />
  </Base>
)
export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Base>
)
export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l4-1L19 8a2 2 0 00-3-3L5 16l-1 4z" />
    <path d="M14 7l3 3" />
  </Base>
)
export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Base>
)
export const ShareIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="17" cy="6" r="2.2" />
    <circle cx="17" cy="18" r="2.2" />
    <path d="M8 11l7-4M8 13l7 4" />
  </Base>
)
export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 7a2 2 0 012-2h2.8a2 2 0 011.4.6L11 7h7.5a2 2 0 012 2v7a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
  </Base>
)
export const FolderPlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 7a2 2 0 012-2h2.8a2 2 0 011.4.6L11 7h7.5a2 2 0 012 2v7a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
    <path d="M12 10.5v4M10 12.5h4" />
  </Base>
)
export const StarIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.6l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 17.9l-5.2 2.72.99-5.8-4.21-4.1 5.82-.85z" />
  </Base>
)

// ── media player ──
export const PlayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </Base>
)
export const PauseIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none" />
  </Base>
)
export const VolumeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5z" />
    <path d="M15.5 9a4 4 0 010 6" />
  </Base>
)
// circular arrows used by rewind/forward; the "15" label is drawn by the player.
export const RewindCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 5a7 7 0 107 7" />
    <path d="M11 2.5L8 5l3 2.5" />
  </Base>
)
export const ForwardCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 5a7 7 0 11-7 7" />
    <path d="M13 2.5L16 5l-3 2.5" />
  </Base>
)
export const CaptionsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
    <path d="M8 11.5a1.8 1.8 0 00-3 1.3 1.8 1.8 0 003 1.3M16 11.5a1.8 1.8 0 00-3 1.3 1.8 1.8 0 003 1.3" />
  </Base>
)
export const LevelsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 14v4M10 9v9M14 6v12M18 11v7" />
  </Base>
)
