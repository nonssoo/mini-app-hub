from markitdown import MarkItDown, StreamInfo
from io import BytesIO
from pathlib import Path
from pydantic import Field


def binary_document_to_markdown(binary_data: bytes, file_type: str) -> str:
    """Converts binary document data to markdown-formatted text."""
    md = MarkItDown()
    file_obj = BytesIO(binary_data)
    stream_info = StreamInfo(extension=file_type)
    result = md.convert(file_obj, stream_info=stream_info)
    return result.text_content


def document_path_to_markdown(
    file_path: str = Field(description="Path to the document file (DOCX or PDF)")
) -> str:
    """Convert a document file to markdown-formatted text.

    Reads a document file from the filesystem and converts its contents to
    markdown format. Supports DOCX (Word) and PDF formats. The file type is
    automatically detected from the file extension.

    When to use:
    - When you have a local document file path and need to extract its content as markdown
    - When you want to process multiple documents in batch workflows
    - When integrating with file-based document pipelines

    When NOT to use:
    - For documents already loaded in memory (use binary_document_to_markdown instead)
    - For documents without standard extensions

    Examples:
    >>> document_path_to_markdown("/path/to/document.pdf")
    '# Document Title\\n\\nContent here...'
    >>> document_path_to_markdown("/home/user/report.docx")
    '# Report\\n\\nSection 1\\n...'
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {file_path}")

    file_extension = path.suffix.lstrip(".")
    if not file_extension:
        raise ValueError(f"Cannot determine file type from path: {file_path}")

    binary_data = path.read_bytes()
    return binary_document_to_markdown(binary_data, file_extension)
