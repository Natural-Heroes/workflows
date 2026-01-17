"""Indexer service main module."""

import asyncio
import logging
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)

from review_agent.shared import get_config, GitHubClient

from .chunkers import TreeSitterChunker, PythonASTChunker, MarkdownChunker
from .embeddings import VoyageEmbeddings

logger = logging.getLogger(__name__)


class CodebaseIndexer:
    """Index a codebase into Qdrant for semantic search."""

    SUPPORTED_EXTENSIONS = {
        # TypeScript/JavaScript
        ".ts": TreeSitterChunker,
        ".tsx": TreeSitterChunker,
        ".js": TreeSitterChunker,
        ".jsx": TreeSitterChunker,
        # Python
        ".py": PythonASTChunker,
        # Markdown
        ".md": MarkdownChunker,
    }

    def __init__(self):
        self.config = get_config()
        self.qdrant = QdrantClient(url=self.config.qdrant_url)
        self.embeddings = VoyageEmbeddings()
        self._chunkers: dict = {}

    def _get_chunker(self, file_path: str):
        """Get the appropriate chunker for a file."""
        ext = Path(file_path).suffix.lower()
        chunker_class = self.SUPPORTED_EXTENSIONS.get(ext)

        if not chunker_class:
            return None

        if chunker_class not in self._chunkers:
            self._chunkers[chunker_class] = chunker_class()

        return self._chunkers[chunker_class]

    def _collection_name(self, owner: str, repo: str) -> str:
        """Generate collection name for a repository."""
        return f"{owner}_{repo}".replace("-", "_").lower()

    async def ensure_collection(self, owner: str, repo: str) -> str:
        """Ensure the collection exists for a repository."""
        collection_name = self._collection_name(owner, repo)

        collections = self.qdrant.get_collections().collections
        existing_names = {c.name for c in collections}

        if collection_name not in existing_names:
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=VoyageEmbeddings.DIMENSION,
                    distance=Distance.COSINE,
                ),
            )
            logger.info(f"Created collection: {collection_name}")

        return collection_name

    async def index_file(
        self,
        owner: str,
        repo: str,
        file_path: str,
        content: str,
        ref: str,
    ) -> int:
        """Index a single file into the collection."""
        chunker = self._get_chunker(file_path)
        if not chunker:
            return 0

        chunks = chunker.chunk(content, file_path)
        if not chunks:
            return 0

        # Generate embeddings
        texts = [chunk.content for chunk in chunks]
        embeddings = await self.embeddings.embed_texts(texts)

        # Prepare points for Qdrant
        collection_name = self._collection_name(owner, repo)
        points = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = hash(f"{file_path}:{chunk.start_line}:{ref}") % (2**63)

            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "file_path": chunk.file_path,
                        "start_line": chunk.start_line,
                        "end_line": chunk.end_line,
                        "chunk_type": chunk.chunk_type,
                        "name": chunk.name,
                        "language": chunk.language,
                        "content": chunk.content[:5000],  # Limit content size
                        "ref": ref,
                        "owner": owner,
                        "repo": repo,
                    },
                )
            )

        # Upsert points
        self.qdrant.upsert(collection_name=collection_name, points=points)

        logger.info(f"Indexed {len(points)} chunks from {file_path}")
        return len(points)

    async def index_repository(
        self,
        owner: str,
        repo: str,
        ref: str = "main",
    ) -> int:
        """Index an entire repository."""
        github = GitHubClient()
        await self.ensure_collection(owner, repo)

        # Get repository tree
        tree = await github._request(
            "GET",
            f"/repos/{owner}/{repo}/git/trees/{ref}",
            params={"recursive": "1"},
        )

        total_chunks = 0

        for item in tree.get("tree", []):
            if item["type"] != "blob":
                continue

            file_path = item["path"]
            ext = Path(file_path).suffix.lower()

            if ext not in self.SUPPORTED_EXTENSIONS:
                continue

            try:
                content = await github.get_file_content(owner, repo, file_path, ref)
                chunks_indexed = await self.index_file(
                    owner, repo, file_path, content, ref
                )
                total_chunks += chunks_indexed
            except Exception as e:
                logger.error(f"Failed to index {file_path}: {e}")

        logger.info(
            f"Indexed {total_chunks} chunks from {owner}/{repo}@{ref}"
        )
        return total_chunks

    async def search(
        self,
        owner: str,
        repo: str,
        query: str,
        limit: int = 10,
    ) -> list[dict]:
        """Search for relevant code chunks."""
        collection_name = self._collection_name(owner, repo)
        query_embedding = await self.embeddings.embed_query(query)

        results = self.qdrant.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=limit,
        )

        return [
            {
                "score": result.score,
                **result.payload,
            }
            for result in results
        ]

    async def delete_file(self, owner: str, repo: str, file_path: str) -> int:
        """Delete all chunks for a file."""
        collection_name = self._collection_name(owner, repo)

        # Delete by filter
        self.qdrant.delete(
            collection_name=collection_name,
            points_selector={
                "filter": {
                    "must": [{"key": "file_path", "match": {"value": file_path}}]
                }
            },
        )

        logger.info(f"Deleted chunks for {file_path}")
        return 1


# CLI for manual indexing
async def main():
    """CLI entry point for manual indexing."""
    import argparse

    parser = argparse.ArgumentParser(description="Index a repository")
    parser.add_argument("owner", help="Repository owner")
    parser.add_argument("repo", help="Repository name")
    parser.add_argument("--ref", default="main", help="Git ref to index")

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    indexer = CodebaseIndexer()
    total = await indexer.index_repository(
        args.owner,
        args.repo,
        args.ref,
    )
    print(f"Indexed {total} chunks")


if __name__ == "__main__":
    asyncio.run(main())
