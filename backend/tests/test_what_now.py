from datetime import date

from wtf_now.bundle import LogDay
from wtf_now.project import build_project
from wtf_now.what_now import home, log_lines, recent_steps, recommendations, suggestions, what_now

from .test_graph import HARD, SOFT
from .test_project import project_from


def slugs(items: list) -> list[str]:
    return [item.slug for item in items]


def test_groups_available_work_by_kind() -> None:
    project = project_from(
        {
            "build-it": "kind: build\n",
            "buy-it": "kind: purchase\n",
            "coming": "kind: purchase\nstate: doing\n",
            "decide-it": "kind: decision\n",
            "research-it": "kind: research\n",
            "finished": "state: done\n",
            "stuck": HARD.format("buy-it"),
        }
    )

    result = what_now(project)

    assert slugs(result.can_do) == ["build-it"]
    assert slugs(result.order_first) == ["buy-it"]
    assert slugs(result.on_its_way) == ["coming"]
    assert slugs(result.decide_first) == ["decide-it", "research-it"]


def test_blocked_purchase_does_not_appear() -> None:
    project = project_from({"choose": "kind: decision\n", "buy": "kind: purchase\n" + HARD.format("choose")})

    assert what_now(project).order_first == []


def test_time_filter_uses_remaining_hours() -> None:
    project = project_from(
        {
            "short": "effort_hours: 2\n",
            "long": "effort_hours: 8\n",
            "nearly-done": "effort_hours: 8\nstate: doing\nprogress: 90\n",
        }
    )

    assert set(slugs(what_now(project, hours=2).can_do)) == {"short", "nearly-done"}


def test_helper_filter() -> None:
    project = project_from({"solo": "", "two-people": "needs_helper: true\n"})

    assert slugs(what_now(project, helper=False).can_do) == ["solo"]
    assert len(what_now(project, helper=True).can_do) == 2


def test_filters_do_not_hide_ordering_or_decisions() -> None:
    project = project_from({"buy": "kind: purchase\neffort_hours: 9\n", "choose": "kind: decision\neffort_hours: 9\n"})

    result = what_now(project, hours=1, helper=False)

    assert slugs(result.order_first) == ["buy"]
    assert slugs(result.decide_first) == ["choose"]


def test_soft_dependency_shows_as_a_warning() -> None:
    project = project_from({"first": "", "second": SOFT.format("first")})

    item = next(item for item in what_now(project).can_do if item.slug == "second")

    assert item.easier_after == ["first"]


def test_ranking_prefers_fit_then_in_progress_then_unlocking() -> None:
    project = project_from(
        {
            "too-long": "effort_hours: 20\nstate: doing\nprogress: 1\n",
            "started": "effort_hours: 1\nstate: doing\nprogress: 50\n",
            "key": "effort_hours: 1\n",
            "minor": "effort_hours: 1\n",
            "after-key": "effort_hours: 5\n" + HARD.format("key"),
        }
    )

    assert slugs(suggestions(project, hours=3)) == ["started", "key", "minor"]


def test_suggestions_fall_back_to_longer_jobs() -> None:
    project = project_from({"long": "effort_hours: 20\n"})

    assert slugs(suggestions(project, hours=1)) == ["long"]


def test_suggestions_are_limited_and_deterministic() -> None:
    project = project_from({f"task-{n}": "" for n in range(6)})

    first = slugs(suggestions(project))

    assert first == ["task-0", "task-1", "task-2"]
    assert first == slugs(suggestions(project))


def test_log_lines_strip_links_and_split_labels() -> None:
    days = [LogDay(date(2026, 11, 4), ["**Progress**: [Wire board](/tasks/wire.md) is at 40%", "free text"])]

    lines = log_lines(days)

    assert (lines[0].label, lines[0].text) == ("Progress", "Wire board is at 40%")
    assert (lines[1].label, lines[1].text) == ("", "free text")
    assert lines[0].task == "wire"
    assert lines[1].task is None


def test_recent_steps_are_the_last_tasks_the_log_mentions() -> None:
    project = project_from({"wire": "state: doing\n", "battery": "kind: purchase\n"})
    log = [
        LogDay(
            date(2026, 11, 4),
            [
                "**Ordered**: [Battery](/tasks/battery.md)",
                "**Progress**: [Wire](/tasks/wire.md) is at 40%",
                "**Note**: [Prices](/notes/prices.md)",
            ],
        ),
        LogDay(date(2026, 8, 9), ["**Finished**: [Gone](/tasks/gone.md)"]),
    ]

    steps = recent_steps(project, log)

    assert slugs(steps) == ["battery", "wire"]
    assert steps[0].label == "Ordered"
    assert steps[0].title == "battery"
    assert steps[0].day == date(2026, 11, 4)
    assert steps[1].state == "doing"


def test_recent_steps_only_mention_a_task_once() -> None:
    project = project_from({"wire": ""})
    log = [LogDay(date(2026, 11, 4), ["**Progress**: [Wire](/tasks/wire.md) is at 40%", "**Finished**: [Wire](/tasks/wire.md)"])]

    assert slugs(recent_steps(project, log)) == ["wire"]


def test_what_now_carries_the_recent_steps() -> None:
    project = project_from({"wire": ""})
    log = [LogDay(date(2026, 11, 4), ["**Finished**: [Wire](/tasks/wire.md)"])]

    assert slugs(what_now(project, log=log).recent) == ["wire"]


def test_home_summarises_the_position_after_time_away() -> None:
    project = project_from(
        {
            "wire": "state: doing\nprogress: 40\n",
            "battery": "kind: purchase\nstate: doing\n",
            "bolts": "kind: purchase\nstate: done\n",
        }
    )
    log = [
        LogDay(date(2026, 8, 9), ["**Progress**: wire"]),
        LogDay(date(2026, 8, 1), ["**Arrived**: [Bolts](/tasks/bolts.md)"]),
    ]

    result = home(project, log, today=date(2026, 11, 4))

    assert result.last_activity == date(2026, 8, 9)
    assert result.days_away == 87
    assert [line.text for line in result.last_session] == ["wire"]
    assert slugs(result.in_progress) == ["wire"]
    assert slugs(result.on_order) == ["battery"]
    assert [line.text for line in result.arrived] == ["Bolts"]
    assert slugs(result.suggestions) == ["wire"]


def test_home_for_an_empty_project() -> None:
    result = home(build_project([]), [], today=date(2026, 11, 4))

    assert result.last_activity is None and result.days_away is None
    assert result.overall_progress == 0


def test_recommendations_fall_back_to_the_ranking_when_none_are_set() -> None:
    project = project_from({"a": "kind: build\n", "b": "kind: build\nstate: doing\n", "c": "kind: build\n"})

    first, more = recommendations(project)

    assert first == "b"  # already underway ranks first
    assert more == ["a", "c"]


def test_the_ais_picks_stand_while_they_are_possible_and_lapse_when_not() -> None:
    project = project_from(
        {
            "a": "kind: build\nrecommended: next\n",
            "b": "kind: build\nrecommended: also\n",
            "c": "kind: build\nstate: doing\n",
        }
    )
    assert recommendations(project) == ("a", ["b"])

    finished = project_from({"a": "kind: build\nstate: done\nrecommended: next\n", "b": "kind: build\n", "c": "kind: build\nstate: doing\n"})
    assert recommendations(finished)[0] == "c"  # the pick is done, so the ranking decides
