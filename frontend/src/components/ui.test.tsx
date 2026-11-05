import { render, screen } from "@testing-library/react";

import { Pill, ScreenHead, Wordmark } from "./ui";

test("a task's state reads the same everywhere", () => {
  render(
    <>
      <Pill state="todo" />
      <Pill state="doing" />
      <Pill state="done" />
    </>,
  );

  expect(screen.getByText("Not started")).toBeInTheDocument();
  expect(screen.getByText("Underway")).toBeInTheDocument();
  expect(screen.getByText("Done")).toBeInTheDocument();
});

test("a purchase speaks in ordering language", () => {
  render(<Pill state="doing" kind="purchase" />);

  expect(screen.getByText("On order")).toBeInTheDocument();
});

test("a screen header carries the title and the one thing to do next", () => {
  render(
    <ScreenHead title={<Wordmark />} action={<a href="/chat">Tell it →</a>} />,
  );

  expect(screen.getByRole("heading")).toHaveTextContent("wtf-now");
  expect(screen.getByRole("link", { name: "Tell it →" })).toHaveAttribute("href", "/chat");
});
