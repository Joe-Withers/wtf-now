import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp, workItem } from "../test-helpers";
import { WhatNowScreen } from "./WhatNowScreen";

const result = {
  can_do: [workItem()],
  order_first: [workItem({ slug: "buy-panels", title: "Order panels", kind: "purchase", current_state: "" })],
  on_its_way: [workItem({ slug: "buy-pir", title: "PIR board", kind: "purchase", current_state: "" })],
  decide_first: [workItem({ slug: "choose", title: "Lithium or AGM", kind: "decision", current_state: "" })],
};

test("shows each group of work", async () => {
  mockApi({ "/api/what-now": result });

  renderApp(<WhatNowScreen />);

  expect(await screen.findByText("Can do now")).toBeInTheDocument();
  expect(screen.getByText("Order first")).toBeInTheDocument();
  expect(screen.getByText("On its way")).toBeInTheDocument();
  expect(screen.getByText("Decide or research first")).toBeInTheDocument();
});

test("filters send the time and helper to the API", async () => {
  const calls = mockApi({ "/api/what-now": result });
  renderApp(<WhatNowScreen />);
  await screen.findByText("Can do now");

  await userEvent.click(screen.getByRole("button", { name: "2 hours" }));
  await userEvent.click(screen.getByRole("button", { name: "On my own" }));

  await waitFor(() => expect(calls.at(-1)?.url).toBe("/api/what-now?hours=2&helper=false"));
  expect(screen.getByRole("button", { name: "2 hours" })).toHaveAttribute("aria-pressed", "true");
});

test("marking a purchase arrived offers undo", async () => {
  const calls = mockApi({
    "/api/what-now": result,
    "/api/tasks/buy-pir/state": { change: { id: "abc", summary: "x", at: "" } },
  });
  renderApp(<WhatNowScreen />);

  await userEvent.click(await screen.findByRole("button", { name: "It's arrived" }));

  expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  const write = calls.find((call) => call.url === "/api/tasks/buy-pir/state");
  expect(write?.init?.body).toBe(JSON.stringify({ state: "done" }));
});
