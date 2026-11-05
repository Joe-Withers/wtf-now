import { screen } from "@testing-library/react";

import { mockApi, renderApp } from "../test-helpers";
import { ShoppingScreen } from "./ShoppingScreen";

const item = (slug: string, title: string, overrides = {}) => ({ slug, title, area: "Electrics", cost: 40, blocked_by: [], ...overrides });

const shopping = {
  to_order: [
    item("panels", "Wall panels"),
    item("battery", "Battery", { cost: null, blocked_by: [{ slug: "choose", title: "Lithium or AGM", state: "todo" }] }),
  ],
  on_order: [item("pir", "PIR board")],
  arrived: [item("vent", "Roof vent")],
  still_to_spend: 80,
  spent: 40,
  unpriced: 1,
};

test("shows totals and what each item is waiting on", async () => {
  mockApi({ "/api/shopping": shopping });

  renderApp(<ShoppingScreen />);

  expect(await screen.findByText("£80")).toBeInTheDocument();
  expect(screen.getByText("Still to spend, 1 not priced yet")).toBeInTheDocument();
  expect(screen.getByText("Waiting on Lithium or AGM")).toBeInTheDocument();
});

test("the spend card shows how much is left and how much is gone", async () => {
  mockApi({ "/api/shopping": shopping });

  renderApp(<ShoppingScreen />);

  expect(await screen.findByText("£80")).toBeInTheDocument();
  expect(screen.getByText("£40 spent")).toBeInTheDocument();
  expect(screen.getByText("£120 all told")).toBeInTheDocument();
});

test("nothing on the shopping list changes a task — the chat does that", async () => {
  const calls = mockApi({ "/api/shopping": shopping });

  renderApp(<ShoppingScreen />);

  expect(await screen.findByText("£80")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ordered: Wall panels" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Arrived: PIR board" })).not.toBeInTheDocument();
  expect(calls.every((call) => call.init?.method !== "POST")).toBe(true);
});

test("the shopping list leaves the chat to the chat button", async () => {
  mockApi({ "/api/shopping": shopping });

  renderApp(<ShoppingScreen />);

  await screen.findByText("£80");
  expect(screen.queryByRole("link", { name: /Tell it/ })).not.toBeInTheDocument();
});
