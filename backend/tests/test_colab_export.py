import json
import io
import pytest
from fastapi.testclient import TestClient

from backend.app.services.dataset_service import dataset_service
from backend.app.services.colab_notebook import colab_notebook_generator
from backend.app.services.cleaner import TransformationEngine
from backend.app.core.errors import ResourceNotFoundError

def test_colab_notebook_schema_and_structure(db_session, isolated_storage):
    """
    Verify that generated Colab starter notebook complies with Jupyter notebook v4.5 schema
    and contains all expected sections and cells without embedding raw dataset rows.
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

    # 1. Filenames match expected conventions
    assert nb_filename == "Tech_Salaries_2026_v1_colab_starter.ipynb"
    assert expected_csv == "Tech_Salaries_2026_v1.csv"

    # 2. Valid JSON
    nb_data = json.loads(notebook_json_str)
    assert isinstance(nb_data, dict)

    # 3. Notebook schema compliance
    assert nb_data.get("nbformat") == 4
    assert nb_data.get("nbformat_minor") == 5
    assert "cells" in nb_data
    assert "metadata" in nb_data
    assert nb_data["metadata"]["kernelspec"]["name"] == "python3"
    assert nb_data["metadata"]["language_info"]["name"] == "python"

    cells = nb_data["cells"]
    assert len(cells) >= 12

    # 4. Invariant checks for code cells
    for cell in cells:
        assert "cell_type" in cell
        assert "source" in cell
        if cell["cell_type"] == "code":
            assert cell.get("execution_count") is None
            assert cell.get("outputs") == []

    # 5. Concatenate all code and markdown text to check contents
    all_text = ""
    for cell in cells:
        all_text += "".join(cell["source"]) + "\n"

    # Header & instructions
    assert "DataLens Handoff: Dataset Analysis & Machine Learning" in all_text
    assert "Tech Salaries 2026" in all_text
    assert "Tech_Salaries_2026_v1.csv" in all_text

    # Upload step using official Colab API
    assert "google.colab" in all_text
    assert "files.upload()" in all_text

    # DataFrame loading
    assert "pd.read_csv" in all_text

    # Overview steps
    assert "df.head()" in all_text
    assert "df.info()" in all_text
    assert "missing" in all_text.lower()
    assert "df.describe(" in all_text

    # Required placeholder sections
    assert "Exploratory Data Analysis" in all_text
    assert "Feature Engineering" in all_text
    assert "Train / Test Split" in all_text
    assert "Model Training" in all_text

    # 6. Privacy & Security checks: no embedded raw data, no server paths
    assert "Astronaut" not in all_text
    assert "Neurosurgeon" not in all_text
    assert "Pilot" not in all_text
    assert "/home/ritansh" not in all_text
    assert "/tmp/" not in all_text
    assert "password" not in all_text.lower()
    assert "secret" not in all_text.lower()


def test_colab_notebook_version_parity(db_session, isolated_storage):
    """
    Verify that notebooks generated for different versions (v1 vs v2)
    properly reflect their respective version numbers and filenames.
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

    # Create v2 via transformation
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
    assert fn_v1 == "Parity_Dataset_v1_colab_starter.ipynb"
    assert csv_v1 == "Parity_Dataset_v1.csv"
    assert "Version 1 (Original Upload)" in nb_v1_str
    assert "Parity_Dataset_v1.csv" in nb_v1_str

    # Generate v2 notebook
    nb_v2_str, fn_v2, csv_v2 = colab_notebook_generator.generate_notebook(db_session, dataset.id, v2_id)
    assert fn_v2 == "Parity_Dataset_v2_colab_starter.ipynb"
    assert csv_v2 == "Parity_Dataset_v2.csv"
    assert "Version 2 (Cleaned/Transformed)" in nb_v2_str
    assert "Cleaned via 'remove_duplicates'" in nb_v2_str
    assert "Parity_Dataset_v2.csv" in nb_v2_str


def test_colab_notebook_endpoint_by_version(client: TestClient):
    """
    Test GET /api/v1/datasets/{dataset_id}/versions/{version_id}/colab-notebook.
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

    # Verify JSON structure
    nb_json = nb_res.json()
    assert nb_json["nbformat"] == 4
    assert len(nb_json["cells"]) > 0


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
