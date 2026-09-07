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

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled: boolean;
};

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