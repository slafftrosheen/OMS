// Centralized icon registry — every icon used across OMS resolves here.
// Uses lucide-svelte subpath imports so Vite tree-shakes unused icons.
//
// When you need an icon not in the list, add its kebab-case name to
// IconName and import it in the `icons` record below. Keep the list
// alphabetized for merge-friendliness.

import Activity from 'lucide-svelte/icons/activity';
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
import ArrowLeft from 'lucide-svelte/icons/arrow-left';
import ArrowRight from 'lucide-svelte/icons/arrow-right';
import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';
import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
import BadgeCheck from 'lucide-svelte/icons/badge-check';
import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
import Beaker from 'lucide-svelte/icons/beaker';
import Bell from 'lucide-svelte/icons/bell';
import BellOff from 'lucide-svelte/icons/bell-off';
import BellRing from 'lucide-svelte/icons/bell-ring';
import Book from 'lucide-svelte/icons/book';
import BookOpen from 'lucide-svelte/icons/book-open';
import BookmarkPlus from 'lucide-svelte/icons/bookmark-plus';
import Bot from 'lucide-svelte/icons/bot';
import Box from 'lucide-svelte/icons/box';
import Boxes from 'lucide-svelte/icons/boxes';
import Building from 'lucide-svelte/icons/building-2';
import Calendar from 'lucide-svelte/icons/calendar';
import Camera from 'lucide-svelte/icons/camera';
import CameraOff from 'lucide-svelte/icons/camera-off';
import Check from 'lucide-svelte/icons/check';
import CheckCheck from 'lucide-svelte/icons/check-check';
import CheckCircle from 'lucide-svelte/icons/check-circle-2';
import ChevronDown from 'lucide-svelte/icons/chevron-down';
import ChevronLeft from 'lucide-svelte/icons/chevron-left';
import ChevronRight from 'lucide-svelte/icons/chevron-right';
import ChevronUp from 'lucide-svelte/icons/chevron-up';
import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
import ClipboardCheck from 'lucide-svelte/icons/clipboard-check';
import ClipboardList from 'lucide-svelte/icons/clipboard-list';
import Clock from 'lucide-svelte/icons/clock';
import Cog from 'lucide-svelte/icons/cog';
import Columns from 'lucide-svelte/icons/columns-3';
import Command from 'lucide-svelte/icons/command';
import Contrast from 'lucide-svelte/icons/contrast';
import Copy from 'lucide-svelte/icons/copy';
import Download from 'lucide-svelte/icons/download';
import Edit from 'lucide-svelte/icons/pencil';
import Edit2 from 'lucide-svelte/icons/pencil-line';
import ExternalLink from 'lucide-svelte/icons/external-link';
import Eye from 'lucide-svelte/icons/eye';
import EyeOff from 'lucide-svelte/icons/eye-off';
import Factory from 'lucide-svelte/icons/factory';
import File from 'lucide-svelte/icons/file';
import FilePlus from 'lucide-svelte/icons/file-plus';
import FileText from 'lucide-svelte/icons/file-text';
import Filter from 'lucide-svelte/icons/filter';
import FolderOpen from 'lucide-svelte/icons/folder-open';
import Globe from 'lucide-svelte/icons/globe';
import Grid from 'lucide-svelte/icons/grid-3x3';
import GripVertical from 'lucide-svelte/icons/grip-vertical';
import Hash from 'lucide-svelte/icons/hash';
import HelpCircle from 'lucide-svelte/icons/help-circle';
import Home from 'lucide-svelte/icons/home';
import Image from 'lucide-svelte/icons/image';
import Inbox from 'lucide-svelte/icons/inbox';
import Info from 'lucide-svelte/icons/info';
import Kanban from 'lucide-svelte/icons/kanban-square';
import Key from 'lucide-svelte/icons/key';
import Languages from 'lucide-svelte/icons/languages';
import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
import LayoutGrid from 'lucide-svelte/icons/layout-grid';
import Link from 'lucide-svelte/icons/link';
import Loader from 'lucide-svelte/icons/loader-circle';
import Loader2 from 'lucide-svelte/icons/loader-2';
import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
import Cpu from 'lucide-svelte/icons/cpu';
import Lock from 'lucide-svelte/icons/lock';
import LogIn from 'lucide-svelte/icons/log-in';
import LogOut from 'lucide-svelte/icons/log-out';
import Mail from 'lucide-svelte/icons/mail';
import MapPin from 'lucide-svelte/icons/map-pin';
import Maximize from 'lucide-svelte/icons/maximize-2';
import Menu from 'lucide-svelte/icons/menu';
import MessageSquare from 'lucide-svelte/icons/message-square';
import Minimize from 'lucide-svelte/icons/minimize-2';
import Minus from 'lucide-svelte/icons/minus';
import MinusCircle from 'lucide-svelte/icons/minus-circle';
import Monitor from 'lucide-svelte/icons/monitor';
import Moon from 'lucide-svelte/icons/moon';
import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
import MoreVertical from 'lucide-svelte/icons/more-vertical';
import Package from 'lucide-svelte/icons/package';
import PackagePlus from 'lucide-svelte/icons/package-plus';
import PackageSearch from 'lucide-svelte/icons/package-search';
import Paintbrush from 'lucide-svelte/icons/paintbrush';
import Palette from 'lucide-svelte/icons/palette';
import Paperclip from 'lucide-svelte/icons/paperclip';
import Phone from 'lucide-svelte/icons/phone';
import Play from 'lucide-svelte/icons/play';
import Plug from 'lucide-svelte/icons/plug';
import Plus from 'lucide-svelte/icons/plus';
import PlusCircle from 'lucide-svelte/icons/plus-circle';
import Printer from 'lucide-svelte/icons/printer';
import QrCode from 'lucide-svelte/icons/qr-code';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';
import Rows from 'lucide-svelte/icons/rows-3';
import Ruler from 'lucide-svelte/icons/ruler';
import Save from 'lucide-svelte/icons/save';
import ScanBarcode from 'lucide-svelte/icons/scan-barcode';
import Search from 'lucide-svelte/icons/search';
import Send from 'lucide-svelte/icons/send';
import Settings from 'lucide-svelte/icons/settings';
import Shield from 'lucide-svelte/icons/shield';
import Slash from 'lucide-svelte/icons/slash';
import Smile from 'lucide-svelte/icons/smile';
import Sparkles from 'lucide-svelte/icons/sparkles';
import Square from 'lucide-svelte/icons/square';
import Star from 'lucide-svelte/icons/star';
import StickyNote from 'lucide-svelte/icons/sticky-note';
import Sun from 'lucide-svelte/icons/sun';
import Tag from 'lucide-svelte/icons/tag';
import Trash from 'lucide-svelte/icons/trash';
import Trash2 from 'lucide-svelte/icons/trash-2';
import TrendingUp from 'lucide-svelte/icons/trending-up';
import Truck from 'lucide-svelte/icons/truck';
import Type from 'lucide-svelte/icons/type';
import Upload from 'lucide-svelte/icons/upload';
import User from 'lucide-svelte/icons/user';
import UserPlus from 'lucide-svelte/icons/user-plus';
import Users from 'lucide-svelte/icons/users';
import Wifi from 'lucide-svelte/icons/wifi';
import WifiOff from 'lucide-svelte/icons/wifi-off';
import X from 'lucide-svelte/icons/x';
import XCircle from 'lucide-svelte/icons/x-circle';
import ZapIcon from 'lucide-svelte/icons/zap';
import ZoomIn from 'lucide-svelte/icons/zoom-in';
import ZoomOut from 'lucide-svelte/icons/zoom-out';

