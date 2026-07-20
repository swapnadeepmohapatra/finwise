import {
  ArrowLeftRight,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/income", label: "Income", icon: Briefcase },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/planning", label: "Planning", icon: Target },
  { href: "/credit-cards", label: "Credit Cards", icon: CreditCard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/advisor", label: "Advisor", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Shown in the mobile bottom tab bar; the rest go under "More". */
export const MOBILE_TABS = ["/", "/transactions", "/investments", "/advisor"];
