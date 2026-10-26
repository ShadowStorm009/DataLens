import io
import csv
import pandas as pd
from typing import Tuple, List
from backend.app.core.config import settings
from backend.app.core.errors import FileValidationError, FileSizeLimitError

class CSVValidator:
    """Validates uploaded CSV files, safe encodings, headers, and structure."""

    def __init__(self, max_size_bytes: int = None):
        self.max_size_bytes = max_size_bytes or settings.MAX_UPLOAD_SIZE_BYTES

    def validate_and_parse(
        self,
        content: bytes,
        original_filename: str = "dataset.csv"
    ) -> Tuple[pd.DataFrame, bytes, int, int, List[str]]:
        """
        Validates raw uploaded bytes and safely parses them into a DataFrame.
        
        Returns:
            (dataframe, normalized_bytes, row_count, column_count, column_names)
        Raises:
            FileSizeLimitError: if file exceeds size limit.
            FileValidationError: if file is empty, malformed, or has invalid structure.
        """
        # 1. Size Validation
        if len(content) > self.max_size_bytes:
            limit_mb = self.max_size_bytes / (1024 * 1024)
            raise FileSizeLimitError(
                f"File size ({len(content) / (1024 * 1024):.2f} MB) exceeds the maximum allowed limit of {limit_mb:.1f} MB"
            )

        # 2. Empty Content Check
        if not content or not content.strip():
            raise FileValidationError("Uploaded CSV file is empty")

        # 3. Encoding Handling (try UTF-8, UTF-8-sig, then Latin-1)
        text_content = None
        for enc in ["utf-8", "utf-8-sig", "latin-1"]:
            try:
                text_content = content.decode(enc)
                break
            except UnicodeDecodeError:
                continue

        if text_content is None:
            raise FileValidationError("Unable to decode CSV file; file must be UTF-8 or Latin-1 encoded")

        # 4. Preliminary Structure & Header Inspection via csv.reader
        stream = io.StringIO(text_content.strip())
        try:
            sample_reader = csv.reader(stream)
            header_row = next(sample_reader, None)
        except Exception as e:
            raise FileValidationError(f"Malformed CSV header structure: {str(e)}")

        if not header_row:
            raise FileValidationError("Uploaded CSV file contains no headers or data rows")

        # Check for usable columns
        cleaned_headers = []
        seen_headers = {}
        for idx, col in enumerate(header_row):
            col_str = str(col).strip()
            if not col_str:
                col_str = f"unnamed_column_{idx + 1}"
            
            # Deterministic duplicate header resolution
            if col_str in seen_headers:
                seen_headers[col_str] += 1
                col_str = f"{col_str}_{seen_headers[col_str]}"
            else:
                seen_headers[col_str] = 1
            cleaned_headers.append(col_str)

        if not cleaned_headers:
            raise FileValidationError("CSV file contains no usable columns")

        # 5. Full Parse with Pandas
        # Note: We parse with dtype=str initially to preserve leading zeros and exact string values
        stream.seek(0)
        try:
            df = pd.read_csv(
                stream,
                names=cleaned_headers,
                header=0,
                dtype=str,
                keep_default_na=False,
                skipinitialspace=True,
            )
        except pd.errors.EmptyDataError:
            raise FileValidationError("CSV contains headers but no data records")
        except pd.errors.ParserError as pe:
            raise FileValidationError(f"Malformed CSV formatting: {str(pe)}")
        except Exception as e:
            raise FileValidationError(f"Failed to parse CSV file: {str(e)}")

        row_count, col_count = df.shape
        columns_list = list(df.columns)

        # Re-encode normalized CSV bytes with safe UTF-8
        output_buffer = io.StringIO()
        df.to_csv(output_buffer, index=False)
        normalized_bytes = output_buffer.getvalue().encode("utf-8")

        return df, normalized_bytes, row_count, col_count, columns_list

csv_validator = CSVValidator()