export const icons = {
  'activity': Activity,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-right-left': ArrowRightLeft,
  'arrow-up-right': ArrowUpRight,
  'badge-check': BadgeCheck,
  'bar-chart': BarChart3,
  'bar-chart-3': BarChart3,
  'beaker': Beaker,
  'bell': Bell,
  'bell-off': BellOff,
  'bell-ring': BellRing,
  'book': Book,
  'book-open': BookOpen,
  'bookmark-plus': BookmarkPlus,
  'bot': Bot,
  'box': Box,
  'boxes': Boxes,
  'building': Building,
  'building-2': Building,
  'calendar': Calendar,
  'camera': Camera,
  'camera-off': CameraOff,
  'check': Check,
  'check-check': CheckCheck,
  'check-circle': CheckCircle,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevrons-up-down': ChevronsUpDown,
  'clipboard-check': ClipboardCheck,
  'clipboard-list': ClipboardList,
  'clock': Clock,
  'cog': Cog,
  'columns': Columns,
  'command': Command,
  'contrast': Contrast,
  'copy': Copy,
  'download': Download,
  'edit': Edit,
  'edit-2': Edit2,
  'external-link': ExternalLink,
  'eye': Eye,
  'eye-off': EyeOff,
  'factory': Factory,
  'file': File,
  'file-plus': FilePlus,
  'file-text': FileText,
  'filter': Filter,
  'folder-open': FolderOpen,
  'globe': Globe,
  'grid': Grid,
  'grip-vertical': GripVertical,
  'hash': Hash,
  'help-circle': HelpCircle,
  'home': Home,
  'image': Image,
  'inbox': Inbox,
  'info': Info,
  'kanban': Kanban,
  'key': Key,
  'languages': Languages,
  'layout-dashboard': LayoutDashboard,
  'layout-grid': LayoutGrid,
  'link': Link,
  'loader': Loader,
  'loader-2': Loader2,
  'lock': Lock,
  'log-in': LogIn,
  'log-out': LogOut,
  'mail': Mail,
  'map-pin': MapPin,
  'maximize': Maximize,
  'menu': Menu,
  'message-square': MessageSquare,
  'minimize': Minimize,
  'minus': Minus,
  'minus-circle': MinusCircle,
  'monitor': Monitor,
  'moon': Moon,
  'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical,
  'package': Package,
  'package-plus': PackagePlus,
  'package-search': PackageSearch,
  'cpu': Cpu,
  'paintbrush': Paintbrush,
  'palette': Palette,
  'rotate-ccw': RotateCcw,
  'paperclip': Paperclip,
  'phone': Phone,
  'play': Play,
  'plug': Plug,
  'plus': Plus,
  'plus-circle': PlusCircle,
  'printer': Printer,
  'qr-code': QrCode,
  'refresh-cw': RefreshCw,
  'rows': Rows,
  'ruler': Ruler,
  'save': Save,
  'scan-barcode': ScanBarcode,
  'search': Search,
  'send': Send,
  'settings': Settings,
  'shield': Shield,
  'slash': Slash,
  'smile': Smile,
  'sparkles': Sparkles,
  'square': Square,
  'star': Star,
  'sticky-note': StickyNote,
  'sun': Sun,
  'tag': Tag,
  'trash': Trash,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  'truck': Truck,
  'type': Type,
  'upload': Upload,
  'user': User,
  'user-plus': UserPlus,
  'users': Users,
  'wifi': Wifi,
  'wifi-off': WifiOff,
  'x': X,
  'x-circle': XCircle,
  'zap': ZapIcon,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut
} as const;

