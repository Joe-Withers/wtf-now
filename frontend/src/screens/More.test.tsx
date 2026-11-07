import { screen } from "@testing-library/react";

import { mockApi, renderApp } from "../test-helpers";
import { More } from "./More";

test("the menu shows problems in the project files", async () => {
  mockApi({ "/api/problems": [{ code: "x", path: "tasks/a.md", message: "bad parent" }] });

  renderApp(<More />);

  expect(await screen.findByText("tasks/a.md: bad parent")).toBeInTheDocument();
});

test("the floor plan is not a screen of its own any more", async () => {
  mockApi({ "/api/problems": [] });

  renderApp(<More />);

  expect(screen.queryByText("Floor plan")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /plan/i })).not.toBeInTheDocument();
});
