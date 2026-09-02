# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **MCP (Model Context Protocol) server** that exposes document-related tools through a FastMCP interface. It converts binary documents (DOCX, PDF) to markdown and provides utility tools (like math operations). The server can be integrated with AI assistants via MCP clients.

**Tech Stack**: Python 3.10+, FastMCP, Pydantic, markitdown

## Code Standards

**Always apply appropriate type annotations to function arguments and return values.** Type hints improve clarity, enable IDE support, and catch errors at static-analysis time.

## Development Commands

### Setup
```bash
uv venv                    # Create virtual environment
source .venv/bin/activate  # Activate (macOS/Linux)
uv pip install -e .        # Editable install of the package
```

### Running & Testing
```bash
uv run pytest              # Run all tests
uv run pytest -k test_name # Run a specific test by name
uv run main.py             # Start the MCP server
```

**Note**: `uv run` syncs dependencies from `uv.lock` (may differ slightly from the pip install). Both paths work; for consistency, either use `uv sync` instead of `uv pip install -e .`, or use `.venv/bin/pytest` instead of `uv run pytest`.

## Architecture

### Tool Registration Pattern

Tools are registered with the MCP server in `main.py`:

```python
from mcp.server.fastmcp import FastMCP
from tools.math import add

mcp = FastMCP("docs")
mcp.tool()(add)  # Decorator-based registration

if __name__ == "__main__":
    mcp.run()
```

New tools must be:
1. Defined as functions in the `tools/` directory
2. Imported in `main.py`
3. Registered with `@mcp.tool()` decorator or `mcp.tool()(function)`

### Tool Definition Requirements

Tools are exposed to AI assistants, so documentation is critical. Follow this structure strictly:

```python
from pydantic import Field

def tool_name(
    param1: str = Field(description="Detailed description of this parameter"),
    param2: int = Field(description="Explain what this parameter does")
) -> ReturnType:
    """One-line summary.

    Detailed explanation of what this tool does, how it works, and what it returns.

    When to use:
    - Specific use case 1
    - Specific use case 2

    When NOT to use:
    - Scenario where this tool is inappropriate

    Examples:
    >>> tool_name("input", 42)
    expected_output
    """
    # Implementation
    return result
```

**Key points**:
- Use `Field` from pydantic for ALL parameters (even if no default)
- Docstring must start with a one-line summary
- Include detailed explanation of functionality
- Explicitly document when to use (and not use) the tool
- Provide concrete usage examples with expected output
- Parameter descriptions go in `Field`, not the docstring

**Example** (`tools/math.py`):
```python
def add(
    a: float = Field(description="First number to add"),
    b: float = Field(description="Second number to add"),
) -> float:
    """Add two numbers together.

    Takes two numerical inputs and returns their sum. This tool handles
    integers and floating point numbers.

    When to use:
    - When you need to perform simple addition
    - When you need precise numerical calculation

    Examples:
    >>> add(2, 3)
    5.0
    >>> add(2.5, 3.5)
    6.0
    """
    return a + b
```

### Document Conversion

The `tools/document.py` module uses **markitdown** to convert binary documents:
- Supports DOCX (Word) and PDF formats
- Takes binary data + file extension, returns markdown text
- Used in tests via fixtures in `tests/fixtures/`

The markitdown library is configured in `pyproject.toml` with extras: `markitdown[docx,pdf]>=0.1.1`

## File Structure

```
app_starter/
├── main.py                 # MCP server entry point, tool registration
├── tools/
│   ├── __init__.py
│   ├── math.py            # Example tool: add()
│   └── document.py        # Document conversion: binary_document_to_markdown()
├── tests/
│   ├── __init__.py
│   ├── test_document.py   # Tests for document conversion
│   └── fixtures/          # Test data (mcp_docs.docx, mcp_docs.pdf)
├── pyproject.toml         # Project metadata and dependencies
└── README.md              # Setup and development guidance
```

## Testing

Tests are in `tests/test_document.py` and use fixtures in `tests/fixtures/`:
- Verify tool output is valid (not None, correct type)
- Document conversion tests check for expected markdown formatting (headers, lists, etc.)
- Run tests before committing: `uv run pytest`

## Dependencies

Core dependencies (see `pyproject.toml`):
- **mcp[cli]==1.8.0** — Model Context Protocol framework
- **markitdown[docx,pdf]>=0.1.1** — Document-to-markdown conversion (pulls numpy, onnxruntime, etc.)
- **pydantic>=2.11.3** — Data validation and parameter documentation
- **pytest>=8.3.5** — Testing framework
