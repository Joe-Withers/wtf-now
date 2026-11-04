import pytest

from wtf_now import llm
from wtf_now.llm import LLMConfig, LLMConfigError, load_config


@pytest.fixture(autouse=True)
def no_env_file(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm, "load_env", lambda: None)
    for name in ("LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"):
        monkeypatch.delenv(name, raising=False)


def test_load_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "https://example.test")
    monkeypatch.setenv("LLM_API_KEY", "secret")
    monkeypatch.setenv("LLM_MODEL", "some-model")

    assert load_config() == LLMConfig("https://example.test", "secret", "some-model")


def test_load_config_names_missing_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "https://example.test")

    with pytest.raises(LLMConfigError, match="LLM_API_KEY, LLM_MODEL"):
        load_config()


def test_repr_hides_the_key() -> None:
    assert "secret" not in repr(LLMConfig("https://example.test", "secret", "some-model"))
