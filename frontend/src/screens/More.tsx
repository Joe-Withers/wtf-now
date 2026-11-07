import { useQuery } from "@tanstack/react-query";

import { getJson, type Problem } from "../api";
import { ScreenHead } from "../components/ui";

export function More() {
  const problems = useQuery({ queryKey: ["problems"], queryFn: () => getJson<Problem[]>("/problems") });

  return (
    <main className="screen">
      <ScreenHead title="More" />
      {problems.data && problems.data.length > 0 && (
        <section className="section">
          <h2>Problems in the project files</h2>
          {problems.data.map((problem) => (
            <div key={`${problem.path}${problem.message}`} className="meta warn">
              {problem.path}: {problem.message}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
