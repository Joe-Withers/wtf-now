import { NavLink, Outlet } from "react-router-dom";

import { SnackHost } from "./ui";

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

const LINKS = [
  { to: "/", label: "Home", icon: "M3 11l9-7 9 7M5 10v10h14V10" },
  { to: "/what-now", label: "What now", icon: "M4 12h15M13 6l6 6-6 6" },
  { to: "/chat", label: "Chat", icon: "M21 12a8 8 0 0 1-8 8H4l2.5-3.5A8 8 0 1 1 21 12z" },
  { to: "/tasks", label: "Tasks", icon: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" },
  { to: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function Layout() {
  return (
    <SnackHost>
      <div className="app">
        <Outlet />
        <nav className="nav" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/"}>
              {icon(link.icon)}
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </SnackHost>
  );
}
