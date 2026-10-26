import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

from backend.app.services.cleaner import TransformationEngine, TransformationResult
from backend.app.core.errors import ValidationError

# ==========================================
# Unit Tests for TransformationEngine
# ==========================================

def test_impute_median_success():
    # 5 numbers: 10, 20, 30, 40, 50 -> median = 30
    df = pd.DataFrame({
        "vals": ["10", "20", "", "40", "50", "nan"],
        "other": ["a", "b", "c", "d", "e", "f"],
    })
    res = TransformationEngine.transform(df, "impute_median", column_name="vals")

    assert res.rows_affected == 2
    assert res.cells_affected == 2
    assert res.details["imputed_value"] == "30"
    assert res.df["vals"].tolist() == ["10", "20", "30", "40", "50", "30"]
    assert len(res.sample_diff) == 2

def test_impute_median_error_on_non_numeric():
    df = pd.DataFrame({"text": ["apple", "banana", "", "cherry"]})
    with pytest.raises(ValidationError, match="contains no valid numeric values"):
        TransformationEngine.transform(df, "impute_median", column_name="text")

def test_impute_median_error_on_all_missing():
    df = pd.DataFrame({"empty": ["", "nan", None]})
    with pytest.raises(ValidationError, match="entirely missing/empty"):
        TransformationEngine.transform(df, "impute_median", column_name="empty")

def test_impute_mode_success():
    # Mode is "apple" (appears 3 times vs banana 1 time)
    df = pd.DataFrame({
        "fruit": ["apple", "banana", "apple", "", "apple", "nan"],
    })
    res = TransformationEngine.transform(df, "impute_mode", column_name="fruit")

    assert res.rows_affected == 2
    assert res.cells_affected == 2
    assert res.details["imputed_value"] == "apple"
    assert res.df["fruit"].tolist() == ["apple", "banana", "apple", "apple", "apple", "apple"]

def test_impute_mode_error_on_all_missing():
    df = pd.DataFrame({"empty": ["", "nan", None]})
    with pytest.raises(ValidationError, match="entirely missing/empty"):
        TransformationEngine.transform(df, "impute_mode", column_name="empty")

def test_remove_duplicates_success():
    df = pd.DataFrame({
        "a": [1, 2, 1, 3, 2],
        "b": ["x", "y", "x", "z", "y"],
    })
    res = TransformationEngine.transform(df, "remove_duplicates")

    assert res.rows_affected == 2  # rows 2 and 4 are duplicates
    assert len(res.df) == 3
    assert res.df["a"].tolist() == [1, 2, 3]
    assert len(res.sample_diff) == 2

def test_drop_constant_column_success():
    df = pd.DataFrame({
        "constant": ["ACTIVE", "ACTIVE", "ACTIVE"],
        "varying": [1, 2, 3],
    })
    res = TransformationEngine.transform(df, "drop_constant_column", column_name="constant")

    assert res.rows_affected == 3
    assert "constant" not in res.df.columns
    assert list(res.df.columns) == ["varying"]

def test_drop_constant_column_error_on_varying():
    df = pd.DataFrame({
        "not_constant": ["A", "B", "A"],
        "other": [1, 2, 3],
    })
    with pytest.raises(ValidationError, match="as constant"):
        TransformationEngine.transform(df, "drop_constant_column", column_name="not_constant")

def test_drop_constant_column_error_on_single_column_dataset():
    df = pd.DataFrame({"only_col": ["A", "A"]})
    with pytest.raises(ValidationError, match="must retain at least one column"):
        TransformationEngine.transform(df, "drop_constant_column", column_name="only_col")

def test_transformation_engine_does_not_mutate_input():
    original = pd.DataFrame({
        "num": ["10", None, "30"],
        "const": ["X", "X", "X"],
    })
    copied = original.copy(deep=True)

    TransformationEngine.transform(original, "impute_median", column_name="num")
    pd.testing.assert_frame_equal(original, copied)

# ==========================================
# Integration Tests for Transformation Routes
# ==========================================

