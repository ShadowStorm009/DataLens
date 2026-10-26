import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient
from backend.app.audit.profiling import profiling_engine

def test_hand_calculated_numeric_and_dataset_metrics():
    """
    Test profiling against exact, hand-calculated statistical values.
    Row count: 6, Columns: 4 (including 1 duplicate row).
    """
    df = pd.DataFrame({
        "age": ["10", "20", "30", "40", "", "10"],  # row 5 is duplicate of row 0; row 4 is empty (null)
        "department": ["Sales", "Engineering", "Sales", "HR", "Sales", "Sales"],
        "is_active": ["true", "false", "true", "true", "false", "true"],
        "joined_date": ["2026-01-01", "2026-01-10", "2026-01-15", "2026-01-20", "not_a_date", "2026-01-01"],
    })

    profile = profiling_engine.profile_dataframe(df)

    assert profile["row_count"] == 6
    assert profile["column_count"] == 4
    assert profile["total_cells"] == 24
    # Missing cells: age has 1 empty string
    assert profile["missing_cells"] == 1
    assert round(profile["missing_percentage"], 2) == round(1 / 24 * 100, 2)
    # Exact duplicate row: row 5 ("10", "Sales", "true", "2026-01-01") is duplicate of row 0
    assert profile["duplicate_rows"] == 1

    # Verify column types
    col_map = {col["name"]: col for col in profile["columns"]}
    assert col_map["age"]["inferred_type"] == "numeric"
    assert col_map["department"]["inferred_type"] == "categorical"
    assert col_map["is_active"]["inferred_type"] == "boolean"
    assert col_map["joined_date"]["inferred_type"] == "datetime"

    # Verify hand-calculated numeric stats for 'age':
    # Values: [10, 20, 30, 40, 10] -> count = 5
    # sorted: 10, 10, 20, 30, 40
    # min: 10.0, max: 40.0, mean: 110/5 = 22.0, median: 20.0
    age_stats = col_map["age"]["numeric_stats"]
    assert age_stats["min"] == 10.0
    assert age_stats["max"] == 40.0
    assert age_stats["mean"] == 22.0
    assert age_stats["median"] == 20.0
    assert age_stats["missing_count"] == 1
    assert age_stats["distinct_count"] == 4

    # Verify categorical top values for 'department':
    # Counts: Sales (4), Engineering (1), HR (1) -> total valid = 6
    dept_stats = col_map["department"]["categorical_stats"]
    assert dept_stats["distinct_count"] == 3
    assert dept_stats["missing_count"] == 0
    assert dept_stats["top_values"][0]["value"] == "Sales"
    assert dept_stats["top_values"][0]["count"] == 4
    assert dept_stats["top_values"][0]["percentage"] == round(4 / 6 * 100, 2)

    # Verify datetime stats for 'joined_date':
    # 5 valid dates, 1 invalid ("not_a_date")
    date_stats = col_map["joined_date"]["datetime_stats"]
    assert date_stats["invalid_date_count"] == 1
    assert "2026-01-01" in date_stats["min_date"]
    assert "2026-01-20" in date_stats["max_date"]

def test_profiling_edge_cases_resilience():
    """
    Test that unusual data structures and edge cases do not crash the engine:
    - All-null column
    - Constant column (single value)
    - Single-row dataset
    - Infinite numbers
    - Empty columns
    """
    edge_df = pd.DataFrame({
        "all_null": [None, "", "NaN", None],
        "constant": ["X", "X", "X", "X"],
        "infinite": ["1.0", "inf", "-inf", "4.0"],
        "mixed": ["100", "twenty", "300", "four"],
    })

    # Should profile without raising any exception
    profile = profiling_engine.profile_dataframe(edge_df)
    assert profile["row_count"] == 4
    assert profile["column_count"] == 4

    col_map = {col["name"]: col for col in profile["columns"]}
    assert col_map["all_null"]["null_count"] == 4
    assert col_map["constant"]["distinct_count"] == 1
    assert col_map["constant"]["inferred_type"] in ["categorical", "text"]

    # One-row dataset
    one_row_df = pd.DataFrame({"single_num": [42], "single_cat": ["A"]})
    one_profile = profiling_engine.profile_dataframe(one_row_df)
    assert one_profile["row_count"] == 1
    num_stats = one_profile["columns"][0]["numeric_stats"]
    assert num_stats["mean"] == 42.0
    assert num_stats["std"] == 0.0

def test_profile_api_endpoint_and_caching(client: TestClient, db_session, isolated_storage):
    """Test calling the profile endpoint generates and caches valid results."""
    csv_bytes = b"id,val,category\n1,100,Alpha\n2,200,Beta\n3,300,Alpha\n"
    files = {"file": ("test_prof.csv", csv_bytes, "text/csv")}

    upload_res = client.post("/api/v1/datasets", files=files)
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["id"]

    # First call: computes and caches profile
    res1 = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["row_count"] == 3
    assert data1["column_count"] == 3
    assert data1["total_cells"] == 9
    assert data1["missing_cells"] == 0
    assert len(data1["columns"]) == 3

    # Verify cache file was created
    version_id = data1["version_id"]
    cache_file = isolated_storage.base_dir / f"{version_id}.profile.json"
    assert cache_file.exists()

    # Second call: reads from cache cleanly
    res2 = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2 == data1
