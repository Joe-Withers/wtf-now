import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp, workItem } from "../test-helpers";
import { WhatNowScreen } from "./WhatNowScreen";

const result = {
  can_do: [
    workItem(),
    workItem({ slug: "cables", title: "Run the cables", state: "todo", progress: 0 }),
  ],
  order_first: [workItem({ slug: "buy-panels", title: "Order panels", kind: "purchase", current_state: "" })],
  on_its_way: [workItem({ slug: "buy-pir", title: "PIR board", kind: "purchase", current_state: "" })],
  decide_first: [workItem({ slug: "choose", title: "Lithium or AGM", kind: "decision", current_state: "" })],
  recent: [
    {
      slug: "board-wire",
      title: "Wire the board internally",
      kind: "build",
      state: "doing",
      label: "Progress",
      day: "2026-08-10",
    },
  ],
};

test("shows each group of work", async () => {
  mockApi({ "/api/what-now": result });

  renderApp(<WhatNowScreen />);

  expect(await screen.findByText("Just done")).toBeInTheDocument();
  expect(screen.getByText("Next")).toBeInTheDocument();
  expect(screen.getByText("Order first")).toBeInTheDocument();
  expect(screen.getByText("On its way")).toBeInTheDocument();
  expect(screen.getByText("Decide or research first")).toBeInTheDocument();
});

test("the flow starts with the last few things you did", async () => {
  mockApi({ "/api/what-now": result });

  renderApp(<WhatNowScreen />);

  expect(await screen.findByText("Wire the board internally")).toBeInTheDocument();
  expect(screen.getByText("Progress · 10 Aug")).toBeInTheDocument();
});

test("the recommended task is the one the flow points at", async () => {
  mockApi({ "/api/what-now": result });

  renderApp(<WhatNowScreen />);

  const badge = await screen.findByText("Recommended");
  const step = badge.closest("li") as HTMLElement;

  expect(within(step).getByText("Wire the board")).toBeInTheDocument();
  expect(within(screen.getByText("Run the cables").closest("li") as HTMLElement).queryByText("Recommended")).toBeNull();
});

test("filters send the time and helper to the API", async () => {
  const calls = mockApi({ "/api/what-now": result });
  renderApp(<WhatNowScreen />);
  await screen.findByText("Next");

  await userEvent.click(screen.getByRole("button", { name: "2 hours" }));
  await userEvent.click(screen.getByRole("button", { name: "On my own" }));

  await waitFor(() => expect(calls.at(-1)?.url).toBe("/api/what-now?hours=2&helper=false"));
  expect(screen.getByRole("button", { name: "2 hours" })).toHaveAttribute("aria-pressed", "true");
});

test("nothing on What now changes a task — the chat does that", async () => {
  const calls = mockApi({ "/api/what-now": result });
  renderApp(<WhatNowScreen />);

  await screen.findByText("Next");
  expect(screen.queryByRole("button", { name: "It's arrived" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ordered" })).not.toBeInTheDocument();
  expect(calls.every((call) => call.init?.method !== "POST")).toBe(true);
});