def test_transformation_preview_and_apply_lifecycle(client: TestClient):
    csv_content = (
        "id,score,status,constant\n"
        "1,10.0,ACTIVE,FIXED\n"
        "2,20.0,ACTIVE,FIXED\n"
        "3,,ACTIVE,FIXED\n"  # missing score
        "4,40.0,ACTIVE,FIXED\n"
        "1,10.0,ACTIVE,FIXED\n"  # duplicate row
    )

    # 1. Upload initial dataset (Version 1)
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("clean_test.csv", csv_content.encode("utf-8"), "text/csv")},
        data={"name": "Cleaning Lifecycle Dataset"},
    )
    assert upload_res.status_code == 201
    dataset = upload_res.json()
    dataset_id = dataset["id"]
    v1_id = dataset["current_version_id"]
    assert dataset["row_count"] == 5

    # 2. Preview Median Imputation (Non-Mutating)
    preview_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={
            "operation_type": "impute_median",
            "column_name": "score",
        },
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert preview_data["rows_affected"] == 1
    assert preview_data["cells_affected"] == 1
    assert len(preview_data["sample_diff"]) == 1
    assert preview_data["sample_diff"][0]["before"] == ""
    # Median of [10.0, 20.0, 40.0, 10.0] is 15.0
    assert float(preview_data["sample_diff"][0]["after"]) == 15.0

    # 3. Verify original dataset is completely unchanged in storage
    v1_preview = client.get(f"/api/v1/datasets/{dataset_id}/preview")
    assert v1_preview.status_code == 200
    assert v1_preview.json()["total_rows"] == 5
    # The missing cell in v1 must still be None
    assert v1_preview.json()["rows"][2]["score"] is None

    # Verify version count is still 1
    versions_res = client.get(f"/api/v1/datasets/{dataset_id}/versions")
    assert len(versions_res.json()) == 1

    # 4. Apply Median Imputation (creates Version 2)
    apply_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={
            "operation_type": "impute_median",
            "column_name": "score",
        },
    )
    assert apply_res.status_code == 201
    apply_data = apply_res.json()
    v2_id = apply_data["result_version_id"]
    assert apply_data["source_version_id"] == v1_id
    assert apply_data["rows_affected"] == 1

    # Verify dataset current_version_id has been promoted to v2
    ds_detail = client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert ds_detail["current_version_id"] == v2_id

    # Verify both versions exist
    versions_after = client.get(f"/api/v1/datasets/{dataset_id}/versions").json()
    assert len(versions_after) == 2
    assert versions_after[0]["version_number"] == 1
    assert versions_after[1]["version_number"] == 2

    # Verify v2 preview now has imputed value
    v2_preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?version_id={v2_id}").json()
    assert float(v2_preview["rows"][2]["score"]) == 15.0

    # Verify original v1 preview STILL has null value
    v1_preview_again = client.get(f"/api/v1/datasets/{dataset_id}/preview?version_id={v1_id}").json()
    assert v1_preview_again["rows"][2]["score"] is None

    # 5. Apply Remove Duplicates on Version 2 (creates Version 3)
    dedup_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "remove_duplicates"},
    )
    assert dedup_res.status_code == 201
    v3_id = dedup_res.json()["result_version_id"]

    ds_v3 = client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert ds_v3["current_version_id"] == v3_id
    assert ds_v3["row_count"] == 4  # 1 duplicate row dropped

    # 6. Apply Drop Constant Column on Version 3 (creates Version 4)
    drop_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "drop_constant_column", "column_name": "constant"},
    )
    assert drop_res.status_code == 201
    v4_id = drop_res.json()["result_version_id"]

    ds_v4 = client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert ds_v4["current_version_id"] == v4_id
    assert ds_v4["column_count"] == 3  # "constant" dropped

    # 7. Check transformation audit trail
    history_res = client.get(f"/api/v1/datasets/{dataset_id}/transformations")
    assert history_res.status_code == 200
    history = history_res.json()
    assert history["total"] == 3
    assert [t["operation_type"] for t in history["transformations"]] == [
        "impute_median",
        "remove_duplicates",
        "drop_constant_column",
    ]

def test_transformation_error_handling(client: TestClient):
    csv_content = "a,b\n1,x\n2,y\n"
    upload = client.post(
        "/api/v1/datasets",
        files={"file": ("err_test.csv", csv_content.encode("utf-8"), "text/csv")},
        data={"name": "Error Dataset"},
    ).json()
    dataset_id = upload["id"]

    # Nonexistent column
    err1 = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={"operation_type": "impute_median", "column_name": "nonexistent"},
    )
    assert err1.status_code == 400

    # Dropping non-constant column
    err2 = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={"operation_type": "drop_constant_column", "column_name": "a"},
    )
    assert err2.status_code == 400

    # Unsupported operation
    err3 = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={"operation_type": "arbitrary_magic"},
    )
    assert err3.status_code == 400
