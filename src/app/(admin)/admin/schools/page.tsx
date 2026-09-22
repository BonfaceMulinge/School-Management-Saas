import { redirect } from "next/navigation";

// The school portfolio now lives on the Super Admin dashboard (/admin).
export default function AdminSchoolsPage() {
  redirect("/admin");
}