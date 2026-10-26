import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING
from backend.app.db.base import Base

if TYPE_CHECKING:
    from backend.app.models.dataset import Dataset
    from backend.app.models.version import DatasetVersion

class Transformation(Base):
    __tablename__ = "transformations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    result_version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    operation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    column_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    parameters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded parameters
    rows_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cells_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="transformations")
    source_version: Mapped["DatasetVersion"] = relationship(
        "DatasetVersion",
        foreign_keys=[source_version_id],
    )
    result_version: Mapped["DatasetVersion"] = relationship(
        "DatasetVersion",
        foreign_keys=[result_version_id],
    )
