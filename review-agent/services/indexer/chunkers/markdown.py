"""Markdown chunker for documentation files."""

import re
from dataclasses import dataclass


@dataclass
class CodeChunk:
    """A chunk of content with metadata."""

    content: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str  # section, code_block, document
    name: str | None = None
    language: str = "markdown"


class MarkdownChunker:
    """Chunk Markdown files by headers and code blocks."""

    def chunk(self, content: str, file_path: str) -> list[CodeChunk]:
        """Chunk the given Markdown content."""
        chunks = []
        lines = content.split("\n")

        current_section: list[str] = []
        current_section_name: str | None = None
        current_section_start: int = 1

        header_pattern = re.compile(r"^(#{1,6})\s+(.+)$")

        for i, line in enumerate(lines):
            line_num = i + 1
            header_match = header_pattern.match(line)

            if header_match:
                # Save previous section if it has content
                if current_section and any(s.strip() for s in current_section):
                    section_content = "\n".join(current_section)
                    chunks.append(
                        CodeChunk(
                            content=section_content,
                            file_path=file_path,
                            start_line=current_section_start,
                            end_line=line_num - 1,
                            chunk_type="section",
                            name=current_section_name,
                        )
                    )

                # Start new section
                current_section = [line]
                current_section_name = header_match.group(2).strip()
                current_section_start = line_num
            else:
                current_section.append(line)

        # Don't forget the last section
        if current_section and any(s.strip() for s in current_section):
            section_content = "\n".join(current_section)
            chunks.append(
                CodeChunk(
                    content=section_content,
                    file_path=file_path,
                    start_line=current_section_start,
                    end_line=len(lines),
                    chunk_type="section",
                    name=current_section_name,
                )
            )

        # If no sections found, return whole document
        if not chunks and content.strip():
            chunks = [
                CodeChunk(
                    content=content,
                    file_path=file_path,
                    start_line=1,
                    end_line=len(lines),
                    chunk_type="document",
                    name=file_path.split("/")[-1],
                )
            ]

        return chunks
