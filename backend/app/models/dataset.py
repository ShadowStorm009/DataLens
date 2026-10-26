import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, TYPE_CHECKING
from backend.app.db.base import Base

if TYPE_CHECKING:
    from backend.app.models.version import DatasetVersion
    from backend.app.models.audit import AuditRun
    from backend.app.models.transformation import Transformation

class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="ready")
    storage_reference: Mapped[str] = mapped_column(String(255), nullable=False)

    # Relationships with cascading deletion
    versions: Mapped[List["DatasetVersion"]] = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="DatasetVersion.version_number",
    )
    audit_runs: Mapped[List["AuditRun"]] = relationship(
        "AuditRun",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    transformations: Mapped[List["Transformation"]] = relationship(
        "Transformation",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
