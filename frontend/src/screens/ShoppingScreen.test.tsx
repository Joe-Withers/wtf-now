import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  expect(screen.getByText("Still to spend, 1 unpriced")).toBeInTheDocument();
  expect(screen.getByText("Waiting on Lithium or AGM")).toBeInTheDocument();
});

test("a blocked item can't be marked as ordered", async () => {
  mockApi({ "/api/shopping": shopping });

  renderApp(<ShoppingScreen />);

  expect(await screen.findByRole("button", { name: "Ordered: Wall panels" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ordered: Battery" })).not.toBeInTheDocument();
});

test("marking arrival goes through the task state", async () => {
  const calls = mockApi({ "/api/shopping": shopping, "/api/tasks/pir/state": { change: { id: "c", summary: "", at: "" } } });
  renderApp(<ShoppingScreen />);

  await userEvent.click(await screen.findByRole("button", { name: "Arrived: PIR board" }));

  expect(calls.find((call) => call.url === "/api/tasks/pir/state")?.init?.body).toBe(JSON.stringify({ state: "done" }));
});
