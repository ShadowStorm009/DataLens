import base64
import io
import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
from sqlalchemy.orm import Session

from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.transformation import Transformation
from backend.app.services.dataset_service import DatasetService, dataset_service
from backend.app.core.errors import ResourceNotFoundError, ValidationError
from backend.app.core.config import settings

class ColabNotebookGenerator:
    """
    Generates deterministic, schema-compliant Jupyter Notebooks (.ipynb)
    configured for Google Colab workflows paired with specific DataLens dataset versions.
    The selected dataset version is embedded directly as a self-contained base64 payload,
    allowing zero-setup execution in Google Colab without secondary file uploads.
    """

    def __init__(self, ds_service: Optional[DatasetService] = None):
        self.dataset_service = ds_service or dataset_service

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.strip())
        return clean[:50] or "datalens_export"

    def generate_notebook(
        self,
        db: Session,
        dataset_id: str,
        version_id: str,
    ) -> Tuple[str, str, str]:
        """
        Generate a valid Jupyter Notebook JSON (.ipynb) string with embedded dataset payload.
        Returns: (notebook_json_str, notebook_filename, expected_csv_filename)
        """
        dataset = self.dataset_service.get_dataset(db, dataset_id)
        version = self.dataset_service.get_version(db, version_id)

        if version.dataset_id != dataset_id:
            raise ResourceNotFoundError(f"Version '{version_id}' does not belong to dataset '{dataset_id}'")

        # Read the exact dataframe for this version
        try:
            df = self.dataset_service.storage.read_dataframe(version.storage_reference)
        except Exception as e:
            raise ResourceNotFoundError(f"Underlying storage file for version '{version_id}' could not be read: {str(e)}")

        if df is None:
            df = pd.DataFrame()

        columns = list(df.columns)

        # Convert dataframe to CSV bytes
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_text = csv_buffer.getvalue()
        csv_bytes = csv_text.encode("utf-8")

        # Explicit safe size check for notebook embedding
        max_embed_bytes = settings.MAX_UPLOAD_SIZE_BYTES  # 10 MB default
        if len(csv_bytes) > max_embed_bytes:
            raise ValidationError(
                f"Dataset size ({len(csv_bytes):,} bytes) exceeds the maximum safe notebook embedding limit of "
                f"{max_embed_bytes:,} bytes (10 MB). Please use the separate CSV export and upload workflow in Colab."
            )

        # Encode dataset as base64 payload
        csv_b64 = base64.b64encode(csv_bytes).decode("ascii")

        # Check if version has transformation lineage
        transformation = (
            db.query(Transformation)
            .filter(Transformation.result_version_id == version.id)
            .first()
        )
        if transformation:
            details = f"Cleaned via '{transformation.operation_type}'"
            if transformation.column_name:
                details += f" on column '{transformation.column_name}'"
            details += f" ({transformation.rows_affected} rows affected)"
            transformation_note = details
            version_type = "Cleaned/Transformed"
        else:
            transformation_note = "Original upload (baseline)"
            version_type = "Original Upload"

        safe_name = self._sanitize_filename(dataset.name)
        v_num = version.version_number
        expected_csv_filename = f"{safe_name}_v{v_num}.csv"
        notebook_filename = f"{safe_name}_v{v_num}_colab_starter.ipynb"
        timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        # Build notebook structure with self-contained payload
        cells = self._build_cells(
            dataset_name=dataset.name,
            version_number=v_num,
            version_type=version_type,
            transformation_note=transformation_note,
            expected_csv_filename=expected_csv_filename,
            timestamp_str=timestamp_str,
            row_count=version.row_count,
            column_count=version.column_count,
            columns=columns,
            csv_b64=csv_b64,
        )

        notebook_dict = {
            "cells": cells,
            "metadata": {
                "colab": {
                    "name": notebook_filename,
                    "provenance": [],
                    "toc_visible": True,
                },
                "datalens": {
                    "source": "DataLens Dataset Quality Auditor",
                    "dataset_id": dataset_id,
                    "dataset_name": dataset.name,
                    "version_id": version.id,
                    "version_number": v_num,
                    "version_type": version_type,
                    "expected_rows": version.row_count,
                    "expected_columns": version.column_count,
                    "expected_filename": expected_csv_filename,
                    "exported_at": timestamp_str,
                    "self_contained": True,
                },
                "kernelspec": {
                    "display_name": "Python 3",
                    "name": "python3",
                },
                "language_info": {
                    "name": "python",
                    "version": "3.10.0",
                },
            },
            "nbformat": 4,
            "nbformat_minor": 5,
        }

        notebook_json = json.dumps(notebook_dict, indent=2, ensure_ascii=False)
        return notebook_json, notebook_filename, expected_csv_filename

    def _build_cells(
        self,
        dataset_name: str,
        version_number: int,
        version_type: str,
        transformation_note: str,
        expected_csv_filename: str,
        timestamp_str: str,
        row_count: int,
        column_count: int,
        columns: List[str],
        csv_b64: str,
    ) -> List[Dict[str, Any]]:
        cells = []

        # Helper to construct source lines
        def to_source_lines(text: str) -> List[str]:
            lines = text.split("\n")
            return [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])

        # -------------------------------------------------------------
        # Cell 1: Markdown Title, Provenance & Instructions
        # -------------------------------------------------------------
        intro_md = f"""# 🔍 DataLens Handoff: Dataset Analysis & Machine Learning

**Source Platform:** DataLens Dataset Quality Auditor  
**Dataset:** {dataset_name}  
**Dataset Version:** Version {version_number} ({version_type})  
**Version Details:** {transformation_note}  
**Dimensions:** {row_count:,} rows × {column_count} columns  
**Associated File:** `{expected_csv_filename}`  
**Handoff Generated:** {timestamp_str}  
**Self-Contained Data:** Yes (Exact selected version embedded in Step 1)  

---

### 📋 Workflow Instructions
1. Run **Step 1: Restore Bundled Dataset** below. The dataset is already embedded in this notebook as a self-contained base64 payload. Running Step 1 automatically restores it into an in-memory Pandas DataFrame (`df`). **No separate CSV upload or network connection to DataLens is required!**
2. Run the subsequent cells to inspect descriptive statistics, explore distributions, engineer features, perform train/test splitting, and build predictive ML models.
3. Add your custom model architectures, pipelines, and evaluation metrics in the designated placeholder sections.

> 🔒 **Sensitive Data Notice:** This notebook contains the exact data for `{dataset_name}` (Version {version_number}) embedded inside it. Treat this notebook file with the same privacy and security care as your raw dataset."""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(intro_md),
        })

        # -------------------------------------------------------------
        # Cell 2: Code — Restore Bundled Dataset into Pandas DataFrame
        # -------------------------------------------------------------
        restore_code = f"""# ==============================================================================
# Step 1: Restore Bundled Dataset into Pandas DataFrame
# ==============================================================================
# This notebook is completely self-contained. The exact dataset version exported
# from DataLens has been embedded below as a base64-encoded payload.
# Running this cell restores the data directly into an in-memory DataFrame
# without requiring separate CSV uploads or DataLens server availability.

import base64
import io
import pandas as pd
import numpy as np

# Embedded dataset metadata
DATASET_NAME = "{dataset_name}"
DATASET_VERSION = {version_number}
DATASET_VERSION_TYPE = "{version_type}"
EXPECTED_ROWS = {row_count}
EXPECTED_COLUMNS = {column_count}
ORIGINAL_FILENAME = "{expected_csv_filename}"

# Base64-encoded CSV payload (exact selected dataset version)
EMBEDDED_CSV_B64 = \"\"\"{csv_b64}\"\"\"

# Decode payload into in-memory byte stream and load with Pandas
csv_bytes = base64.b64decode(EMBEDDED_CSV_B64.strip())
if len(csv_bytes) == 0:
    df = pd.DataFrame()
else:
    df = pd.read_csv(io.BytesIO(csv_bytes))

print(f"✓ Successfully restored '{{DATASET_NAME}}' (Version {{DATASET_VERSION}} - {{DATASET_VERSION_TYPE}})")
print(f"✓ Restored Shape: {{df.shape[0]:,}} rows × {{df.shape[1]}} columns")
if df.shape[0] == EXPECTED_ROWS and df.shape[1] == EXPECTED_COLUMNS:
    print("✓ Row and column counts strictly match DataLens export metadata!")
else:
    print(f"⚠️ Note: Restored shape ({{df.shape[0]}}, {{df.shape[1]}}) differs from metadata ({{EXPECTED_ROWS}}, {{EXPECTED_COLUMNS}})")

print("\\nFirst 5 rows:")
display(df.head())"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(restore_code),
        })

        # -------------------------------------------------------------
        # Cell 3: Code — Data Types and Info
        # -------------------------------------------------------------
        step2_code = """# ==============================================================================
