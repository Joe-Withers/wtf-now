import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { ChatProvider } from "./components/ChatShell";
import { SnackHost } from "./components/ui";

/** Serves canned JSON by path, and records every call. */
export function mockApi(routes: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((route) => url.startsWith(route));
    return {
      ok: key !== undefined,
      status: key === undefined ? 404 : 200,
      json: async () => (key === undefined ? { detail: `No route for ${url}` } : routes[key]),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function renderApp(ui: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SnackHost>
          <ChatProvider>{ui}</ChatProvider>
        </SnackHost>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const workItem = (overrides = {}) => ({
  slug: "wire-board",
  title: "Wire the board",
  kind: "build",
  state: "doing",
  progress: 60,
  remaining_hours: 1.5,
  needs_helper: false,
  zone: null,
  area: "Electrics",
  current_state: "Cables are in the blue box.",
  unlocks_hours: 4,
  easier_after: [],
  ...overrides,
});
