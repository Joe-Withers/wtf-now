"""Creates a made-up van conversion for development. It is not a real project.

Run from backend/ with: uv run python scripts/seed_example.py [target]

Writes through the store, so the bundle has real history, with the last
work three months ago. Refuses to touch a bundle that already has tasks.
"""

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from wtf_now.config import bundle_path
from wtf_now.store import Op, Store

AWAY_DAYS = 87


def task(title: str, slug: str, parent: str | None = None, **fields) -> Op:
    return Op("create_task", {"title": title, "slug": slug, "parent": parent, **fields})


def needs(*slugs: str) -> list[dict[str, str]]:
    return [{"task": slug, "strength": "hard"} for slug in slugs]


def easier_after(slug: str) -> dict[str, str]:
    return {"task": slug, "strength": "soft"}


LAYOUT = Op(
    "write_layout",
    {
        "title": "Van plan",
        "slug": "van-plan",
        "zones": [
            {"id": "ceiling", "title": "Ceiling", "x": 10, "y": 10, "width": 580, "height": 40},
            {"id": "left-wall", "title": "Left wall", "x": 10, "y": 60, "width": 580, "height": 30},
            {"id": "rear-cabinet", "title": "Rear cabinet", "x": 10, "y": 100, "width": 120, "height": 100},
            {"id": "bed", "title": "Bed", "x": 140, "y": 100, "width": 200, "height": 100},
            {"id": "kitchen", "title": "Kitchen", "x": 350, "y": 100, "width": 140, "height": 100},
            {"id": "floor", "title": "Floor", "x": 500, "y": 100, "width": 90, "height": 100},
            {"id": "right-wall", "title": "Right wall", "x": 10, "y": 210, "width": 580, "height": 30},
        ],
    },
)

PLAN = [
    LAYOUT,
    task("Floor", "floor", description="Everything from the bare metal to the finished floor."),
    task("Clean and treat rust", "floor-rust", "floor", effort_hours=3, zone="floor"),
    task("Lay battens and insulation", "floor-insulation", "floor", effort_hours=5, zone="floor", depends_on=needs("floor-rust")),
    task("Lay ply subfloor", "floor-ply", "floor", effort_hours=4, zone="floor", needs_helper=True, depends_on=needs("floor-insulation")),
    task("Insulation", "insulation", description="Walls and ceiling."),
    task("Order 50mm PIR board", "buy-pir", "insulation", kind="purchase", cost=240, effort_hours=0.5),
    task("Choose a vapour barrier", "decide-vapour-barrier", "insulation", kind="decision", effort_hours=1),
    task("Insulate the left wall", "insulate-left", "insulation", effort_hours=6, zone="left-wall", depends_on=needs("buy-pir", "decide-vapour-barrier")),
    task("Insulate the right wall", "insulate-right", "insulation", effort_hours=6, zone="right-wall", depends_on=needs("buy-pir", "decide-vapour-barrier")),
    task("Insulate the ceiling", "insulate-ceiling", "insulation", effort_hours=5, zone="ceiling", needs_helper=True, depends_on=needs("buy-pir", "decide-vapour-barrier", "cut-roof-vent")),
    task("Roof", "roof", description="Everything that goes through or on the roof."),
    task("Order the roof vent", "buy-vent", "roof", kind="purchase", cost=180, effort_hours=0.5),
    task("Cut the hole and fit the roof vent", "cut-roof-vent", "roof", effort_hours=4, zone="ceiling", needs_helper=True, depends_on=needs("buy-vent")),
    task("Fit solar panels to the roof", "fit-solar", "roof", effort_hours=5, needs_helper=True, depends_on=needs("buy-solar")),
    task("Order solar panels", "buy-solar", "roof", kind="purchase", cost=320, effort_hours=0.5),
    task("Electrics", "electrics", description="Leisure battery, charging and 12V."),
    task("Choose lithium or AGM", "decide-battery", "electrics", kind="decision", effort_hours=2),
    task("Order the leisure battery", "buy-battery", "electrics", kind="purchase", cost=450, effort_hours=0.5, depends_on=needs("decide-battery")),
    task("How should the fridge be vented?", "research-fridge-vent", "electrics", kind="research", effort_hours=1),
    task("Electronics board", "electrics-board", "electrics", description="MPPT, inverter and fuses on one ply board."),
    task("Mount components on ply", "board-mount", "electrics-board", effort_hours=2, zone="rear-cabinet"),
    task("Wire the board internally", "board-wire", "electrics-board", effort_hours=4, zone="rear-cabinet", depends_on=needs("board-mount")),
    task("Connect the battery", "board-battery", "electrics-board", effort_hours=2, zone="rear-cabinet", depends_on=needs("board-wire", "buy-battery")),
    task("Connect the solar", "board-solar", "electrics-board", effort_hours=2, zone="rear-cabinet", depends_on=needs("board-wire", "fit-solar")),
    task("Run cables along the left wall", "cables-left", "electrics", effort_hours=3, zone="left-wall", depends_on=[easier_after("insulate-left")]),
    task("Interior", "interior", description="Furniture and finishes."),
    task("Order wall panels", "buy-panels", "interior", kind="purchase", cost=160, effort_hours=0.5),
    task("Clad the walls", "clad-walls", "interior", effort_hours=10, closes_zone="left-wall", zone="left-wall", depends_on=needs("insulate-left", "insulate-right", "cables-left", "buy-panels")),
    task("Build the rear cabinet frame", "cabinet-frame", "interior", effort_hours=8, zone="rear-cabinet", closes_zone="rear-cabinet", depends_on=needs("floor-ply", "board-mount")),
    task("Build the bed frame", "bed-frame", "interior", effort_hours=8, zone="bed", depends_on=needs("floor-ply")),
    task("Fit the kitchen unit", "kitchen", "interior", effort_hours=12, zone="kitchen", depends_on=needs("floor-ply", "research-fridge-vent")),
    task("Fit the fridge", "fridge", "interior", effort_hours=2, zone="kitchen", needs_helper=True, depends_on=needs("kitchen", "board-battery")),
]

