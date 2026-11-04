import { screen } from "@testing-library/react";

import { mockApi, renderApp, workItem } from "../test-helpers";
import { Home } from "./Home";

const home = {
  last_activity: "2026-08-09",
  days_away: 87,
  overall_progress: 10,
  last_session: [{ day: "2026-08-09", label: "Progress", text: "Wire the board is at 60%" }],
  in_progress: [workItem()],
  on_order: [workItem({ slug: "buy-pir", title: "Order PIR board", kind: "purchase", current_state: "" })],
  arrived: [{ day: "2026-08-01", label: "Arrived", text: "Roof vent" }],
  suggestions: [workItem()],
};

test("re-entry shows time away, the next job and where it was left", async () => {
  mockApi({ "/api/home": home });

  renderApp(<Home />);

  expect(await screen.findByText("It's been 87 days. Here's where you are.")).toBeInTheDocument();
  expect(screen.getByText("Do this next")).toBeInTheDocument();
  expect(screen.getByText("Wire the board")).toBeInTheDocument();
  expect(screen.getByText("Cables are in the blue box.")).toBeInTheDocument();
  expect(screen.getByText("Order PIR board")).toBeInTheDocument();
  expect(screen.getByText("Roof vent")).toBeInTheDocument();
});

test("a task already suggested is not repeated as in progress", async () => {
  mockApi({ "/api/home": home });

  renderApp(<Home />);

  await screen.findByText("Do this next");
  expect(screen.queryByText("Also in progress")).not.toBeInTheDocument();
});

test("an empty project points to the chat", async () => {
  mockApi({
    "/api/home": { ...home, last_activity: null, days_away: null, suggestions: [], in_progress: [], on_order: [], arrived: [], last_session: [] },
  });

  renderApp(<Home />);

  expect(await screen.findByText("Start talking")).toHaveAttribute("href", "/chat");
});

test("never calls the chat or sessions API", async () => {
  const calls = mockApi({ "/api/home": home });

  renderApp(<Home />);

  await screen.findByText("Do this next");
  expect(calls.map((call) => call.url)).toEqual(["/api/home"]);
});
