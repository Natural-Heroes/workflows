"""Codebase search tools using Qdrant."""

from qdrant_client import QdrantClient
import voyageai

from review_agent.shared import get_config


def get_qdrant_client() -> QdrantClient:
    """Get Qdrant client."""
    config = get_config()
    return QdrantClient(url=config.qdrant_url)


def get_voyage_client() -> voyageai.Client:
    """Get Voyage AI client."""
    config = get_config()
    return voyageai.Client(api_key=config.voyage_api_key)


def _collection_name(owner: str, repo: str) -> str:
    """Generate collection name for a repository."""
    return f"{owner}_{repo}".replace("-", "_").lower()


# Tool definitions for Claude
SEARCH_CODEBASE_TOOL = {
    "name": "search_codebase",
    "description": "Search the codebase for relevant code using semantic search. Use this to find related functions, types, tests, or any code that might be relevant to the current review context.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query to search for relevant code (e.g., 'functions that handle user authentication', 'tests for the checkout flow')",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results to return (default: 5)",
                "default": 5,
            },
        },
        "required": ["query"],
    },
}


GET_FILE_CONTENT_TOOL = {
    "name": "get_file_content",
    "description": "Get the full content of a specific file from the repository. Use this when you need to see more context around a specific code location.",
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file in the repository",
            },
        },
        "required": ["file_path"],
    },
}


async def search_codebase(
    owner: str,
    repo: str,
    query: str,
    limit: int = 5,
) -> list[dict]:
    """
    Search the codebase for relevant code chunks.

    Args:
        owner: Repository owner
        repo: Repository name
        query: Search query
        limit: Maximum results to return

    Returns:
        List of relevant code chunks with metadata
    """
    qdrant = get_qdrant_client()
    voyage = get_voyage_client()
    collection_name = _collection_name(owner, repo)

    # Check if collection exists
    try:
        collections = qdrant.get_collections().collections
        if collection_name not in {c.name for c in collections}:
            return [{"error": f"Repository {owner}/{repo} not indexed yet"}]
    except Exception as e:
        return [{"error": f"Qdrant connection error: {e}"}]

    # Generate query embedding
    result = voyage.embed(
        [query],
        model="voyage-code-3",
        input_type="query",
    )
    query_embedding = result.embeddings[0]

    # Search Qdrant
    results = qdrant.search(
        collection_name=collection_name,
        query_vector=query_embedding,
        limit=limit,
    )

    return [
        {
            "file_path": r.payload.get("file_path"),
            "start_line": r.payload.get("start_line"),
            "end_line": r.payload.get("end_line"),
            "chunk_type": r.payload.get("chunk_type"),
            "name": r.payload.get("name"),
            "language": r.payload.get("language"),
            "content": r.payload.get("content"),
            "score": r.score,
        }
        for r in results
    ]


async def get_file_content(
    owner: str,
    repo: str,
    file_path: str,
    ref: str,
) -> str:
    """
    Get the full content of a file from GitHub.

    Args:
        owner: Repository owner
        repo: Repository name
        file_path: Path to the file
        ref: Git ref (branch, tag, commit)

    Returns:
        File content as string
    """
    from review_agent.shared import GitHubClient

    github = GitHubClient()
    return await github.get_file_content(owner, repo, file_path, ref)
