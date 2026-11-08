import { NavLink, Outlet } from "react-router-dom";

import { ChatDrawer, ChatFab, ChatProvider } from "./ChatShell";
import { SnackHost, Wordmark } from "./ui";

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

const LINKS = [
  { to: "/", label: "Graph", icon: "M12 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4M5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4M19 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4M10.5 9 6.5 15M13.5 9l4 6M7 17h10" },
  { to: "/what-now", label: "What now", icon: "M4 12h15M13 6l6 6-6 6" },
  { to: "/shopping", label: "Shopping", icon: "M3 4h2l2.5 11h10L20 7H6M9 20h.01M17 20h.01" },
  { to: "/docs", label: "Docs", icon: "M4 5h16v11H4zM4 16l4-4 4 4 3-3 5 5M9 9h.01" },
  { to: "/log", label: "Log", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
];

export function Layout() {
  return (
    <SnackHost>
      <ChatProvider>
        <div className="app">
          <nav className="rail" aria-label="Main">
            <span className="rail-mark">
              <Wordmark />
            </span>
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"} title={link.label}>
                {icon(link.icon)}
                <span className="rail-label">{link.label}</span>
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
