import json
import io
import re
import base64
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from backend.app.services.dataset_service import dataset_service
from backend.app.services.colab_notebook import colab_notebook_generator
from backend.app.services.cleaner import TransformationEngine
from backend.app.core.errors import ResourceNotFoundError, ValidationError
from backend.app.core.config import settings

def _extract_embedded_b64(notebook_json_str: str) -> str:
    """Helper to extract the base64 CSV string from the generated notebook cells."""
    nb = json.loads(notebook_json_str)
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            source = "".join(cell.get("source", []))
            match = re.search(r'EMBEDDED_CSV_B64\s*=\s*"""(.*?)"""', source, re.DOTALL)
            if match:
                return match.group(1).strip()
    raise ValueError("EMBEDDED_CSV_B64 payload not found in notebook code cells")


def test_colab_notebook_schema_and_structure(db_session, isolated_storage):
    """
    Verify that generated Colab starter notebook complies with Jupyter notebook v4.5 schema,
    contains the embedded dataset payload, decodes cleanly into a DataFrame, and requires
    no separate CSV upload prompt.
    """
    csv_bytes = b"id,age,salary,department\n1,25,50000,Astronaut\n2,30,65000,Neurosurgeon\n3,35,80000,Pilot\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Tech Salaries 2026",
        original_filename="tech_salaries.csv",
        content=csv_bytes,
        row_count=3,
        column_count=4,
    )
    v1_id = dataset.current_version_id

    notebook_json_str, nb_filename, expected_csv = colab_notebook_generator.generate_notebook(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
    )

    # 1. Filename ends in .ipynb
    assert nb_filename.endswith(".ipynb")
    assert nb_filename == "Tech_Salaries_2026_v1_colab_starter.ipynb"
    assert expected_csv == "Tech_Salaries_2026_v1.csv"

    # 2. Valid JSON
    nb_data = json.loads(notebook_json_str)
    assert isinstance(nb_data, dict)

    # 3. Notebook schema compliance (nbformat 4.5)
    assert nb_data.get("nbformat") == 4
    assert nb_data.get("nbformat_minor") == 5
    assert "cells" in nb_data
    assert "metadata" in nb_data
    assert nb_data["metadata"]["kernelspec"]["name"] == "python3"
    assert nb_data["metadata"]["language_info"]["name"] == "python"

    # Metadata checks
    dl_meta = nb_data["metadata"].get("datalens", {})
    assert dl_meta.get("self_contained") is True
    assert dl_meta.get("dataset_name") == "Tech Salaries 2026"
    assert dl_meta.get("version_number") == 1
    assert dl_meta.get("expected_rows") == 3
    assert dl_meta.get("expected_columns") == 4

    cells = nb_data["cells"]
    assert len(cells) >= 12

    # 4. Invariant checks for code cells: unexecuted, outputs empty
    for cell in cells:
        assert "cell_type" in cell
        assert "source" in cell
        if cell["cell_type"] == "code":
            assert cell.get("execution_count") is None
            assert cell.get("outputs") == []

    # 5. Verify all required sections and verify NO separate CSV upload prompt is present
    all_text = ""
    for cell in cells:
        all_text += "".join(cell["source"]) + "\n"

    # Title & instructions
    assert "DataLens Handoff: Dataset Analysis & Machine Learning" in all_text
    assert "Tech Salaries 2026" in all_text
    assert "Version 1 (Original Upload)" in all_text

    # No separate CSV upload step
    assert "files.upload()" not in all_text

    # Self-contained payload restoring code
    assert "base64.b64decode" in all_text
    assert "pd.read_csv" in all_text
    assert "df.head()" in all_text
    assert "df.info()" in all_text
    assert "df.describe(" in all_text

    # Required placeholder sections
    assert "Exploratory Data Analysis" in all_text
    assert "Feature Engineering" in all_text
    assert "Train / Test Split" in all_text
    assert "Model Training" in all_text

    # 6. Extract and decode the embedded dataset payload
    raw_b64 = _extract_embedded_b64(notebook_json_str)
    decoded_bytes = base64.b64decode(raw_b64)
    df_restored = pd.read_csv(io.BytesIO(decoded_bytes))

    # Verify exact match with selected dataset
    assert len(df_restored) == 3
    assert list(df_restored.columns) == ["id", "age", "salary", "department"]
    assert "Astronaut" in df_restored["department"].values
    assert "Neurosurgeon" in df_restored["department"].values
    assert "Pilot" in df_restored["department"].values
    assert df_restored["salary"].tolist() == [50000, 65000, 80000]

    # 7. Privacy & Security: no server filesystem paths or secrets embedded
    assert "/home/" not in all_text
    assert "/tmp/" not in all_text
    assert "password" not in all_text.lower()
    assert "secret" not in all_text.lower()