# Step 2: Column Information & Inferred Types
# ==============================================================================
print("Column Data Types and Non-Null Counts:")
df.info()"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step2_code),
        })

        # -------------------------------------------------------------
        # Cell 4: Code — Missing Values Breakdown
        # -------------------------------------------------------------
        step3_code = """# ==============================================================================
# Step 3: Missing Values Breakdown
# ==============================================================================
missing_counts = df.isna().sum()
missing_pct = (missing_counts / len(df) * 100).round(2) if len(df) > 0 else missing_counts
missing_summary = pd.DataFrame({"Missing Values": missing_counts, "Percentage (%)": missing_pct})
missing_cols = missing_summary[missing_summary["Missing Values"] > 0]

if not missing_cols.empty:
    print(f"Found {len(missing_cols)} column(s) with missing values:")
    display(missing_cols)
else:
    print("✓ Dataset has 0 missing values detected!")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step3_code),
        })

        # -------------------------------------------------------------
        # Cell 5: Code — Descriptive Statistics
        # -------------------------------------------------------------
        step4_code = """# ==============================================================================
# Step 4: Descriptive Statistics
# ==============================================================================
print("Descriptive Statistics for All Columns:")
df.describe(include="all")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step4_code),
        })

        # -------------------------------------------------------------
        # Cell 6: Markdown — Section 1: Exploratory Data Analysis (EDA)
        # -------------------------------------------------------------
        eda_md = """---
## 1. Exploratory Data Analysis (EDA)

Explore distributions, correlations, class balance, and relationships between features. Add visualizations using `matplotlib`, `seaborn`, or `plotly`."""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(eda_md),
        })

        # -------------------------------------------------------------
        # Cell 7: Code — EDA Placeholder
        # -------------------------------------------------------------
        cols_comment = ", ".join([f"'{c}'" for c in columns[:10]])
        if len(columns) > 10:
            cols_comment += f", ... ({len(columns)} total)"

        eda_code = f"""import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(style="whitegrid")

# Available columns: [{cols_comment}]

# TODO: Add your exploratory visualizations below
# Example: Correlation heatmap for numeric columns
numeric_df = df.select_dtypes(include=[np.number])
if not numeric_df.empty and len(numeric_df.columns) > 1:
    plt.figure(figsize=(10, 6))
    sns.heatmap(numeric_df.corr(), annot=True, cmap="coolwarm", fmt=".2f", linewidths=0.5)
    plt.title("Numeric Feature Correlation Matrix")
    plt.show()

# Example: Distribution of first numeric column
if not numeric_df.empty:
    first_num_col = numeric_df.columns[0]
    plt.figure(figsize=(8, 4))
    sns.histplot(df[first_num_col].dropna(), kde=True, color="#2563eb")
    plt.title(f"Distribution of '{{first_num_col}}'")
    plt.xlabel(first_num_col)
    plt.show()"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(eda_code),
        })

        # -------------------------------------------------------------
        # Cell 8: Markdown — Section 2: Feature Engineering & Preprocessing
        # -------------------------------------------------------------
        feat_md = """---
