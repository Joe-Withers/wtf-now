import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp } from "../test-helpers";
import { GraphScreen } from "./GraphScreen";

const ref = (slug: string, title: string, state = "todo") => ({ slug, title, state });

const graph = {
  nodes: [
    { slug: "fridge", title: "Fit the fridge", state: "todo", blocked: true, is_leaf: true, waiting_on: ["Ply floor"] },
    { slug: "kitchen", title: "Kitchen", state: "doing", blocked: true, is_leaf: false, waiting_on: [] },
    { slug: "ply", title: "Ply floor", state: "todo", blocked: false, is_leaf: true, waiting_on: [] },
  ],
  edges: [],
};

const fridge = {
  slug: "fridge",
  title: "Fit the fridge",
  state: "todo",
  blocked_by: [ref("ply", "Ply floor")],
  depends_on: [
    { slug: "ply", title: "Ply floor", strength: "hard", done: false, inherited_from: null },
    { slug: "vent", title: "Vent", strength: "soft", done: false, inherited_from: null },
    { slug: "rust", title: "Treat rust", strength: "hard", done: true, inherited_from: null },
  ],
  dependents: [ref("test", "Test run")],
};

const ply = { ...fridge, slug: "ply", title: "Ply floor", blocked_by: [], depends_on: [], dependents: [ref("fridge", "Fit the fridge")] };

test("starts from blocked leaf tasks", async () => {
  mockApi({ "/api/graph": graph });

  renderApp(<GraphScreen />, "/graph");

  expect(await screen.findByRole("button", { name: /Fit the fridge/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Kitchen/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Ply floor/ })).not.toBeInTheDocument();
});

test("says what each blocked task is waiting on", async () => {
  mockApi({ "/api/graph": graph });

  renderApp(<GraphScreen />, "/graph");

  expect(await screen.findByText("Waiting on Ply floor")).toBeInTheDocument();
});

test("shows why a task is blocked, and hard and soft differently", async () => {
  mockApi({ "/api/tasks/fridge": fridge });

  renderApp(<GraphScreen />, "/graph?task=fridge");

  expect(await screen.findByRole("button", { name: /Ply floor\s*Blocking/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Vent\s*Easier first/ })).toHaveClass("soft");
  expect(screen.getByRole("button", { name: /Treat rust\s*Done/ })).toHaveClass("finished");
  expect(screen.getByRole("button", { name: "Test run" })).toBeInTheDocument();
});

test("tapping through traces the block to its source", async () => {
  mockApi({ "/api/tasks/fridge": fridge, "/api/tasks/ply": ply });
  renderApp(<GraphScreen />, "/graph?task=fridge");

  await userEvent.click(await screen.findByRole("button", { name: /Ply floor/ }));

  expect(await screen.findByText("Nothing. This can start any time.")).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
});
