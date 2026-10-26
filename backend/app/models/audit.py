import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, TYPE_CHECKING
from backend.app.db.base import Base

if TYPE_CHECKING:
    from backend.app.models.dataset import Dataset
    from backend.app.models.version import DatasetVersion

class AuditRun(Base):
    __tablename__ = "audit_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_method_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    serialized_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="audit_runs")
    version: Mapped["DatasetVersion"] = relationship("DatasetVersion", back_populates="audit_runs")
    findings: Mapped[List["Finding"]] = relationship(
        "Finding",
        back_populates="audit_run",
        cascade="all, delete-orphan",
    )

class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    audit_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("audit_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule_id: Mapped[str] = mapped_column(String(100), nullable=False)
    column_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # high, medium, low
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    structured_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded string
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    finding_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Relationship
    audit_run: Mapped["AuditRun"] = relationship("AuditRun", back_populates="findings")
