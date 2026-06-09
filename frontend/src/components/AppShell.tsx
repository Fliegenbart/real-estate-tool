"use client";

import {
  Building2,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  ListFilter,
  ShieldAlert
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Listings", icon: ListFilter },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Building2 size={18} />
          </span>
          <span>
            <strong>Acquisition Desk</strong>
            <small>GmbH Underwriting</small>
          </span>
        </Link>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <ShieldAlert size={16} />
          <span>Steuer: vereinfacht, Steuerberater pruefen.</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="topbar-label">Residential acquisitions</span>
            <h1>Deal sourcing & underwriting</h1>
          </div>
          <Link className="memo-shortcut" href="/memo/1">
            <FileText size={16} />
            Memo
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
