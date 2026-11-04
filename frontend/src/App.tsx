import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Placeholder } from "./screens/Placeholder";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Placeholder title="Home" />} />
            <Route path="what-now" element={<Placeholder title="What now?" />} />
            <Route path="chat" element={<Placeholder title="Chat" />} />
            <Route path="tasks" element={<Placeholder title="Tasks" />} />
            <Route path="more" element={<Placeholder title="More" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
