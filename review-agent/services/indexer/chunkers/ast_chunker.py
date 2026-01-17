"""Python AST-based chunker."""

import ast
from dataclasses import dataclass


@dataclass
class CodeChunk:
    """A chunk of code with metadata."""

    content: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str  # function, class, method, module
    name: str | None = None
    language: str = "python"


class PythonASTChunker:
    """Chunk Python code using the AST module."""

    def _get_source_segment(
        self, source_lines: list[str], start_line: int, end_line: int
    ) -> str:
        """Extract source code segment from line numbers."""
        # Convert to 0-indexed
        start_idx = start_line - 1
        end_idx = end_line
        return "\n".join(source_lines[start_idx:end_idx])

    def _get_end_line(self, node: ast.AST) -> int:
        """Get the end line of a node, handling decorators."""
        if hasattr(node, "end_lineno") and node.end_lineno:
            return node.end_lineno
        return node.lineno

    def _extract_chunks(
        self,
        node: ast.AST,
        source_lines: list[str],
        file_path: str,
        parent_class: str | None = None,
    ) -> list[CodeChunk]:
        """Recursively extract chunks from AST."""
        chunks = []

        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            # Get start line including decorators
            start_line = node.lineno
            if node.decorator_list:
                start_line = min(d.lineno for d in node.decorator_list)

            end_line = self._get_end_line(node)
            content = self._get_source_segment(source_lines, start_line, end_line)

            chunk_type = "method" if parent_class else "function"
            name = f"{parent_class}.{node.name}" if parent_class else node.name

            chunks.append(
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    chunk_type=chunk_type,
                    name=name,
                )
            )

        elif isinstance(node, ast.ClassDef):
            # Get start line including decorators
            start_line = node.lineno
            if node.decorator_list:
                start_line = min(d.lineno for d in node.decorator_list)

            end_line = self._get_end_line(node)
            content = self._get_source_segment(source_lines, start_line, end_line)

            chunks.append(
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    chunk_type="class",
                    name=node.name,
                )
            )

            # Also extract methods as separate chunks
            for child in ast.iter_child_nodes(node):
                chunks.extend(
                    self._extract_chunks(
                        child, source_lines, file_path, parent_class=node.name
                    )
                )

        else:
            # Recurse into other nodes
            for child in ast.iter_child_nodes(node):
                chunks.extend(
                    self._extract_chunks(
                        child, source_lines, file_path, parent_class=parent_class
                    )
                )

        return chunks

    def chunk(self, content: str, file_path: str) -> list[CodeChunk]:
        """Chunk the given Python content into semantic units."""
        try:
            tree = ast.parse(content)
        except SyntaxError:
            # If parsing fails, return the whole file as a module chunk
            return [
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=1,
                    end_line=content.count("\n") + 1,
                    chunk_type="module",
                    name=file_path.split("/")[-1],
                )
            ]

        source_lines = content.split("\n")
        chunks = self._extract_chunks(tree, source_lines, file_path)

        # If no semantic chunks found, return the whole file as a module chunk
        if not chunks and content.strip():
            chunks = [
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=1,
                    end_line=len(source_lines),
                    chunk_type="module",
                    name=file_path.split("/")[-1],
                )
            ]

        return chunks
