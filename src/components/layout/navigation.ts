import {
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileChartColumn,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Receipt,
  School,
  ScrollText,
  Settings,
  UserCheck,
  UserCircle,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  hasPlatformRolePermission,
  hasSchoolRolePermission,
  type Permission,
  type PlatformRole,
  type SchoolRole,
} from "@/lib/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled: boolean;
};

const navPermissions: Record<string, Permission> = {
  "academic-years": "academic-years:view",
  terms: "terms:view",
  classes: "classes:view",
  streams: "streams:view",
  subjects: "subjects:view",
  assignments: "assignments:view",
  students: "students:view",
  parents: "parents:view",
  staff: "staff:view",
  teachers: "staff:view",
  exams: "exams:view",
  grading: "grading:view",
  results: "results:view",
  "results/reports": "results:view",
  "finance/structures": "finance:manage",
  "finance/charges": "finance:manage",
  "finance/payments": "finance:manage",
  payments: "finance:view",
  "finance/statements": "finance:view",
  "finance/reports": "finance:report",
  "communication/announcements": "communication:view",
  "communication/messages": "communication:view",
  "communication/notifications": "communication:view",
  "communication/events": "communication:view",
  settings: "settings:view",
};

export function visibleDashboardNav(
  role: SchoolRole | null,
  platformRole: PlatformRole | null
): NavItem[] {
  return [...dashboardNav, ...administrationNav].filter((item) => {
    if (item.disabled) return role === "SCHOOL_ADMIN" || platformRole === "SUPER_ADMIN";
    const permission = navPermissions[item.href];
    if (!permission) return true;
    if (platformRole) return hasPlatformRolePermission(platformRole, permission);
    return role ? hasSchoolRolePermission(role, permission) : false;
  });
}
export const dashboardNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "",
    icon: LayoutDashboard,
    disabled: false,
  },
  {
    title: "Academic Years",
    href: "academic-years",
    icon: CalendarRange,
    disabled: false,
  },
  {
    title: "Terms",
    href: "terms",
    icon: CalendarClock,
    disabled: false,
  },
  {
    title: "Classes",
    href: "classes",
    icon: School,
    disabled: false,
  },
  {
    title: "Streams",
    href: "streams",
    icon: Layers,
    disabled: false,
  },
  {
    title: "Subjects",
    href: "subjects",
    icon: BookOpen,
    disabled: false,
  },
  {
    title: "Teacher Assignments",
    href: "assignments",
    icon: UserCheck,
    disabled: false,
  },
  {
    title: "Students",
    href: "students",
    icon: GraduationCap,
    disabled: false,
  },
  {
    title: "Parents",
    href: "parents",
    icon: UsersRound,
    disabled: false,
  },
  {
    title: "Staff",
    href: "staff",
    icon: UserCircle,
    disabled: false,
  },
  {
    title: "Teachers",
    href: "teachers",
    icon: Users,
    disabled: false,
  },
  {
    title: "Exams",
    href: "exams",
    icon: ClipboardList,
    disabled: false,
  },
  {
    title: "Grading",
    href: "grading",
    icon: BookOpen,
    disabled: false,
  },
  {
    title: "Results",
    href: "results",
    icon: GraduationCap,
    disabled: false,
  },
  {
    title: "Academic Reports",
    href: "results/reports",
    icon: BarChart3,
    disabled: false,
  },
  {
    title: "Fee Structures",
    href: "finance/structures",
    icon: Wallet,
    disabled: false,
  },
  {
    title: "Student Charges",
    href: "finance/charges",
    icon: Receipt,
    disabled: false,
  },
  {
    title: "Payments",
    href: "finance/payments",
    icon: Banknote,
    disabled: false,
  },
  {
    title: "Online Payments",
    href: "payments",
    icon: Wallet,
    disabled: false,
  },
  {
    title: "Statements",
    href: "finance/statements",
    icon: ScrollText,
    disabled: false,
  },
  {
    title: "Finance Reports",
    href: "finance/reports",
    icon: BarChart3,
    disabled: false,
  },
  {
    title: "Reports",
    href: "reports",
    icon: FileChartColumn,
    disabled: false,
  },
  {
    title: "Announcements",
    href: "communication/announcements",
    icon: Megaphone,
    disabled: false,
  },
  {
    title: "Messages",
    href: "communication/messages",
    icon: MessageSquare,
    disabled: false,
  },
  {
    title: "Notifications",
    href: "communication/notifications",
    icon: Bell,
    disabled: false,
  },
  {
    title: "Events",
    href: "communication/events",
    icon: CalendarDays,
    disabled: false,
  },
];

export const administrationNav: NavItem[] = [
  {
    title: "School Settings",
    href: "settings",
    icon: Settings,
    disabled: false,
  },
  {
    title: "Administration",
    href: "administration",
    icon: UsersRound,
    disabled: true,
  },
];

export const schoolSwitcherLabel = "Switch School";