import { NavLink, Outlet } from "react-router-dom";

import { ChatDrawer, ChatFab, ChatProvider } from "./ChatShell";
import { SnackHost } from "./ui";

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

const LINKS = [
  { to: "/", label: "Home", icon: "M3 11l9-7 9 7M5 10v10h14V10" },
  { to: "/what-now", label: "What now", icon: "M4 12h15M13 6l6 6-6 6" },
  { to: "/tasks", label: "Tasks", icon: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" },
  { to: "/shopping", label: "Shopping", icon: "M3 4h2l2.5 11h10L20 7H6M9 20h.01M17 20h.01" },
  { to: "/wiki", label: "Wiki", icon: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4" },
  { to: "/log", label: "Log", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
  { to: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function Layout() {
  return (
    <SnackHost>
      <ChatProvider>
        <div className="app">
          <nav className="rail" aria-label="Main">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"}>
                {icon(link.icon)}
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="main">
            <Outlet />
          </div>
          <ChatFab />
          <ChatDrawer />
        </div>
      </ChatProvider>
    </SnackHost>
  );
}
