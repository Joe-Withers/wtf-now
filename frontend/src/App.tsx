import { useEffect, useState } from "react";

export function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main>
      <h1>wtf-now</h1>
      <p>Backend: {status}</p>
    </main>
  );
}