CURRENT_STATES = {
    "board-wire": "Fuse block and MPPT are wired. Inverter cables are cut and crimped, not connected. They're in the blue box under the bench.",
    "floor-insulation": "Battens are down on the front half. Rear half still bare; the offcuts are stacked against the wheel arch.",
}

NOTES = [
    Op("write_note", {"title": "Inventory", "slug": "inventory", "type": "Inventory", "body": "## Tools\n\n- Jigsaw\n- Cordless drill\n- Crimping tool, up to 50mm²\n- Hole saw set\n\n## Stock\n\n- About 2 sheets of 9mm ply\n- 50 M6 bolts\n- Roll of sound deadening\n"}),
    Op("write_note", {"title": "Ceiling height", "slug": "ceiling-height", "type": "Measurement", "description": "Internal height at the centre line.", "body": "1420mm at the centre line, measured from the ply subfloor position.\n"}),
    Op("write_note", {"title": "PIR board prices", "slug": "pir-prices", "type": "Research", "description": "Prices seen for 50mm PIR.", "stale_after": "2026-09-01T00:00:00+00:00", "body": "About £24 a sheet at the builders' merchant, with delivery extra.\n"}),
    Op("write_note", {"title": "Lithium vs AGM", "slug": "lithium-vs-agm", "type": "Research", "description": "Early research on the leisure battery.", "body": "Lithium costs about twice as much but gives roughly double the usable capacity at half the weight. Leaning lithium.\n"}),
]


def main() -> None:
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else bundle_path()
    clock = [datetime.now(UTC) - timedelta(days=AWAY_DAYS + 30)]
    store = Store(target, clock=lambda: clock[0])
    store.initialise()
    if store.project.tasks:
        raise SystemExit(f"{target} already has tasks; not touching it")

    def on(days_ago: int, *ops: Op) -> None:
        clock[0] = datetime.now(UTC) - timedelta(days=AWAY_DAYS + days_ago)
        store.apply(list(ops), actor="human:owner")

    on(30, *PLAN)
    on(29, *NOTES)
    on(21, Op("set_state", {"slug": "floor-rust", "state": "done"}))
    on(14, Op("set_state", {"slug": "buy-vent", "state": "doing"}))
    on(12, Op("set_state", {"slug": "buy-vent", "state": "done"}))
    on(9, Op("set_state", {"slug": "board-mount", "state": "done"}))
    on(
        3,
        Op("set_progress", {"slug": "floor-insulation", "progress": 45, "reason": "Battens down on the front half"}),
        Op("update_current_state", {"slug": "floor-insulation", "text": CURRENT_STATES["floor-insulation"]}),
    )
    on(1, Op("set_state", {"slug": "buy-pir", "state": "doing"}))
    on(
        0,
        Op("set_progress", {"slug": "board-wire", "progress": 60, "reason": "Fuse block and MPPT wired, inverter still to connect"}),
        Op("update_current_state", {"slug": "board-wire", "text": CURRENT_STATES["board-wire"]}),
    )

    print(f"Seeded {len(store.project.tasks)} tasks in {target}")
    for problem in store.project.problems:
        print(f"PROBLEM {problem.path}: {problem.message}")


if __name__ == "__main__":
    main()
