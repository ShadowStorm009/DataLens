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
from backend.app.core.errors import ResourceNotFoundError

class ColabNotebookGenerator:
    """
    Generates deterministic, schema-compliant Jupyter Notebooks (.ipynb)
    configured for Google Colab workflows paired with specific DataLens dataset versions.
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
        Generate a valid Jupyter Notebook JSON (.ipynb) string and filenames.
        Returns: (notebook_json_str, notebook_filename, expected_csv_filename)
        """
        dataset = self.dataset_service.get_dataset(db, dataset_id)
        version = self.dataset_service.get_version(db, version_id)

        if version.dataset_id != dataset_id:
            raise ResourceNotFoundError(f"Version '{version_id}' does not belong to dataset '{dataset_id}'")

        # Read column names safely
        try:
            df = self.dataset_service.storage.read_dataframe(version.storage_reference)
            columns = list(df.columns) if df is not None else []
        except Exception:
            columns = []

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
        else:
            transformation_note = "Original upload (baseline)"


        safe_name = self._sanitize_filename(dataset.name)
        v_num = version.version_number
        expected_csv_filename = f"{safe_name}_v{v_num}.csv"
        notebook_filename = f"{safe_name}_v{v_num}_colab_starter.ipynb"
        timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        # Build notebook structure
        cells = self._build_cells(
            dataset_name=dataset.name,
            version_number=v_num,
            version_type="Cleaned/Transformed" if version.parent_version_id else "Original Upload",
            transformation_note=transformation_note,
            expected_csv_filename=expected_csv_filename,
            timestamp_str=timestamp_str,
            row_count=version.row_count,
            column_count=version.column_count,
            columns=columns,
        )

        notebook_dict = {
            "cells": cells,
            "metadata": {
                "colab": {
                    "name": notebook_filename,
                    "provenance": [],
                    "toc_visible": True,
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
    ) -> List[Dict[str, Any]]:
        cells = []

        # Helper to construct source lines
        def to_source_lines(text: str) -> List[str]:
            lines = text.split("\n")
            return [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])

        # -------------------------------------------------------------
        # Cell 1: Markdown Title & Instructions
        # -------------------------------------------------------------
        intro_md = f"""# 🔍 DataLens Handoff: Dataset Analysis & Machine Learning

**Source Platform:** DataLens Dataset Quality Auditor  
**Dataset:** {dataset_name}  
**Dataset Version:** Version {version_number} ({version_type})  
**Version Details:** {transformation_note}  
**Dimensions:** {row_count:,} rows × {column_count} columns  
**Expected Data File:** `{expected_csv_filename}`  
**Handoff Generated:** {timestamp_str}  

---

### 📋 Workflow Instructions
1. Run **Step 1: Upload Dataset CSV** below.
2. When prompted by `google.colab.files.upload()`, select and upload `{expected_csv_filename}` exported from DataLens.
3. Run the subsequent cells to load the DataFrame, inspect descriptive statistics, explore distributions, engineer features, perform train/test splitting, and build predictive ML models.
4. Add your custom model architectures, pipelines, and evaluation metrics in the designated placeholder sections."""

        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": to_source_lines(intro_md),
        })

        # -------------------------------------------------------------
        # Cell 2: Code — Colab CSV File Upload
        # -------------------------------------------------------------
        step1_code = f"""# ==============================================================================
# Step 1: Upload Dataset CSV to Google Colab
# ==============================================================================
# Run this cell and select your exported CSV: '{expected_csv_filename}'
from google.colab import files
import io

print("Please select and upload '{expected_csv_filename}' (or matching DataLens CSV):")
uploaded = files.upload()"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step1_code),
        })

        # -------------------------------------------------------------
        # Cell 3: Code — Load CSV into Pandas DataFrame
        # -------------------------------------------------------------
        step2_code = f"""# ==============================================================================
# Step 2: Load Uploaded CSV into Pandas DataFrame
# ==============================================================================
import pandas as pd
import numpy as np

expected_filename = "{expected_csv_filename}"

if expected_filename in uploaded:
    csv_bytes = uploaded[expected_filename]
    df = pd.read_csv(io.BytesIO(csv_bytes))
    print(f"✓ Successfully loaded '{{expected_filename}}' ({{len(df)}} rows, {{len(df.columns)}} columns)!")
elif len(uploaded) > 0:
    # Fallback to the first uploaded CSV file
    first_csv = next((k for k in uploaded.keys() if k.endswith('.csv')), list(uploaded.keys())[0])
    df = pd.read_csv(io.BytesIO(uploaded[first_csv]))
    print(f"✓ Loaded uploaded file '{{first_csv}}' ({{len(df)}} rows, {{len(df.columns)}} columns)!")
else:
    raise FileNotFoundError("No file was uploaded. Please re-run Step 1 to upload your CSV.")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step2_code),
        })

        # -------------------------------------------------------------
        # Cell 4: Code — First Rows & Shape Inspection
        # -------------------------------------------------------------
        step3_code = """# ==============================================================================
# Step 3: Initial Dataset Overview & Dimensions
# ==============================================================================
print(f"Dataset Shape: {df.shape[0]} rows × {df.shape[1]} columns\\n")
print("First 5 rows:")
df.head()"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step3_code),
        })

        # -------------------------------------------------------------
        # Cell 5: Code — Data Types and Info
        # -------------------------------------------------------------
        step4_code = """# ==============================================================================
# Step 4: Column Information & Inferred Types
# ==============================================================================
print("Column Data Types and Non-Null Counts:")
df.info()"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step4_code),
        })

        # -------------------------------------------------------------
        # Cell 6: Code — Missing Values Breakdown
        # -------------------------------------------------------------
        step5_code = """# ==============================================================================
# Step 5: Missing Values Breakdown
# ==============================================================================
missing_counts = df.isna().sum()
missing_pct = (missing_counts / len(df) * 100).round(2)
missing_summary = pd.DataFrame({"Missing Values": missing_counts, "Percentage (%)": missing_pct})
missing_cols = missing_summary[missing_summary["Missing Values"] > 0]

if not missing_cols.empty:
    print(f"Found {len(missing_cols)} column(s) with missing values:")
    display(missing_cols)
else:
    print("✓ Dataset is clean: 0 missing values detected!")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step5_code),
        })

        # -------------------------------------------------------------
        # Cell 7: Code — Descriptive Statistics
        # -------------------------------------------------------------
        step6_code = """# ==============================================================================
# Step 6: Descriptive Statistics
# ==============================================================================
print("Descriptive Statistics for All Columns:")
df.describe(include="all")"""

        cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": to_source_lines(step6_code),
        })

        # -------------------------------------------------------------
        # Cell 8: Markdown — Section 1: Exploratory Data Analysis (EDA)
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
        # Cell 9: Code — EDA Placeholder
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
        # Cell 10: Markdown — Section 2: Feature Engineering & Preprocessing
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
        # Cell 11: Code — Feature Engineering Placeholder
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
        # Cell 12: Markdown — Section 3: Train / Test Split
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
        # Cell 13: Code — Train / Test Split Placeholder
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
        # Cell 14: Markdown — Section 4: Model Training & Evaluation
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
        # Cell 15: Code — Model Training Placeholder
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