## 2. Feature Engineering & Preprocessing

Transform raw features into formats suitable for machine learning algorithms. Typical steps:
- Encoding categorical variables (`OneHotEncoder`, `OrdinalEncoder`, `TargetEncoder`)
- Normalization or standardization (`StandardScaler`, `RobustScaler`, `MinMaxScaler`)
- Extracting datetime components (year, month, day of week, hour)
- Creating interaction features or domain ratios
- Handling residual outliers or rare categories"""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(feat_md),
        })

        # -------------------------------------------------------------
        # Cell 9: Code — Feature Engineering Placeholder
        # -------------------------------------------------------------
        feat_code = f"""from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

# Available columns in dataset:
# {columns}

# TODO: Set your target prediction column (e.g., 'target' or label column)
target_column = None  # Replace with your target column name, e.g., '{columns[-1] if columns else "target"}'

if target_column and target_column in df.columns:
    y = df[target_column]
    X = df.drop(columns=[target_column])
    print(f"Target column '{{target_column}}' extracted. Feature matrix shape: {{X.shape}}")
else:
    X = df.copy()
    y = None
    print("Feature matrix created without target variable. Assign target_column above for supervised learning.")

# TODO: Define numeric and categorical feature pipelines below
# numeric_features = X.select_dtypes(include=[np.number]).columns.tolist()
# categorical_features = X.select_dtypes(include=['object', 'category']).columns.tolist()
# preprocessor = ColumnTransformer(
#     transformers=[
#         ('num', StandardScaler(), numeric_features),
#         ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features),
#     ]
# )"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(feat_code),
        })

        # -------------------------------------------------------------
        # Cell 10: Markdown — Section 3: Train / Test Split
        # -------------------------------------------------------------
        split_md = """---
## 3. Train / Test Split

Partition the dataset into training and testing subsets to validate model generalization and detect overfitting. Ensure data splitting occurs **before** any fitting to avoid data leakage."""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(split_md),
        })

        # -------------------------------------------------------------
        # Cell 11: Code — Train / Test Split Placeholder
        # -------------------------------------------------------------
        split_code = """from sklearn.model_selection import train_test_split

# TODO: Execute train/test split once target variable y is defined
if y is not None:
    # Use stratified split for classification tasks if target is discrete
    stratify_target = y if (y.nunique() <= 10 and y.dtype == 'object') else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=stratify_target
    )
    print(f"✓ Train/Test split complete!")
    print(f"  Training samples:   {X_train.shape[0]} ({X_train.shape[0]/len(df):.0%})")
    print(f"  Testing samples:    {X_test.shape[0]} ({X_test.shape[0]/len(df):.0%})")
else:
    print("Notice: Define target_column in Section 2 to run automated train_test_split.")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(split_code),
        })

        # -------------------------------------------------------------
        # Cell 12: Markdown — Section 4: Model Training & Evaluation
        # -------------------------------------------------------------
        model_md = """---
## 4. Model Training & Evaluation

Train candidate machine learning models, tune hyperparameters, and evaluate performance on the held-out test set."""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(model_md),
        })

        # -------------------------------------------------------------
        # Cell 13: Code — Model Training Placeholder
        # -------------------------------------------------------------
        model_code = """# TODO: Select your algorithm (e.g. Scikit-learn, XGBoost, LightGBM)
# from sklearn.ensemble import RandomForestClassifier
# from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix

# Example Baseline Pipeline:
# if y is not None:
#     pipeline = Pipeline(steps=[
#         ('preprocessor', preprocessor),
#         ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))
#     ])
#     pipeline.fit(X_train, y_train)
#     y_pred = pipeline.predict(X_test)
#     print("Model Performance Evaluation:")
#     print(classification_report(y_test, y_pred))
# else:
#     print("Assign target_column in Section 2 to train and evaluate candidate models.")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(model_code),
        })

        return cells

colab_notebook_generator = ColabNotebookGenerator()
