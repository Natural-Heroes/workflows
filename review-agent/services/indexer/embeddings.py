"""Voyage AI embeddings for code."""

import voyageai

from review_agent.shared import get_config


class VoyageEmbeddings:
    """Generate code embeddings using Voyage AI."""

    MODEL = "voyage-code-3"
    DIMENSION = 1024

    def __init__(self):
        config = get_config()
        self.client = voyageai.Client(api_key=config.voyage_api_key)

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        if not texts:
            return []

        # Voyage AI has a limit on batch size
        batch_size = 128
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            result = self.client.embed(
                batch,
                model=self.MODEL,
                input_type="document",
            )
            all_embeddings.extend(result.embeddings)

        return all_embeddings

    async def embed_query(self, query: str) -> list[float]:
        """Generate embedding for a search query."""
        result = self.client.embed(
            [query],
            model=self.MODEL,
            input_type="query",
        )
        return result.embeddings[0]