def test_colab_notebook_version_parity(db_session, isolated_storage):
    """
    Verify that notebooks generated for different versions (v1 vs v2)
    properly embed their respective distinct data payloads.
    """
    csv_bytes = b"id,val\n1,10\n1,10\n2,20\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Parity Dataset",
        original_filename="parity.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    # Create v2 via duplicate removal transformation
    df_v1 = dataset_service.storage.read_dataframe(dataset_service.get_version(db_session, v1_id).storage_reference)
    res = TransformationEngine.transform(df=df_v1, operation_type="remove_duplicates")
    v2_version = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=res.df,
        row_count=len(res.df),
        column_count=len(res.df.columns),
    )
    dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v1_id,
        result_version_id=v2_version.id,
        operation_type="remove_duplicates",
        parameters={},
        rows_affected=1,
        cells_affected=2,
    )
    v2_id = v2_version.id

    # Generate v1 notebook
    nb_v1_str, fn_v1, csv_v1 = colab_notebook_generator.generate_notebook(db_session, dataset.id, v1_id)
    assert fn_v1.endswith(".ipynb")
    assert fn_v1 == "Parity_Dataset_v1_colab_starter.ipynb"

    # Generate v2 notebook
    nb_v2_str, fn_v2, csv_v2 = colab_notebook_generator.generate_notebook(db_session, dataset.id, v2_id)
    assert fn_v2.endswith(".ipynb")
    assert fn_v2 == "Parity_Dataset_v2_colab_starter.ipynb"

    # Decode embedded payloads for each version
    b64_v1 = _extract_embedded_b64(nb_v1_str)
    b64_v2 = _extract_embedded_b64(nb_v2_str)

    df_restored_v1 = pd.read_csv(io.BytesIO(base64.b64decode(b64_v1)))
    df_restored_v2 = pd.read_csv(io.BytesIO(base64.b64decode(b64_v2)))

    # Exact version integrity: v1 has 3 rows (duplicate preserved), v2 has 2 rows (cleaned)
    assert len(df_restored_v1) == 3
    assert len(df_restored_v2) == 2
    assert b64_v1 != b64_v2


def test_colab_notebook_endpoint_by_version(client: TestClient):
    """
    Test GET /api/v1/datasets/{dataset_id}/versions/{version_id}/colab-notebook.
    Verifies MIME type, .ipynb Content-Disposition, and decodable embedded dataset.
    """
    csv_content = b"colA,colB\n10,20\n30,40\n"
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("colab_test.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert res.status_code == 201
    dataset_id = res.json()["id"]
    version_id = res.json()["current_version_id"]

    # Request notebook via version route
    nb_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/colab-notebook")
    assert nb_res.status_code == 200
    assert "application/x-ipynb+json" in nb_res.headers["content-type"]
    assert 'attachment; filename="colab_test_v1_colab_starter.ipynb"' in nb_res.headers["content-disposition"]
    assert nb_res.headers["content-disposition"].endswith('.ipynb"')

    # Verify JSON structure
    nb_json = nb_res.json()
    assert nb_json["nbformat"] == 4
    assert len(nb_json["cells"]) > 0

    # Verify embedded payload decodes into exact dataset
    raw_b64 = _extract_embedded_b64(json.dumps(nb_json))
    df = pd.read_csv(io.BytesIO(base64.b64decode(raw_b64)))
    assert df.shape == (2, 2)
    assert df["colA"].tolist() == [10, 30]
    assert df["colB"].tolist() == [20, 40]


def test_colab_notebook_endpoint_current_version(client: TestClient):
    """
    Test GET /api/v1/datasets/{dataset_id}/colab-notebook (current active version).
    """
    csv_content = b"x,y\n1,2\n"
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("current_colab.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert res.status_code == 201
    dataset_id = res.json()["id"]

    nb_res = client.get(f"/api/v1/datasets/{dataset_id}/colab-notebook")
    assert nb_res.status_code == 200
    assert "application/x-ipynb+json" in nb_res.headers["content-type"]
    assert "current_colab_v1_colab_starter.ipynb" in nb_res.headers["content-disposition"]


def test_colab_notebook_endpoint_not_found(client: TestClient):
    """
    Test 404 responses for invalid dataset or version IDs.
    """
    # Non-existent dataset
    res_fake_ds = client.get("/api/v1/datasets/non_existent_id/colab-notebook")
    assert res_fake_ds.status_code == 404

    # Valid dataset, non-existent version
    csv_content = b"x,y\n1,2\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("valid_ds.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]

    res_fake_ver = client.get(f"/api/v1/datasets/{dataset_id}/versions/fake_version_id/colab-notebook")
    assert res_fake_ver.status_code == 404


def test_colab_notebook_oversized_dataset_rejected(monkeypatch, db_session, isolated_storage):
    """
    Verify that if a dataset exceeds the safe notebook embedding limit,
    a clear ValidationError is raised instead of silently truncating or bloating the notebook.
    """
    csv_bytes = b"id,val\n1,10\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Small Dataset",
        original_filename="small.csv",
        content=csv_bytes,
        row_count=1,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    # Temporarily set max upload limit to 5 bytes to simulate oversized dataset
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 5)

    with pytest.raises(ValidationError) as exc_info:
        colab_notebook_generator.generate_notebook(db_session, dataset.id, v1_id)

    assert "exceeds the maximum safe notebook embedding limit" in str(exc_info.value)
