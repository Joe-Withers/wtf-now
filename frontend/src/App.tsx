import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Chat } from "./screens/Chat";
import { Home } from "./screens/Home";
import { Placeholder } from "./screens/Placeholder";
import { WhatNowScreen } from "./screens/WhatNowScreen";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="what-now" element={<WhatNowScreen />} />
            <Route path="chat" element={<Chat />} />
            <Route path="tasks" element={<Placeholder title="Tasks" />} />
            <Route path="more" element={<Placeholder title="More" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
