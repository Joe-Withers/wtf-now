import type { ProjectMap } from "../api";

/** The project as a whole: how far along it is, and the groups it's made of. */
export function ProjectPanel({
  map,
  focus,
  onFocus,
}: {
  map: ProjectMap;
  focus: string | null;
  onFocus: (slug: string | null) => void;
}) {
  return (
    <aside className="project-panel" aria-label="Project">
      <div className="panel-stats">
        <h2>Project</h2>
        <span className="panel-figure">{Math.round(map.progress)}%</span>
        <div className="bar">
          <span style={{ width: `${Math.min(100, map.progress)}%` }} />
        </div>
        <span className="meta">
          {map.total} tasks · {map.done} done
        </span>
      </div>

      <div className="panel-categories">
        <h2>Categories</h2>
        <div className="category-list">
          {map.categories.map((category) => (
            <button
              key={category.slug}
              className={`category-row cat-${category.colour}`}
              aria-pressed={focus === category.slug}
              onClick={() => onFocus(focus === category.slug ? null : category.slug)}
            >
              <span className="category-line">
                <span className="category-name">
                  <span className="dot" aria-hidden="true" />
                  {category.title}
                </span>
                <span className="meta">
                  {category.done}/{category.total}
                </span>
              </span>
              <span className="bar">
                <span style={{ width: `${Math.min(100, category.progress)}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
