"""Structural changes the AI has proposed, waiting for the owner's decision."""

import json
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .bundle import write_text_atomic
from .store import OWNER, ChangeRejected, Op, Store
from .views import NotFound

PENDING = "pending"
APPLIED = "applied"
REJECTED = "rejected"
FAILED = "failed"


@dataclass
class Proposal:
    id: str
    session_id: str
    summary: str
    changes: list[dict[str, Any]]  # {"operation": name, "args": {...}}
    descriptions: list[str]
    status: str = PENDING
    change_id: str | None = None
    error: str | None = None

    def ops(self) -> list[Op]:
        return [Op(change["operation"], change["args"]) for change in self.changes]


@dataclass
class ProposalStore:
    root: Path
    store: Store
    actor: str = field(default=OWNER)

    def _path(self, proposal_id: str) -> Path:
        return self.root / f"{Path(proposal_id).name}.json"

    def _save(self, proposal: Proposal) -> None:
        write_text_atomic(self._path(proposal.id), json.dumps(asdict(proposal), indent=2))

    def create(
        self, session_id: str, summary: str, changes: list[dict[str, Any]], descriptions: list[str]
    ) -> Proposal:
        proposal = Proposal(uuid.uuid4().hex, session_id, summary, changes, descriptions)
        self._save(proposal)
        return proposal

    def get(self, proposal_id: str) -> Proposal:
        path = self._path(proposal_id)
        if not path.exists():
            raise NotFound(f"No proposal {proposal_id!r}")
        return Proposal(**json.loads(path.read_text(encoding="utf-8")))

    def pending(self) -> list[Proposal]:
        found = [self.get(path.stem) for path in sorted(self.root.glob("*.json"))]
        return [proposal for proposal in found if proposal.status == PENDING]

    def _require_pending(self, proposal_id: str) -> Proposal:
        proposal = self.get(proposal_id)
        if proposal.status != PENDING:
            raise ChangeRejected(f"That proposal is already {proposal.status}")
        return proposal

    def approve(self, proposal_id: str) -> Proposal:
        """Applies a proposal. It's validated again, because things may have changed since."""
        proposal = self._require_pending(proposal_id)
        try:
            change, _ = self.store.apply(proposal.ops(), actor=self.actor, summary=proposal.summary)
        except ChangeRejected as error:
            proposal.status, proposal.error = FAILED, str(error)
            self._save(proposal)
            raise
        proposal.status, proposal.change_id = APPLIED, change.id
        self._save(proposal)
        return proposal

    def reject(self, proposal_id: str) -> Proposal:
        proposal = self._require_pending(proposal_id)
        proposal.status = REJECTED
        self._save(proposal)
        return proposal
