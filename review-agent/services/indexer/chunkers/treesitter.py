"""Tree-sitter based chunker for TypeScript and JavaScript."""

from dataclasses import dataclass
from typing import Iterator

import tree_sitter_javascript as tsjs
import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser


@dataclass
class CodeChunk:
    """A chunk of code with metadata."""

    content: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str  # function, class, method, module
    name: str | None = None
    language: str = "unknown"


class TreeSitterChunker:
    """Chunk TypeScript and JavaScript code using tree-sitter."""

    def __init__(self):
        self._js_language = Language(tsjs.language())
        self._ts_language = Language(tsts.language_typescript())
        self._tsx_language = Language(tsts.language_tsx())

        self._js_parser = Parser(self._js_language)
        self._ts_parser = Parser(self._ts_language)
        self._tsx_parser = Parser(self._tsx_language)

    def _get_parser(self, file_path: str) -> tuple[Parser, str]:
        """Get the appropriate parser based on file extension."""
        if file_path.endswith(".tsx"):
            return self._tsx_parser, "tsx"
        elif file_path.endswith(".ts"):
            return self._ts_parser, "typescript"
        elif file_path.endswith(".jsx"):
            return self._js_parser, "jsx"
        else:
            return self._js_parser, "javascript"

    def _extract_name(self, node, source: bytes) -> str | None:
        """Extract the name from a node."""
        # Try to find identifier or property_identifier child
        for child in node.children:
            if child.type in ("identifier", "property_identifier"):
                return source[child.start_byte : child.end_byte].decode("utf-8")

            # For variable declarations, look deeper
            if child.type == "variable_declarator":
                for subchild in child.children:
                    if subchild.type in ("identifier", "property_identifier"):
                        return source[subchild.start_byte : subchild.end_byte].decode(
                            "utf-8"
                        )

        return None

    def _get_chunk_type(self, node_type: str) -> str:
        """Map tree-sitter node type to chunk type."""
        mapping = {
            "function_declaration": "function",
            "function_expression": "function",
            "arrow_function": "function",
            "method_definition": "method",
            "class_declaration": "class",
            "class_expression": "class",
            "interface_declaration": "interface",
            "type_alias_declaration": "type",
            "enum_declaration": "enum",
            "export_statement": "export",
            "lexical_declaration": "variable",
            "variable_declaration": "variable",
        }
        return mapping.get(node_type, "other")

    def _should_chunk(self, node) -> bool:
        """Determine if a node should be extracted as a chunk."""
        chunkable_types = {
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
            "class_declaration",
            "class_expression",
            "interface_declaration",
            "type_alias_declaration",
            "enum_declaration",
        }
        return node.type in chunkable_types

    def _walk_tree(
        self, node, source: bytes, file_path: str, language: str
    ) -> Iterator[CodeChunk]:
        """Walk the tree and yield chunks."""
        if self._should_chunk(node):
            content = source[node.start_byte : node.end_byte].decode("utf-8")

            # Skip very small chunks (likely noise)
            if len(content.strip()) > 20:
                yield CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    chunk_type=self._get_chunk_type(node.type),
                    name=self._extract_name(node, source),
                    language=language,
                )

        # Recurse into children
        for child in node.children:
            yield from self._walk_tree(child, source, file_path, language)

    def chunk(self, content: str, file_path: str) -> list[CodeChunk]:
        """Chunk the given content into semantic units."""
        parser, language = self._get_parser(file_path)
        source = content.encode("utf-8")
        tree = parser.parse(source)

        chunks = list(self._walk_tree(tree.root_node, source, file_path, language))

        # If no semantic chunks found, return the whole file as a module chunk
        if not chunks and content.strip():
            chunks = [
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=1,
                    end_line=content.count("\n") + 1,
                    chunk_type="module",
                    name=file_path.split("/")[-1],
                    language=language,
                )
            ]

        return chunks
