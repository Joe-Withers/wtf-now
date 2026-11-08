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

  expect(within(nav).getAllByRole("link")).toHaveLength(5);

  await userEvent.click(within(nav).getByRole("link", { name: "What now" }));

  expect(window.location.pathname).toBe("/what-now");
});

test("the map is the home", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  expect(within(nav).getByRole("link", { name: "Graph" })).toHaveAttribute("href", "/");
});

test("there is no plan tab: the map and what now cover it", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  expect(within(nav).queryByRole("link", { name: "Plan" })).not.toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "What now" })).toHaveAttribute("href", "/what-now");
});
