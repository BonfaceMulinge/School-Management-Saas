/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");

const tokens = {
  superadmin: "iAP1mKd0ZE4PvMdp5fp6rWACF8orUNZh-OwWopU3qcU",
  admin: "_uzpItIIuBDPeNyTQxgXFp05xZCPfmLhtukToEyTY38",
  teacher: "dpb6QLqAtuXEob-8xRnqQsiuXEbiR-w6CXhKxyCmd0A",
  student: "k3XfFQuRIsDgYuTTgF7eH4h1wUwZ8h-rU5TdAAnCyN0",
  parent: "FoLD7HvWryXrQvpV0g_5cHsb_cvKkMfhGgRjvAxwHnA",
};

const base = "http://localhost:3000";

// Routes to crawl. Roles tested per route are in an explicit allowlist.
const ROUTES = [
  // home / auth
  { path: "/", all: ["superadmin", "admin", "teacher", "student", "parent"] },
  // school hub
  { path: "/demo-school", all: ["superadmin", "admin", "teacher", "student", "parent"] },
  // academics
  { path: "/demo-school/academic-years", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/terms", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/classes", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/streams", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/subjects", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/assignments", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/students", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/parents", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/staff", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/teachers", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/exams", roles: ["admin", "teacher"], student: "RD", parent: "RD" },
  // exam detail + paper (student/parent must be denied)
  { path: "/demo-school/exams/smoke_yjtx9pmfmtr4ujb7", roles: ["admin", "teacher"], student: "RD", parent: "RD" },
  { path: "/demo-school/grading", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/results", roles: ["admin", "teacher", "student", "parent"] },
  { path: "/demo-school/results/reports", roles: ["admin", "teacher", "student", "parent"] },
  // finance
  { path: "/demo-school/finance/structures", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/finance/charges", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/finance/payments", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/finance/statements", roles: ["admin", "teacher", "student", "parent"] },
  { path: "/demo-school/finance/reports", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/payments", roles: ["admin"], all: ["teacher", "student", "parent"] },
  // reports
  { path: "/demo-school/reports", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/reports/students", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/reports/academic", roles: ["admin", "teacher"], all: ["student", "parent"] },
  { path: "/demo-school/reports/finance", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/reports/communication", roles: ["admin"], all: ["teacher", "student", "parent"] },
  // communication (staff create; all can view announcements/events/notifications within scope)
  { path: "/demo-school/communication/announcements", roles: ["admin", "teacher", "student", "parent"] },
  { path: "/demo-school/communication/events", roles: ["admin", "teacher", "student", "parent"] },
  { path: "/demo-school/communication/messages", roles: ["admin", "teacher", "student", "parent"] },
  { path: "/demo-school/communication/notifications", roles: ["admin", "teacher", "student", "parent"] },
  // settings
  { path: "/demo-school/settings", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/academic", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/branding", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/communication", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/contact", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/finance", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/settings/subscription", roles: ["admin"], all: ["teacher", "student", "parent"] },
  { path: "/demo-school/onboarding", roles: ["admin"], all: ["teacher", "student", "parent"] },
  // attendance (blocked for EVERYONE - product decision)
  { path: "/demo-school/attendance", all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/demo-school/attendance/history", all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/demo-school/attendance/reports", all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/demo-school/reports/attendance", all: ["admin", "teacher", "student", "parent"], expect: "404" },
  // super-admin platform
  { path: "/admin", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/schools", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/subscriptions", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/payments", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/plans", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/users", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/audit", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  { path: "/admin/integrations", roles: ["superadmin"], all: ["admin", "teacher", "student", "parent"], expect: "404" },
  // login
  { path: "/login", all: ["superadmin", "admin", "teacher", "student", "parent"] },
];

function roleSet(route) {
  const r = route.all || [];
  const s = {};
  for (const role of Object.keys(tokens)) {
    if (r.indexOf(role) >= 0) s[role] = true;
  }
  if (route.roles) for (const role of route.roles) s[role] = true;
  if (route.student) s.student = true;
  if (route.parent) s.parent = true;
  return s;
}

function classify(html, http) {
  if (html.includes('NEXT_HTTP_ERROR_FALLBACK;404')) return "404";
  if (html.includes('NEXT_REDIRECT')) return "RD";
  if (html.includes('<title>') && html.length > 2000) return "OK";
  return "EMPTY:" + http;
}

function probe(path, token) {
  const args = ["-s", "-H", `Cookie: sms_session=${token}`, base + path];
  let out;
  try {
    out = execFileSync("curl.exe", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return "ERR:" + e.message.slice(0, 30);
  }
  return classify(out);
}

const rows = [];
for (const route of ROUTES) {
  const set = roleSet(route);
  let issues = [];
  const cells = {};
  for (const role of Object.keys(tokens)) {
    if (!set[role]) continue;
    const cls = probe(route.path, tokens[role]);
    cells[role] = cls;
    let expected = "OK";
    if (route.expect) expected = route.expect;
    else if (route.student && role === "student") expected = route.student;
    else if (route.parent && role === "parent") expected = route.parent;
    else if (route.all && route.all.indexOf(role) >= 0) expected = "OK";
    if (route.roles && route.roles.indexOf(role) >= 0) expected = "OK";
    if (cls !== expected) issues.push(`${role}=${cls}(expect ${expected})`);
  }
  rows.push({ path: route.path, cells, issues });
}

// display
for (const r of rows) {
  const line = `${r.path.padEnd(52)}`;
  const parts = Object.entries(r.cells).map(([k, v]) => `${k}:${v}`);
  console.log(line + "  |  " + parts.join("  "));
  if (r.issues.length) console.log("   ^^ UNEXPECTED: " + r.issues.join(", "));
}