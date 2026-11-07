import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

test("moves between the main screens", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  expect(within(nav).getAllByRole("link")).toHaveLength(7);

  await userEvent.click(within(nav).getByRole("link", { name: "What now" }));

  expect(window.location.pathname).toBe("/what-now");
});

test("the map is the home", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  expect(within(nav).getByRole("link", { name: "Graph" })).toHaveAttribute("href", "/");
});

test("the plan is one of the tabs", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  expect(within(nav).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/plan");
});
