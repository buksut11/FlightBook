import {
  LayoutDashboard, TicketPlus, Ticket, Plane, Users, FileText, BarChart3, Settings,
} from "lucide-react";
import type { Role } from "@/lib/types/database";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "agent"] },
  { href: "/bookings/new", label: "New Booking", icon: TicketPlus, roles: ["admin", "agent"] },
  { href: "/bookings", label: "Bookings", icon: Ticket, roles: ["admin", "agent"] },
  { href: "/flights", label: "Flights", icon: Plane, roles: ["admin", "agent"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["admin", "agent"] },
  { href: "/statements", label: "Statements", icon: FileText, roles: ["admin", "agent"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];
