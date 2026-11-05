import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp } from "../test-helpers";
import { PlanScreen } from "./PlanScreen";

const node = (slug: string, title: string, overrides = {}) => ({
  slug,
  title,
  kind: "build",
  state: "todo",
  progress: 0,
  remaining_hours: 1,
  blocked: false,
  children: [],
  ...overrides,
});

const tree = [
  node("electrics", "Electrics", {
    state: "doing",
    progress: 40,
    children: [node("wire", "Wire the board", { state: "done", progress: 100 })],
  }),
  node("floor", "Floor", { blocked: true }),
];

const home = {
  last_activity: "2026-08-09",
  days_away: 3,
  overall_progress: 10,
  last_session: [],
  in_progress: [],
  on_order: [],
  arrived: [],
  suggestions: [],
};

const detail = {
  slug: "electrics",
  title: "Electrics",
  description: "",
  kind: "build",
  state: "doing",
  progress: 40,
  progress_reason: "",
  remaining_hours: 2,
  is_leaf: false,
  zone: null,
  needs_helper: false,
  cost: null,
  current_state: "The board is half wired.",
  notes: "",
  breadcrumbs: [],
  children: [],
  depends_on: [],
  dependents: [{ slug: "floor", title: "Floor", state: "todo" }],
  blocked_by: [],
  easier_after: [],
  closes_zone_title: null,
  preflight: [],
  photos: [],
};

test("the plan shows the areas and what's under them", async () => {
  mockApi({ "/api/tree": tree, "/api/home": home });
  renderApp(<PlanScreen />);

  expect(await screen.findByText("Electrics")).toBeInTheDocument();
  expect(screen.getByText("Wire the board")).toBeInTheDocument();
  expect(screen.getByText("Floor")).toBeInTheDocument();
});

test("the plan says how far along the project is", async () => {
  mockApi({ "/api/tree": tree, "/api/home": home });
  renderApp(<PlanScreen />);

  expect(await screen.findByText(/10% of the whole project/)).toBeInTheDocument();
  expect(screen.getByText(/last here 3 days ago/)).toBeInTheDocument();
});

test("clicking a node opens it up", async () => {
  mockApi({ "/api/tree": tree, "/api/home": home, "/api/tasks/electrics": detail });
  renderApp(<PlanScreen />);

  await userEvent.click(await screen.findByText("Electrics"));

  expect(await screen.findByText("The board is half wired.")).toBeInTheDocument();
  expect(screen.getByText("Unlocks: Floor")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open task →" })).toHaveAttribute("href", "/tasks/electrics");
});

test("a node with parts can be opened and closed again", async () => {
  mockApi({ "/api/tree": tree, "/api/home": home, "/api/tasks/electrics": detail });
  renderApp(<PlanScreen />);

  await userEvent.click(await screen.findByRole("button", { name: "Close Electrics" }));

  expect(screen.queryByText("Wire the board")).not.toBeInTheDocument();
});
