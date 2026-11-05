import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp } from "../test-helpers";
import { Docs } from "./Docs";

const shape = (id: string) => ({ id, tag: "rect" as const, attributes: { x: "0", y: "0", width: "100", height: "40" } });

const drawing = {
  slug: "van-plan",
  title: "Van plan",
  view_box: "0 0 100 100",
  zones: [{ id: "rear", title: "Rear cabinet", progress: 40, tasks: [], shape: shape("rear") }],
  shapes: [shape("rear")],
};

const note = {
  slug: "height",
  title: "Ceiling height",
  type: "Measurement",
  description: "",
  generated_by: "wtf-now/model",
  verified: false,
  needs_verifying: true,
  stale: false,
};

test("the docs are the drawings and the notes", async () => {
  mockApi({ "/api/drawings": [drawing], "/api/notes": [note] });

  renderApp(<Docs />);

  expect(await screen.findByText("Van plan")).toBeInTheDocument();
  expect(screen.getByText("Ceiling height")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Van plan/ })).toHaveAttribute("href", "/drawings/van-plan");
  expect(screen.getByRole("link", { name: /Ceiling height/ })).toHaveAttribute("href", "/notes/height");
});

test("a drawing shows what it looks like", async () => {
  mockApi({ "/api/drawings": [drawing], "/api/notes": [] });

  renderApp(<Docs />);

  const card = await screen.findByRole("link", { name: /Van plan/ });
  const preview = card.querySelector("svg");
  expect(preview?.querySelectorAll("rect.zone")).toHaveLength(1);
});

test("unverified and stale notes are flagged", async () => {
  mockApi({ "/api/drawings": [], "/api/notes": [note, { ...note, slug: "price", title: "PIR price", needs_verifying: false, stale: true }] });

  renderApp(<Docs />);

  expect(await screen.findByText("Unverified")).toBeInTheDocument();
  expect(screen.getByText("May be out of date")).toBeInTheDocument();
});

test("the docs count the notes waiting to be confirmed", async () => {
  mockApi({ "/api/drawings": [], "/api/notes": [note] });

  renderApp(<Docs />);

  expect(await screen.findByText("1 to verify")).toBeInTheDocument();
});

test("searching replaces the list with results", async () => {
  mockApi({
    "/api/drawings": [drawing],
    "/api/notes": [note],
    "/api/search": [{ kind: "task", slug: "fridge", title: "Fit the fridge", snippet: "needs venting" }],
  });
  renderApp(<Docs />);
  await screen.findByText("Ceiling height");

  await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "fridge");

  expect(await screen.findByRole("link", { name: /Fit the fridge/ })).toHaveAttribute("href", "/tasks/fridge");
  expect(screen.queryByText("Ceiling height")).not.toBeInTheDocument();
});

test("explains what to do when there are no drawings", async () => {
  mockApi({ "/api/drawings": [], "/api/notes": [] });

  renderApp(<Docs />);

  expect(await screen.findByText(/it can draw a simple plan/)).toBeInTheDocument();
});