// Legacy aliases — kept so pre-existing callers (e.g. src/lib/brand/TopNav.svelte)
// keep working. New code should prefer canonical kebab-case names from `icons`.
export const iconAliases = {
  'orders': 'clipboard-list',
  'inventory': 'boxes',
  'assets': 'package',
  'stations': 'building',
  'products': 'package',
  'warning': 'alert-triangle',
  'error': 'x-circle',
  'success': 'check-circle',
  'dashboard': 'layout-dashboard',
  'chat': 'message-square',
  'notification': 'bell',
  'logout': 'log-out',
  'login': 'log-in',
  'edit-pencil': 'edit'
} as const satisfies Record<string, keyof typeof icons>;

export type IconName = keyof typeof icons | keyof typeof iconAliases;

export function resolveIconName(name: IconName): keyof typeof icons {
  if (name in iconAliases) return iconAliases[name as keyof typeof iconAliases];
  return name as keyof typeof icons;
}

// Size keyword → pixel value (mirrors --icon-size-* tokens in brand.css
// at the base font-scale of 1.0; the wrapper never reads CSS vars).
export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 28
} as const;

export type IconSize = keyof typeof iconSizes | number;

export function resolveIconSize(size: IconSize | undefined): number {
  if (typeof size === 'number') return size;
  if (size && size in iconSizes) return iconSizes[size as keyof typeof iconSizes];
  return iconSizes.md;
}
