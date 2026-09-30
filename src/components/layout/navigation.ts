import {
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileChartColumn,
  FileText,
  GitBranch,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Receipt,
  Route,
  School,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserCheck,
  UserCircle,
  UserPlus,
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
  /** Sidebar section heading the item belongs under. */
  group: string;
};

const navPermissions: Record<string, Permission> = {
  "academic-years": "academic-years:view",
  terms: "terms:view",
  classes: "classes:view",
  streams: "streams:view",
  pathways: "pathways:view",
  combinations: "combinations:view",
  subjects: "subjects:view",
  assignments: "assignments:view",
  students: "students:view",
  admissions: "enrollments:view",
  parents: "parents:view",
  staff: "staff:view",
  teachers: "staff:view",
  exams: "exams:view",
  grading: "grading:view",
  results: "results:view",
  "results/report-cards": "results:view",
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

const GROUP_OVERVIEW = "Overview";
const GROUP_STUDENTS = "Students & Admissions";
const GROUP_ACADEMICS = "Academics";
const GROUP_STAFF = "Teachers & Staff";
const GROUP_RESULTS = "Exams, Results & Report Cards";
const GROUP_FINANCE = "Fees & Finance";
const GROUP_COMMUNICATION = "Communication";
const GROUP_REPORTS = "Reports";
const GROUP_ADMIN = "Administration";

export const dashboardNav: NavItem[] = [
  { title: "Dashboard", href: "", icon: LayoutDashboard, disabled: false, group: GROUP_OVERVIEW },
  { title: "Students", href: "students", icon: GraduationCap, disabled: false, group: GROUP_STUDENTS },
  { title: "Admissions", href: "admissions", icon: UserPlus, disabled: false, group: GROUP_STUDENTS },
  { title: "Parents", href: "parents", icon: UsersRound, disabled: false, group: GROUP_STUDENTS },
  { title: "Classes", href: "classes", icon: School, disabled: false, group: GROUP_ACADEMICS },
  { title: "Streams", href: "streams", icon: Layers, disabled: false, group: GROUP_ACADEMICS },
  { title: "Academic Years", href: "academic-years", icon: CalendarRange, disabled: false, group: GROUP_ACADEMICS },
  { title: "Terms", href: "terms", icon: CalendarClock, disabled: false, group: GROUP_ACADEMICS },
  { title: "Subjects", href: "subjects", icon: BookOpen, disabled: false, group: GROUP_ACADEMICS },
  { title: "Senior Pathways", href: "pathways", icon: Route, disabled: false, group: GROUP_ACADEMICS },
  { title: "Subject Combinations", href: "combinations", icon: GitBranch, disabled: false, group: GROUP_ACADEMICS },
  { title: "Teacher Assignments", href: "assignments", icon: UserCheck, disabled: false, group: GROUP_ACADEMICS },
  { title: "Teachers", href: "teachers", icon: Users, disabled: false, group: GROUP_STAFF },
  { title: "Staff", href: "staff", icon: UserCircle, disabled: false, group: GROUP_STAFF },
  { title: "Exams", href: "exams", icon: ClipboardList, disabled: false, group: GROUP_RESULTS },
  { title: "Grading", href: "grading", icon: SlidersHorizontal, disabled: false, group: GROUP_RESULTS },
  { title: "Results", href: "results", icon: GraduationCap, disabled: false, group: GROUP_RESULTS },
  { title: "Report Cards", href: "results/report-cards", icon: FileText, disabled: false, group: GROUP_RESULTS },
  { title: "Academic Reports", href: "results/reports", icon: BarChart3, disabled: false, group: GROUP_RESULTS },
  { title: "Fee Structures", href: "finance/structures", icon: Wallet, disabled: false, group: GROUP_FINANCE },
  { title: "Student Charges", href: "finance/charges", icon: Receipt, disabled: false, group: GROUP_FINANCE },
  { title: "Payments", href: "finance/payments", icon: Banknote, disabled: false, group: GROUP_FINANCE },
  { title: "Statements", href: "finance/statements", icon: ScrollText, disabled: false, group: GROUP_FINANCE },
  { title: "Online Payments", href: "payments", icon: CreditCard, disabled: false, group: GROUP_FINANCE },
  { title: "Finance Reports", href: "finance/reports", icon: BarChart3, disabled: false, group: GROUP_FINANCE },
  { title: "Announcements", href: "communication/announcements", icon: Megaphone, disabled: false, group: GROUP_COMMUNICATION },
  { title: "Messages", href: "communication/messages", icon: MessageSquare, disabled: false, group: GROUP_COMMUNICATION },
  { title: "Notifications", href: "communication/notifications", icon: Bell, disabled: false, group: GROUP_COMMUNICATION },
  { title: "Events", href: "communication/events", icon: CalendarDays, disabled: false, group: GROUP_COMMUNICATION },
  { title: "Reports", href: "reports", icon: FileChartColumn, disabled: false, group: GROUP_REPORTS },
];

export const administrationNav: NavItem[] = [
  { title: "School Settings", href: "settings", icon: Settings, disabled: false, group: GROUP_ADMIN },
  { title: "Administration", href: "administration", icon: UsersRound, disabled: true, group: GROUP_ADMIN },
];

export const schoolSwitcherLabel = "Switch School";