import { screen } from "@testing-library/react";

import { mockApi, renderApp } from "../test-helpers";
import { LogScreen } from "./LogScreen";

test("the log groups lines by day", async () => {
  mockApi({
    "/api/log": [
      { day: "2026-08-09", label: "Progress", text: "One" },
      { day: "2026-08-09", label: "Note", text: "Two" },
      { day: "2026-08-01", label: "Arrived", text: "Three" },
    ],
  });

  renderApp(<LogScreen />);

  expect(await screen.findAllByText("2026-08-09")).toHaveLength(1);
  expect(screen.getByText("2026-08-01")).toBeInTheDocument();
});
