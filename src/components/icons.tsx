import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Dice5,
  GripVertical,
  Maximize,
  Menu,
  MoreHorizontal,
  Pause,
  Plus,
  Play,
  RotateCw,
  Sparkles,
  SkipBack,
  StepBack,
  StepForward,
  Trophy,
  X,
} from 'lucide-react'

type IconProps = {
  size?: number
  style?: CSSProperties
}

function renderIcon(Icon: LucideIcon, { size = 24, style }: IconProps) {
  return <Icon size={size} style={style} strokeWidth={2} aria-hidden="true" />
}

export function ChevronLeftIcon(props: IconProps) {
  return renderIcon(ChevronLeft, props)
}

export function ChevronRightIcon(props: IconProps) {
  return renderIcon(ChevronRight, props)
}

export function CalendarIcon(props: IconProps) {
  return renderIcon(Calendar, props)
}

export function SoccerBallIcon(props: IconProps) {
  return renderIcon(CircleDot, props)
}

export function TrophyIcon(props: IconProps) {
  return renderIcon(Trophy, props)
}

export function MenuIcon(props: IconProps) {
  return renderIcon(Menu, props)
}

export function DotsHorizontalIcon(props: IconProps) {
  return renderIcon(MoreHorizontal, props)
}

export function PlusIcon(props: IconProps) {
  return renderIcon(Plus, props)
}

export function GripVerticalIcon(props: IconProps) {
  return renderIcon(GripVertical, props)
}

export function CloseIcon(props: IconProps) {
  return renderIcon(X, props)
}

export function SkipBackIcon(props: IconProps) {
  return renderIcon(SkipBack, props)
}

export function StepBackIcon(props: IconProps) {
  return renderIcon(StepBack, props)
}

export function PlayIcon(props: IconProps) {
  return renderIcon(Play, props)
}

export function PauseIcon(props: IconProps) {
  return renderIcon(Pause, props)
}

export function StepForwardIcon(props: IconProps) {
  return renderIcon(StepForward, props)
}

export function OrientationIcon(props: IconProps) {
  return renderIcon(RotateCw, props)
}

export function FullscreenIcon(props: IconProps) {
  return renderIcon(Maximize, props)
}

export function SparklesIcon(props: IconProps) {
  return renderIcon(Sparkles, props)
}

export function DiceIcon(props: IconProps) {
  return renderIcon(Dice5, props)
}

export function WarningIcon(props: IconProps) {
  return renderIcon(AlertTriangle, props)
}
