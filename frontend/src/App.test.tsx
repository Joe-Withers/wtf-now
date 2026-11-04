import { render, screen } from "@testing-library/react";

import { App } from "./App";

test("shows the backend status", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: "ok" }) }),
  );

  render(<App />);

  expect(await screen.findByText("Backend: ok")).toBeInTheDocument();
});
